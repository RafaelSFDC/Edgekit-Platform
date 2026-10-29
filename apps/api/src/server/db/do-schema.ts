import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const presence = sqliteTable('presence', {
  userId: text('user_id').primaryKey(),
  userName: text('user_name').notNull(),
  avatarUrl: text('avatar_url'),
  status: text('status').default('online'),
  connectedAt: integer('connected_at', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull(),
})

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  payload: text('payload').notNull(), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
