import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// =========================================================================
// 1. PLATFORM ADMIN & SYSTEM TABLES (Prefixo _ek_*)
// Isolamento total entre a equipe que opera a plataforma e os usuários do app
// =========================================================================

export const ekAdmins = sqliteTable('_ek_admins', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  password: text('password').notNull(), // WebCrypto PBKDF2 hash
  role: text('role').notNull().default('admin'), // 'owner' | 'admin' | 'developer' | 'viewer'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ekAdminSessions = sqliteTable('_ek_admin_sessions', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(), // SHA-256 hash da sessão
  adminId: text('admin_id')
    .notNull()
    .references(() => ekAdmins.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const ekAdminInvites = sqliteTable('_ek_admin_invites', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull().default('developer'), // 'admin' | 'developer' | 'viewer'
  token: text('token').notNull().unique(),
  invitedBy: text('invited_by').references(() => ekAdmins.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const ekApiKeys = sqliteTable('_ek_api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(), // Ex: 'ek_anon_abc...' para exibição
  keyHash: text('key_hash').notNull().unique(), // SHA-256 hex string para validação
  type: text('type').notNull(), // 'anon' | 'service_role'
  role: text('role').notNull().default('anon'), // 'anon' | 'service_role'
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ekTablePolicies = sqliteTable('_ek_table_policies', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  rlsEnabled: integer('rls_enabled', { mode: 'boolean' }).notNull().default(true),
  selectRule: text('select_rule').notNull().default('disabled'), // Deny-by-default!
  insertRule: text('insert_rule').notNull().default('disabled'),
  updateRule: text('update_rule').notNull().default('disabled'),
  deleteRule: text('delete_rule').notNull().default('disabled'),
  ownerColumn: text('owner_column').notNull().default('user_id'),
  customRule: text('custom_rule'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ekStorageBuckets = sqliteTable('_ek_storage_buckets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  allowedMimeTypes: text('allowed_mime_types').notNull().default('["*"]'), // JSON array
  maxSizeBytes: integer('max_size_bytes').notNull().default(10485760), // 10MB
  readRule: text('read_rule').notNull().default('public'), // 'public' | 'authenticated' | 'owner' | 'service_only'
  writeRule: text('write_rule').notNull().default('authenticated'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ekStorageObjects = sqliteTable('_ek_storage_objects', {
  id: text('id').primaryKey(),
  bucket: text('bucket').notNull(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
  userId: text('user_id'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  metadata: text('metadata'), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ekWebhooks = sqliteTable('_ek_webhooks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events').notNull().default('["*"]'), // JSON array
  secret: text('secret'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ekAuditLogs = sqliteTable('_ek_audit_logs', {
  id: text('id').primaryKey(),
  action: text('action').notNull(), // ex: 'table.create', 'key.create', 'admin.login'
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  actorType: text('actor_type').notNull(), // 'admin' | 'user' | 'service' | 'system'
  actorId: text('actor_id'),
  details: text('details'), // JSON string
  ipAddress: text('ip_address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const ekSettings = sqliteTable('_ek_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// =========================================================================
// 2. APP USERS & AUTHENTICATION TABLES (Better Auth)
// Isoladas exclusivamente para os usuários finais das aplicações do desenvolvedor
// =========================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false),
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
  activeOrganizationId: text('active_organization_id'),
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

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').default('member'),
  status: text('status').notNull().default('pending'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const twoFactors = sqliteTable('two_factors', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  verified: integer('verified', { mode: 'boolean' }).default(true),
  failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})
