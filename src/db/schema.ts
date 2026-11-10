import { pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// Define the 'users' table linked with Firebase Auth
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'wa_messages' table for persistent WhatsApp message logs
export const waMessages = pgTable('wa_messages', {
  id: serial('id').primaryKey(),
  msgId: text('msg_id').notNull().unique(),
  sender: text('sender').notNull(),
  senderName: text('sender_name'),
  text: text('text').notNull(),
  aiReply: text('ai_reply'),
  modelUsed: text('model_used'),
  isFromMe: boolean('is_from_me').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define 'app_settings' table for persistent Multi-AI and WhatsApp settings
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
