import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const guestbookComments = pgTable('guestbook_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  cls: text('class').notNull(),
  topic: text('topic').notNull(),
  msg: text('message').notNull(),
  ownerHash: text('owner_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siteContent = pgTable('site_content', {
  id: text('id').primaryKey(),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
