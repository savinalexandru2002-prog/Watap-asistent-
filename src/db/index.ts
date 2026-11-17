import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _drizzleDb: any | undefined;
}

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export function isTransientDbError(err: any): boolean {
  const parts = [
    err?.message,
    err?.code,
    err?.cause?.message,
    err?.cause?.code,
  ]
    .filter(Boolean)
    .join(' ');
  return /ENOENT|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|terminating|connection|timeout|socket|57P01|57P02|57P03|08006|08003|08000/i.test(
    parts
  );
}

export const createPool = () => {
  if (!global._postgresPool || global._postgresPool.ended) {
    const newPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 20000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      allowExitOnIdle: false,
    });

    newPool.on('error', (err: any) => {
      console.warn('Idle SQL pool client reset:', err?.message || err);
      if (global._postgresPool === newPool) {
        global._postgresPool = undefined;
        global._drizzleDb = undefined;
      }
      newPool.end().catch(() => {});
    });

    global._postgresPool = newPool;
  }
  return global._postgresPool;
};

export function resetPool() {
  if (global._postgresPool) {
    const oldPool = global._postgresPool;
    global._postgresPool = undefined;
    global._drizzleDb = undefined;
    try {
      oldPool.end().catch(() => {});
    } catch {}
  }
}

export function getRawDb(): DrizzleDb {
  const pool = createPool();
  if (!global._drizzleDb) {
    global._drizzleDb = drizzle(pool, { schema });
  }
  return global._drizzleDb;
}

export async function withDbRetry<T>(
  operation: (dbInstance: DrizzleDb) => Promise<T>,
  label: string = 'query'
): Promise<T> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const instance = getRawDb();
      return await operation(instance);
    } catch (err: any) {
      if (isTransientDbError(err) && attempt < maxAttempts) {
        const delayMs = attempt === 1 ? 300 : attempt === 2 ? 750 : 1500;
        const msg = err?.cause?.message || err?.message || String(err);
        console.warn(
          `[DB_RETRY] Transient error on ${label} (attempt ${attempt}/${maxAttempts}): ${msg}. Resetting pool and retrying in ${delayMs}ms...`
        );
        resetPool();
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Database operation ${label} failed after retries`);
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  await withDbRetry(async () => {
    const pool = createPool();
    await pool.query('SELECT 1');
  }, 'ping');
  return { ok: true, latencyMs: Date.now() - start };
}

type ChainStep = { prop: string | symbol; args: any[] };

function replayChain(rootDb: any, steps: ChainStep[]) {
  let curr = rootDb;
  for (const step of steps) {
    const fn = curr[step.prop];
    if (typeof fn !== 'function') {
      throw new TypeError(`Property ${String(step.prop)} is not a function on Drizzle query builder`);
    }
    curr = fn.apply(curr, step.args);
  }
  return curr;
}

function createChainProxy(steps: ChainStep[], targetObj: any): any {
  return new Proxy(targetObj, {
    get(target, prop, receiver) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        const promiseFactory = () =>
          withDbRetry(async (freshDb) => await replayChain(freshDb, steps), String(steps[0]?.prop || 'db'));
        if (prop === 'then') {
          return (onFulfilled: any, onRejected: any) => promiseFactory().then(onFulfilled, onRejected);
        }
        if (prop === 'catch') {
          return (onRejected: any) => promiseFactory().catch(onRejected);
        }
        return (onFinally: any) => promiseFactory().finally(onFinally);
      }

      if (prop === 'execute') {
        return (...execArgs: any[]) =>
          withDbRetry(
            async (freshDb) => {
              const built = replayChain(freshDb, steps);
              return await built.execute(...execArgs);
            },
            `${String(steps[0]?.prop || 'db')}.execute`
          );
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: any[]) => {
          const nextTarget = value.apply(target, args);
          if (nextTarget && (typeof nextTarget === 'object' || typeof nextTarget === 'function')) {
            return createChainProxy([...steps, { prop, args }], nextTarget);
          }
          return nextTarget;
        };
      }
      return value;
    },
  });
}

// Export db as a chain-replaying Proxy with multi-attempt exponential backoff retry on transient Cloud SQL socket errors
export const db: DrizzleDb = new Proxy({} as any, {
  get(_target, prop) {
    const raw = getRawDb() as any;
    const orig = raw[prop];
    if (typeof orig === 'function') {
      return (...args: any[]) => {
        const firstResult = orig.apply(raw, args);
        if (firstResult && (typeof firstResult === 'object' || typeof firstResult === 'function')) {
          return createChainProxy([{ prop, args }], firstResult);
        }
        return firstResult;
      };
    }
    return orig;
  },
});
