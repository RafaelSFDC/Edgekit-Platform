/**
 * Edgekit Platform — Tipagens TypeScript Geradas Automaticamente (Seção 16.1)
 * Gerado em: 2026-11-02T00:19:25.027Z
 */

export interface DatabaseSchema {
  __drizzle_migrations: {
    Row: __drizzle_migrationsRow
    Insert: __drizzle_migrationsInsert
    Update: __drizzle_migrationsUpdate
  }
  accounts: {
    Row: accountsRow
    Insert: accountsInsert
    Update: accountsUpdate
  }
  articles: {
    Row: articlesRow
    Insert: articlesInsert
    Update: articlesUpdate
  }
  batch_items: {
    Row: batch_itemsRow
    Insert: batch_itemsInsert
    Update: batch_itemsUpdate
  }
  invitations: {
    Row: invitationsRow
    Insert: invitationsInsert
    Update: invitationsUpdate
  }
  jwks: {
    Row: jwksRow
    Insert: jwksInsert
    Update: jwksUpdate
  }
  members: {
    Row: membersRow
    Insert: membersInsert
    Update: membersUpdate
  }
  organizations: {
    Row: organizationsRow
    Insert: organizationsInsert
    Update: organizationsUpdate
  }
  passkeys: {
    Row: passkeysRow
    Insert: passkeysInsert
    Update: passkeysUpdate
  }
  post_reviews: {
    Row: post_reviewsRow
    Insert: post_reviewsInsert
    Update: post_reviewsUpdate
  }
  raw_secret_data: {
    Row: raw_secret_dataRow
    Insert: raw_secret_dataInsert
    Update: raw_secret_dataUpdate
  }
  sessions: {
    Row: sessionsRow
    Insert: sessionsInsert
    Update: sessionsUpdate
  }
  tasks: {
    Row: tasksRow
    Insert: tasksInsert
    Update: tasksUpdate
  }
  two_factors: {
    Row: two_factorsRow
    Insert: two_factorsInsert
    Update: two_factorsUpdate
  }
  user_notes: {
    Row: user_notesRow
    Insert: user_notesInsert
    Update: user_notesUpdate
  }
  users: {
    Row: usersRow
    Insert: usersInsert
    Update: usersUpdate
  }
  verifications: {
    Row: verificationsRow
    Insert: verificationsInsert
    Update: verificationsUpdate
  }
}

export interface __drizzle_migrationsRow {
  id: string | null
  hash: string
  created_at: string | null
}

export interface __drizzle_migrationsInsert {
  id?: string | null
  hash: string
  created_at?: string | null
}

export interface __drizzle_migrationsUpdate {
  id?: string | null
  hash?: string | null
  created_at?: string | null
}

export interface accountsRow {
  id: string
  account_id: string
  provider_id: string
  user_id: string
  access_token: string | null
  refresh_token: string | null
  id_token: string | null
  access_token_expires_at: number | null
  refresh_token_expires_at: number | null
  scope: string | null
  password: string | null
  created_at: number
  updated_at: number
}

export interface accountsInsert {
  id?: string
  account_id: string
  provider_id: string
  user_id: string
  access_token?: string | null
  refresh_token?: string | null
  id_token?: string | null
  access_token_expires_at?: number | null
  refresh_token_expires_at?: number | null
  scope?: string | null
  password?: string | null
  created_at: number
  updated_at: number
}

