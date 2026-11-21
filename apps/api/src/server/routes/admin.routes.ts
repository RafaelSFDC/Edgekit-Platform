/**
 * Proxy de compatibilidade para adminRoutes modularizado.
 * O monólito de 1.350 linhas foi decomposto em subrotas limpas sob ./admin/
 */
export {
  adminRoutes,
  authRoutes,
  keysRoutes,
  databaseRoutes,
  policiesRoutes,
  settingsRoutes,
  usersRoutes,
} from './admin'
