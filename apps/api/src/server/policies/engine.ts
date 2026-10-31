import { sql, type SQL } from 'drizzle-orm'
import type { AppVariables } from '../types'
import type { ekTablePolicies } from '../db/schema'

export type TablePolicyRecord = typeof ekTablePolicies.$inferSelect

export type PolicyRuleType =
  | 'disabled'
  | 'service_only'
  | 'public'
  | 'authenticated'
  | 'owner'
  | 'org_member'
  | 'custom_sql'

export type CrudAction = 'select' | 'insert' | 'update' | 'delete'

export interface PolicyEvaluationResult {
  allowed: boolean
  bypass?: boolean
  whereCondition?: SQL
  injectValues?: Record<string, any>
  error?: string
}

/**
 * Avalia as políticas de acesso de uma tabela com base na ação e no contexto de autenticação.
 * Adota a filosofia DENY-BY-DEFAULT: tabelas sem regras configuradas são bloqueadas para clientes públicos.
 */
export function evaluateTablePolicy(
  tableName: string,
  action: CrudAction,
  policy: TablePolicyRecord | null | undefined,
  context: AppVariables,
): PolicyEvaluationResult {
  const isPlatformAdmin =
    Boolean(context.admin) ||
    context.role === 'service_role' ||
    context.apiKey?.type === 'service_role' ||
    context.role === 'owner' ||
    context.role === 'admin'

  // Service role ou Admin da plataforma tem bypass total
  if (isPlatformAdmin) {
    return { allowed: true, bypass: true }
  }

  // Se a tabela não possui nenhum registro de política configurado: BLOQUEIO TOTAL (Deny-by-default)
  if (!policy) {
    return {
      allowed: false,
      error: `Acesso negado: a tabela "${tableName}" não possui políticas de acesso configuradas.`,
    }
  }

  // Se o RLS estiver explicitamente desabilitado pelo desenvolvedor
  if (!policy.rlsEnabled) {
    if (action !== 'select' && !context.user && context.role === 'anon') {
      return {
        allowed: false,
        error: `Autenticação necessária para operações de ${action} na tabela "${tableName}".`,
      }
    }
    return { allowed: true }
  }

  const ownerColumn = (policy.ownerColumn || 'user_id').trim().replace(/[^a-zA-Z0-9_]/g, '')
  const safeOwnerCol = sql.raw(`\`${ownerColumn}\``)

  let rule: string
  if (action === 'select') rule = policy.selectRule || 'disabled'
  else if (action === 'insert') rule = policy.insertRule || 'disabled'
  else if (action === 'update') rule = policy.updateRule || 'disabled'
  else rule = policy.deleteRule || 'disabled'

  // 1. Regra Desabilitada / Apenas Backend
  if (rule === 'disabled' || rule === 'service_only') {
    return {
      allowed: false,
      error: `Acesso negado: operações de ${action} estão desabilitadas na tabela "${tableName}".`,
    }
  }

  // 2. Regra Pública
  if (rule === 'public') {
    return {
      allowed: true,
      injectValues: context.user?.id ? { [ownerColumn]: context.user.id } : undefined,
    }
  }

  // 3. Regra para Qualquer Usuário Autenticado
  if (rule === 'authenticated') {
    if (!context.user) {
      return {
        allowed: false,
        error: `Acesso restrito: autenticação necessária para ${action} na tabela "${tableName}".`,
      }
    }
    return {
      allowed: true,
      injectValues: { [ownerColumn]: context.user.id },
    }
  }

  // 4. Regra de Dono (Owner)
  if (rule === 'owner') {
    if (!context.user?.id) {
      return {
        allowed: false,
        error: `Acesso restrito: faça login para acessar seus próprios registros na tabela "${tableName}".`,
      }
    }

    const userId = context.user.id
    return {
      allowed: true,
      whereCondition: sql`${safeOwnerCol} = ${userId}`,
      injectValues: { [ownerColumn]: userId },
    }
  }

  // 5. Regra de Membro da Organização (Better Auth Organizations)
  if (rule === 'org_member') {
    if (!context.user?.id) {
      return {
        allowed: false,
        error: `Acesso restrito: faça login para acessar os registros da sua organização na tabela "${tableName}".`,
      }
    }

    const activeOrgId =
      context.session?.activeOrganizationId ||
      context.user.activeOrganizationId ||
      context.user.organizationId

    if (!activeOrgId) {
      return {
        allowed: false,
        error: `Nenhuma organização ativa selecionada na sessão atual para acessar "${tableName}".`,
      }
    }

    const orgColumn = (policy.ownerColumn && policy.ownerColumn !== 'user_id')
      ? policy.ownerColumn
      : 'organization_id'
    const safeOrgCol = sql.raw(`\`${orgColumn}\``)

    return {
      allowed: true,
      whereCondition: sql`${safeOrgCol} = ${activeOrgId}`,
      injectValues: { [orgColumn]: activeOrgId },
    }
  }

  // 6. Regra Customizada SQL segura
  if (rule === 'custom_sql' && policy.customRule) {
    const rawExpression = policy.customRule.trim()
    // Substitui variáveis parametrizadas @auth.id e @auth.role
    const authId = context.user?.id || ''
    const authRole = context.user?.role || context.role || 'anon'

    const processedCondition = sql`(${sql.raw(
      rawExpression
        .replace(/@auth\.id/g, `'${authId.replace(/'/g, "''")}'`)
        .replace(/@auth\.role/g, `'${authRole.replace(/'/g, "''")}'`),
    )})`

    return {
      allowed: true,
      whereCondition: processedCondition,
    }
  }

  return {
    allowed: false,
    error: `Regra de acesso desconhecida ou não suportada: "${rule}".`,
  }
}
