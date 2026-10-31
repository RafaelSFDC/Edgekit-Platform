import type { AppBindings } from './env'
import type { ValidatedApiKey } from './auth/keys'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'developer' | 'viewer'
}

export interface AppVariables {
  admin?: AdminUser
  apiKey?: ValidatedApiKey
  user?: any
  session?: any
  role?: 'owner' | 'admin' | 'developer' | 'viewer' | 'service_role' | 'user' | 'anon'
}

export type AppEnv = {
  Bindings: AppBindings
  Variables: AppVariables
}
