import { db } from './index.ts';
import { waMessages } from './schema.ts';
import { desc } from 'drizzle-orm';

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
    const result = await db.insert(waMessages)
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
      .returning();
    return result[0];
  } catch (error) {
    console.error("Database error saving message:", error);
    // Non-fatal, do not crash message handler
    return null;
  }
}

export async function getRecentWaMessages(limit: number = 50) {
  try {
    return await db.select()
      .from(waMessages)
      .orderBy(desc(waMessages.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("Database error fetching messages:", error);
    return [];
  }
}
