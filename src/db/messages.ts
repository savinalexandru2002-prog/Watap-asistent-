import { withDbRetry } from './index.ts';
import { waMessages } from './schema.ts';
import { desc, sql } from 'drizzle-orm';

export async function saveWaMessage(data: {
  msgId: string;
  sender: string;
  senderName?: string;
  text: string;
  aiReply?: string;
  modelUsed?: string;
  isFromMe?: boolean;
}) {
  try {
    const result = await withDbRetry(
      (db) =>
        db
          .insert(waMessages)
          .values({
            msgId: data.msgId,
            sender: data.sender,
            senderName: data.senderName || null,
            text: data.text,
            aiReply: data.aiReply || null,
            modelUsed: data.modelUsed || null,
            isFromMe: data.isFromMe || false,
          })
          .onConflictDoNothing()
          .returning(),
      'saveWaMessage'
    );
    return result[0] ?? null;
  } catch (error) {
    console.error('Database error saving message:', error);
    // Non-fatal, do not crash message handler
    return null;
  }
}

export async function getRecentWaMessages(limit: number = 50) {
  try {
    return await withDbRetry(
      (db) =>
        db
          .select()
          .from(waMessages)
          .orderBy(desc(waMessages.createdAt))
          .limit(limit),
      'getRecentWaMessages'
    );
  } catch (error) {
    console.error('Database error fetching messages:', error);
    return [];
  }
}

export async function countWaMessages(): Promise<number> {
  try {
    const rows = await withDbRetry(
      (db) => db.select({ count: sql<number>`count(*)::int` }).from(waMessages),
      'countWaMessages'
    );
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    console.error('Database error counting messages:', error);
    return 0;
  }
}
