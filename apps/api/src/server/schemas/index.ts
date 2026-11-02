import { z } from 'zod'

export const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/

export const AdminSetupSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve conter pelo menos 2 caracteres').max(100),
  email: z.string().trim().email('E-mail informado é inválido'),
  password: z.string().min(8, 'A senha deve conter no mínimo 8 caracteres').max(128),
  setupToken: z.string().trim().optional(),
})

export type AdminSetupInput = z.infer<typeof AdminSetupSchema>

export const AdminLoginSchema = z.object({
  email: z.string().trim().email('E-mail informado é inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Nome da chave é obrigatório').max(100),
  type: z.enum(['anon', 'service_role']),
  expiresAt: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
})

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>

export const StructuredQuerySchema = z.object({
  select: z.union([z.string(), z.array(z.string())]).optional(),
  columns: z.union([z.string(), z.array(z.string())]).optional(),
  where: z
    .array(
      z.object({
        field: z.string().regex(SAFE_IDENTIFIER, 'Identificador de campo inválido no filtro'),
        op: z
          .enum([
            'eq',
            'neq',
            'gt',
            'gte',
            'lt',
            'lte',
            'like',
            'ilike',
            'in',
            'not_in',
            'is',
            'is_null',
            'is_not_null',
            'between',
            'contains',
            'containedBy',
            'contained_by',
            'overlaps',
            'not',
          ])
          .default('eq'),
        value: z.any().optional(),
      }),
    )
    .optional(),
  expand: z.union([z.string(), z.array(z.string())]).optional(),
  orderBy: z
    .array(
      z.object({
        field: z.string().regex(SAFE_IDENTIFIER, 'Identificador de coluna inválido na ordenação'),
        direction: z.enum(['asc', 'desc']).optional(),
      }),
    )
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  single: z.boolean().optional(),
})

export type StructuredQueryInput = z.infer<typeof StructuredQuerySchema>

export const BatchMutationItemSchema = z.object({
  type: z.enum(['insert', 'update', 'delete']),
  table: z.string().regex(SAFE_IDENTIFIER, 'Identificador de tabela inválido'),
  id: z.string().optional(),
  data: z.record(z.any()).optional(),
})

export const BatchMutationsSchema = z.object({
  operations: z
    .array(BatchMutationItemSchema)
    .min(1, 'Informe pelo menos uma operação na lista de lote.'),
})

export type BatchMutationsInput = z.infer<typeof BatchMutationsSchema>

export const CreateWebhookSchema = z.object({
  name: z.string().trim().min(1, 'Nome do webhook é obrigatório').max(100),
  url: z.string().trim().url('URL informada é inválida'),
  events: z.array(z.string()).optional(),
  secret: z.string().trim().optional(),
  enabled: z.boolean().optional(),
})

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>

export const UpdateWebhookSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: z.string().trim().url().optional(),
  events: z.array(z.string()).optional(),
  secret: z.string().trim().optional(),
  enabled: z.boolean().optional(),
})

export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>

export const PolicyRuleTypeSchema = z.enum([
  'disabled',
  'public',
  'authenticated',
  'owner',
  'org_member',
  'custom_sql',
])

export const TablePolicyUpdateSchema = z.object({
  rlsEnabled: z.boolean().optional(),
  selectRule: PolicyRuleTypeSchema.optional(),
  insertRule: PolicyRuleTypeSchema.optional(),
  updateRule: PolicyRuleTypeSchema.optional(),
  deleteRule: PolicyRuleTypeSchema.optional(),
  ownerColumn: z.string().regex(SAFE_IDENTIFIER, 'Identificador de coluna inválido').optional(),
  customRule: z.string().nullable().optional(),
})

export type TablePolicyUpdateInput = z.infer<typeof TablePolicyUpdateSchema>
