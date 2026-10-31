import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// =========================================================================
// 1. AUTHENTICATION SCHEMAS (Compatíveis com Better-Auth)
// =========================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// =========================================================================
// 2. API KEYS (Estilo Supabase: anon_key, service_role_key e custom keys)
// =========================================================================

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  key: text('key').notNull().unique(),
  type: text('type').notNull(), // 'anon' | 'service_role' | 'custom'
  role: text('role').notNull().default('anon'), // 'anon' | 'admin' | 'user'
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// =========================================================================
// 3. STORAGE FILES (Metadados de Objetos no Cloudflare R2)
// =========================================================================

export const storageFiles = sqliteTable('storage_files', {
  id: text('id').primaryKey(),
  bucket: text('bucket').notNull(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
  metadata: text('metadata'), // JSON serializado com headers customizados
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// =========================================================================
// 4. APP SETTINGS & SETUP STATUS
// =========================================================================

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// =========================================================================
// 5. AUDIT LOGS & WEBHOOKS
// =========================================================================

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  action: text('action').notNull(), // ex: 'auth.login', 'db.insert', 'storage.upload'
  entity: text('entity').notNull(),
  userId: text('user_id'),
  details: text('details'), // JSON string
  ipAddress: text('ip_address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events').notNull(), // JSON array de eventos: ["*"], ["user.created"]
  secret: text('secret'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// =========================================================================
// 6. TABLE ACCESS POLICIES (Supabase-Style RLS Engine)
// =========================================================================

export const tablePolicies = sqliteTable('table_policies', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  rlsEnabled: integer('rls_enabled', { mode: 'boolean' }).notNull().default(true),
  selectRule: text('select_rule').notNull().default('public'), // 'public' | 'authenticated' | 'owner' | 'admin' | 'disabled'
  insertRule: text('insert_rule').notNull().default('authenticated'), // 'public' | 'authenticated' | 'owner' | 'admin' | 'disabled'
  updateRule: text('update_rule').notNull().default('owner'), // 'authenticated' | 'owner' | 'admin' | 'disabled'
  deleteRule: text('delete_rule').notNull().default('owner'), // 'authenticated' | 'owner' | 'admin' | 'disabled'
  ownerColumn: text('owner_column').notNull().default('user_id'),
  readLevel: text('read_level').notNull().default('public'), // Retrocompatibilidade
  writeLevel: text('write_level').notNull().default('authenticated'), // Retrocompatibilidade
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
