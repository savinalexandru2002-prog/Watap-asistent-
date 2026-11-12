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
    newPool.on('error', (err) => {
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

// Export db as a Proxy that dynamically resolves to a valid Drizzle instance, auto-recovering from dropped connections
export const db = new Proxy({} as any, {
  get(target, prop) {
    const pool = createPool();
    if (!global._drizzleDb) {
      global._drizzleDb = drizzle(pool, { schema });
    }
    return global._drizzleDb[prop];
  }
});

