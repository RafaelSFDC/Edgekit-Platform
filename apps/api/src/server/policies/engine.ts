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

export interface DeclarativeCondition {
  field: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'is_null' | 'is_not_null'
  value?: any
}

export interface DeclarativeRule {
  type?: 'declarative'
  operator?: 'and' | 'or'
  conditions: DeclarativeCondition[]
}

export interface PolicyEvaluationResult {
  allowed: boolean
  bypass?: boolean
  whereCondition?: SQL
  injectValues?: Record<string, any>
  error?: string
}

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/

/**
 * Compila condições declarativas estruturadas em SQL parametrizado seguro
 */
export function compileDeclarativeConditions(
  conditions: DeclarativeCondition[],
  operator: 'and' | 'or',
  context: AppVariables,
): SQL | null {
  if (!conditions || conditions.length === 0) return null

  const clauses: SQL[] = []
  const authId = context.user?.id || ''
  const authRole = context.user?.role || context.role || 'anon'
  const authOrgId =
    context.session?.activeOrganizationId ||
    context.user?.activeOrganizationId ||
    context.user?.organizationId ||
    ''

  for (const cond of conditions) {
    if (!cond.field || !SAFE_IDENTIFIER.test(cond.field)) continue

    const col = sql.raw(`\`${cond.field}\``)
    let val = cond.value

    if (val === '@auth.id') val = authId
    else if (val === '@auth.role') val = authRole
    else if (val === '@auth.org_id') val = authOrgId

    switch (cond.op) {
      case 'eq':
        clauses.push(sql`${col} = ${val}`)
        break
      case 'neq':
        clauses.push(sql`${col} != ${val}`)
        break
      case 'gt':
        clauses.push(sql`${col} > ${val}`)
        break
      case 'gte':
        clauses.push(sql`${col} >= ${val}`)
        break
      case 'lt':
        clauses.push(sql`${col} < ${val}`)
        break
      case 'lte':
        clauses.push(sql`${col} <= ${val}`)
        break
      case 'like':
        clauses.push(sql`${col} LIKE ${val}`)
        break
      case 'in': {
        const items = Array.isArray(val) ? val : String(val).split(',').map((s) => s.trim())
        if (items.length > 0) {
          clauses.push(sql`${col} IN (${sql.join(items.map((i) => sql`${i}`), sql.raw(', '))})`)
        }
        break
      }
      case 'is_null':
        clauses.push(sql`${col} IS NULL`)
        break
      case 'is_not_null':
        clauses.push(sql`${col} IS NOT NULL`)
        break
    }
  }

  if (clauses.length === 0) return null
  const glue = operator === 'or' ? sql.raw(' OR ') : sql.raw(' AND ')
  return sql`(${sql.join(clauses, glue)})`
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
  // CRÍTICO: Somente Administradores da Plataforma (sessão HttpOnly em _ek_admins)
  // ou chamadas de backend com service_role_key têm bypass total.
  // Usuários finais do app (mesmo com role='admin' na tabela users) NUNCA recebem bypass!
  const isPlatformAdmin =
    Boolean(context.admin) ||
    context.apiKey?.type === 'service_role' ||
    context.role === 'service_role'

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

  const rawOwnerCol = (policy.ownerColumn || 'user_id').trim()
  const ownerColumn = SAFE_IDENTIFIER.test(rawOwnerCol) ? rawOwnerCol : 'user_id'
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

    // Identificador da organização vem exclusivamente da sessão ativa verificada
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

    const orgColumn = ownerColumn !== 'user_id' ? ownerColumn : 'organization_id'
    const safeOrgCol = sql.raw(`\`${orgColumn}\``)

    return {
      allowed: true,
      whereCondition: sql`${safeOrgCol} = ${activeOrgId}`,
      injectValues: { [orgColumn]: activeOrgId },
    }
  }

  // 6. Regra Customizada Declarativa ou Expressão Segura
  if (rule === 'custom_sql' && policy.customRule) {
    const rawExpression = policy.customRule.trim()

    // A) Suporte ao Construtor Declarativo Estruturado (JSON seguro)
    if (rawExpression.startsWith('{')) {
      try {
        const parsedRule: DeclarativeRule = JSON.parse(rawExpression)
        const compiled = compileDeclarativeConditions(
          parsedRule.conditions,
          parsedRule.operator || 'and',
          context,
        )
        if (compiled) {
          return {
            allowed: true,
            whereCondition: compiled,
          }
        }
      } catch {
        // Fallback para avaliação padrão se parse falhar
      }
    }

    // B) Guardrails rigorosos contra SQL Injection em texto bruto
    if (
      rawExpression.includes(';') ||
      rawExpression.includes('--') ||
      rawExpression.includes('/*') ||
      rawExpression.includes('*/') ||
      /\b(ATTACH|DETACH|PRAGMA)\b/i.test(rawExpression)
    ) {
      return {
        allowed: false,
        error: `Acesso negado: a expressão custom_sql da tabela "${tableName}" contém caracteres ou palavras-chave proibidas (; , --, /*, PRAGMA).`,
      }
    }

    // Substitui variáveis parametrizadas @auth.id e @auth.role com sanitização estrita
    const authId = (context.user?.id || '').replace(/['";\\]/g, '')
    const authRole = (context.user?.role || context.role || 'anon').replace(/['";\\]/g, '')

    const processedCondition = sql`(${sql.raw(
      rawExpression
        .replace(/@auth\.id/g, `'${authId}'`)
        .replace(/@auth\.role/g, `'${authRole}'`),
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
