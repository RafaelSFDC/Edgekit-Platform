import type { AppBindings } from './env'
import type { ValidatedApiKey } from './auth/keys'

export interface AppVariables {
  apiKey?: ValidatedApiKey
  user?: any
  session?: any
  role?: 'anon' | 'admin' | 'user'
}

export type AppEnv = {
  Bindings: AppBindings
  Variables: AppVariables
}
