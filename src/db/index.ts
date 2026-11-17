import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
  var _drizzleDb: any | undefined;
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
      idleTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      allowExitOnIdle: true,
    });

    // Prevent unhandled pool-level errors from crashing the application and reset pool cleanly
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
    try {
      global._postgresPool.end().catch(() => {});
    } catch {}
    global._postgresPool = undefined;
    global._drizzleDb = undefined;
  }
}

// Export db as a Proxy with multi-attempt exponential backoff retry on transient Cloud SQL socket errors
export const db = new Proxy({} as any, {
  get(target, prop) {
    const pool = createPool();
    if (!global._drizzleDb) {
      global._drizzleDb = drizzle(pool, { schema });
    }
    const origMethod = global._drizzleDb[prop];
    if (typeof origMethod === 'function') {
      return function (...args: any[]) {
        const queryBuilder = origMethod.apply(global._drizzleDb, args);
        if (queryBuilder && typeof queryBuilder.then === 'function') {
          return (async () => {
            const maxAttempts = 3;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                // Await fresh execution per attempt if retrying
                if (attempt > 1) {
                  resetPool();
                  const freshPool = createPool();
                  const freshDb = drizzle(freshPool, { schema });
                  return await (freshDb as any)[prop](...args);
                }
                return await queryBuilder;
              } catch (err: any) {
                const msg = err?.message || '';
                const isTransient = /ENOENT|ECONNREFUSED|ETIMEDOUT|terminating|connection|timeout/i.test(msg);
                if (isTransient && attempt < maxAttempts) {
                  const delay = attempt * 400;
                  console.warn(`[DB_RETRY] Transient database error (attempt ${attempt}/${maxAttempts}): ${msg}. Retrying in ${delay}ms...`);
                  await new Promise((r) => setTimeout(r, delay));
                  continue;
                }
                throw err;
              }
            }
          })();
        }
        return queryBuilder;
      };
    }
    return origMethod;
  }
});
