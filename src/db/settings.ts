import { withDbRetry } from './index.ts';
import { appSettings } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await withDbRetry(
      (db) => db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1),
      `getSetting(${key})`
    );
    return rows[0]?.value ?? null;
  } catch (error) {
    console.error(`Database error reading setting ${key}:`, error);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  try {
    await withDbRetry(
      (db) =>
        db
          .insert(appSettings)
          .values({
            key,
            value,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value,
              updatedAt: new Date(),
            },
          }),
      `setSetting(${key})`
    );
    return true;
  } catch (error) {
    console.error(`Database error setting ${key}:`, error);
    return false;
  }
}
