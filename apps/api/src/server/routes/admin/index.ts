import { Hono } from 'hono'
import type { AppEnv } from '../../types'
import { authRoutes } from './auth.routes'
import { keysRoutes } from './keys.routes'
import { databaseRoutes } from './database.routes'
import { policiesRoutes } from './policies.routes'
import { settingsRoutes } from './settings.routes'
import { usersRoutes } from './users.routes'

export const adminRoutes = new Hono<AppEnv>()

// Montagem das sub-rotas modulares com 100% de paridade com a API anterior
adminRoutes.route('/', authRoutes)
adminRoutes.route('/', keysRoutes)
adminRoutes.route('/', databaseRoutes)
adminRoutes.route('/', policiesRoutes)
adminRoutes.route('/', settingsRoutes)
adminRoutes.route('/', usersRoutes)

export {
  authRoutes,
  keysRoutes,
  databaseRoutes,
  policiesRoutes,
  settingsRoutes,
  usersRoutes,
}
