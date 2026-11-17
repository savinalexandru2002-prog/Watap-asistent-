import { withDbRetry } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string | null, photoUrl?: string | null) {
  try {
    const result = await withDbRetry(
      (db) =>
        db
          .insert(users)
          .values({
            uid,
            email,
            displayName: displayName || null,
            photoUrl: photoUrl || null,
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: {
              email,
              displayName: displayName || null,
              photoUrl: photoUrl || null,
            },
          })
          .returning(),
      'getOrCreateUser'
    );

    return result[0];
  } catch (error) {
    console.error('Database user upsert error:', error);
    throw new Error('Failed to sync user with database', { cause: error });
  }
}
