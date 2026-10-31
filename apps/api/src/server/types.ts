import type { AppBindings } from './env'
import type { ValidatedApiKey } from './auth/keys'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'developer' | 'viewer'
}

export interface AppUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  role?: string
  banned?: boolean | null
  banReason?: string | null
  banExpires?: Date | null
  activeOrganizationId?: string | null
  organizationId?: string | null
  createdAt?: Date
  updatedAt?: Date
  [key: string]: unknown
}

export interface AppSession {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress?: string | null
  userAgent?: string | null
  activeOrganizationId?: string | null
  createdAt?: Date
  updatedAt?: Date
  [key: string]: unknown
}

export interface AppVariables {
  admin?: AdminUser
  apiKey?: ValidatedApiKey
  user?: AppUser
  session?: AppSession
  role?: 'owner' | 'admin' | 'developer' | 'viewer' | 'service_role' | 'user' | 'anon'
}

export type AppEnv = {
  Bindings: AppBindings
  Variables: AppVariables
}
