import { db } from './index.ts';
import { appSettings } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  } catch (error) {
    console.error(`Database error reading setting ${key}:`, error);
    return null;
  }
}

export async function setSetting(key: string, value: string) {
  try {
    await db.insert(appSettings)
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
      });
  } catch (error) {
    console.error(`Database error setting ${key}:`, error);
  }
}