export interface accountsUpdate {
  id?: string | null
  account_id?: string | null
  provider_id?: string | null
  user_id?: string | null
  access_token?: string | null
  refresh_token?: string | null
  id_token?: string | null
  access_token_expires_at?: number | null
  refresh_token_expires_at?: number | null
  scope?: string | null
  password?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export interface articlesRow {
  id: string | null
  title: string | null
  content: string | null
}

export interface articlesInsert {
  id?: string | null
  title?: string | null
  content?: string | null
}

export interface articlesUpdate {
  id?: string | null
  title?: string | null
  content?: string | null
}

export interface batch_itemsRow {
  id: string | null
  name: string | null
  quantity: number | null
}

export interface batch_itemsInsert {
  id?: string | null
  name?: string | null
  quantity?: number | null
}

export interface batch_itemsUpdate {
  id?: string | null
  name?: string | null
  quantity?: number | null
}

export interface invitationsRow {
  id: string
  organization_id: string
  email: string
  role: string | null
  status: string
  expires_at: number
  inviter_id: string
  created_at: number | null
}

export interface invitationsInsert {
  id?: string
  organization_id: string
  email: string
  role?: string | null
  status?: string
  expires_at: number
  inviter_id: string
  created_at?: number | null
}

export interface invitationsUpdate {
  id?: string | null
  organization_id?: string | null
  email?: string | null
  role?: string | null
  status?: string | null
  expires_at?: number | null
  inviter_id?: string | null
  created_at?: number | null
}

export interface jwksRow {
  id: string
  public_key: string
  private_key: string
  created_at: number
  expires_at: number | null
  alg: string | null
  crv: string | null
}

export interface jwksInsert {
  id?: string
  public_key: string
  private_key: string
  created_at: number
  expires_at?: number | null
  alg?: string | null
  crv?: string | null
}

export interface jwksUpdate {
  id?: string | null
  public_key?: string | null
  private_key?: string | null
  created_at?: number | null
  expires_at?: number | null
  alg?: string | null
  crv?: string | null
}

export interface membersRow {
  id: string
  organization_id: string
  user_id: string
  role: string
  created_at: number
}

export interface membersInsert {
  id?: string
  organization_id: string
  user_id: string
  role?: string
  created_at: number
}

export interface membersUpdate {
  id?: string | null
  organization_id?: string | null
  user_id?: string | null
  role?: string | null
  created_at?: number | null
}

export interface organizationsRow {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: string | null
  created_at: number
  updated_at: number | null
}

export interface organizationsInsert {
  id?: string
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
  created_at: number
  updated_at?: number | null
}

export interface organizationsUpdate {
  id?: string | null
  name?: string | null
  slug?: string | null
  logo?: string | null
  metadata?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export interface passkeysRow {
  id: string
  name: string | null
  public_key: string
  user_id: string
  credential_id: string
  counter: number
  device_type: string
  backed_up: number
  transports: string | null
  created_at: number | null
  aaguid: string | null
}

export interface passkeysInsert {
  id?: string
  name?: string | null
  public_key: string
  user_id: string
  credential_id: string
  counter: number
  device_type: string
  backed_up: number
  transports?: string | null
  created_at?: number | null
  aaguid?: string | null
}

export interface passkeysUpdate {
  id?: string | null
  name?: string | null
  public_key?: string | null
  user_id?: string | null
  credential_id?: string | null
  counter?: number | null
  device_type?: string | null
  backed_up?: number | null
  transports?: string | null
  created_at?: number | null
  aaguid?: string | null
}

export interface post_reviewsRow {
  id: string | null
  content: string | null
  user_id: string | null
}

export interface post_reviewsInsert {
  id?: string | null
  content?: string | null
  user_id?: string | null
}

export interface post_reviewsUpdate {
  id?: string | null
  content?: string | null
  user_id?: string | null
}

export interface raw_secret_dataRow {
  id: string | null
  confidential: string | null
}

export interface raw_secret_dataInsert {
  id?: string | null
  confidential?: string | null
}

export interface raw_secret_dataUpdate {
  id?: string | null
  confidential?: string | null
}

export interface sessionsRow {
  id: string
  expires_at: number
  token: string
  created_at: number
  updated_at: number
  ip_address: string | null
  user_agent: string | null
  user_id: string
  active_organization_id: string | null
  impersonated_by: string | null
}

export interface sessionsInsert {
  id?: string
  expires_at: number
  token: string
  created_at: number
  updated_at: number
  ip_address?: string | null
  user_agent?: string | null
  user_id: string
  active_organization_id?: string | null
  impersonated_by?: string | null
}

export interface sessionsUpdate {
  id?: string | null
  expires_at?: number | null
  token?: string | null
  created_at?: number | null
  updated_at?: number | null
  ip_address?: string | null
  user_agent?: string | null
  user_id?: string | null
  active_organization_id?: string | null
  impersonated_by?: string | null
}

export interface tasksRow {
  id: string | null
  title: string | null
  user_id: string | null
  status: string | null
  deleted_at: string | null
}

export interface tasksInsert {
  id?: string | null
  title?: string | null
  user_id?: string | null
  status?: string | null
  deleted_at?: string | null
}

export interface tasksUpdate {
  id?: string | null
  title?: string | null
  user_id?: string | null
  status?: string | null
  deleted_at?: string | null
}

export interface two_factorsRow {
  id: string
  secret: string
  backup_codes: string
  user_id: string
  verified: number | null
  failed_verification_count: number | null
  locked_until: number | null
  created_at: number | null
  updated_at: number | null
}

export interface two_factorsInsert {
  id?: string
  secret: string
  backup_codes: string
  user_id: string
  verified?: number | null
  failed_verification_count?: number | null
  locked_until?: number | null
  created_at?: number | null
  updated_at?: number | null
}

export interface two_factorsUpdate {
  id?: string | null
  secret?: string | null
  backup_codes?: string | null
  user_id?: string | null
  verified?: number | null
  failed_verification_count?: number | null
  locked_until?: number | null
  created_at?: number | null
  updated_at?: number | null
}

export interface user_notesRow {
  id: string | null
  title: string | null
  user_id: string | null
  organization_id: string | null
}

export interface user_notesInsert {
  id?: string | null
  title?: string | null
  user_id?: string | null
  organization_id?: string | null
}

export interface user_notesUpdate {
  id?: string | null
  title?: string | null
  user_id?: string | null
  organization_id?: string | null
}

export interface usersRow {
  id: string
  name: string
  email: string
  email_verified: number
  image: string | null
  role: string
  banned: number | null
  ban_reason: string | null
  ban_expires: number | null
  created_at: number
  updated_at: number
  two_factor_enabled: number | null
}

export interface usersInsert {
  id?: string
  name: string
  email: string
  email_verified?: number
  image?: string | null
  role?: string
  banned?: number | null
  ban_reason?: string | null
  ban_expires?: number | null
  created_at: number
  updated_at: number
  two_factor_enabled?: number | null
}

export interface usersUpdate {
  id?: string | null
  name?: string | null
  email?: string | null
  email_verified?: number | null
  image?: string | null
  role?: string | null
  banned?: number | null
  ban_reason?: string | null
  ban_expires?: number | null
  created_at?: number | null
  updated_at?: number | null
  two_factor_enabled?: number | null
}

export interface verificationsRow {
  id: string
  identifier: string
  value: string
  expires_at: number
  created_at: number | null
  updated_at: number | null
}

export interface verificationsInsert {
  id?: string
  identifier: string
  value: string
  expires_at: number
  created_at?: number | null
  updated_at?: number | null
}

export interface verificationsUpdate {
  id?: string | null
  identifier?: string | null
  value?: string | null
  expires_at?: number | null
  created_at?: number | null
  updated_at?: number | null
}

