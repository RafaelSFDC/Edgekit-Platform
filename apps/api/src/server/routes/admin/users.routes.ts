import { Hono } from 'hono'
import { count, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../../types'
import { getDb } from '../../db'
import { users, sessions, accounts, organizations, members } from '../../db/schema'
import { requireAdmin } from '../../auth/middleware'

export const usersRoutes = new Hono<AppEnv>()

// =========================================================================
// 1. GESTÃO DE USUÁRIOS FINAIS DO APP (Tabela `users`)
// =========================================================================

usersRoutes.post('/users', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, email, password, role } = body

  if (!name || !email || !password) {
    return c.json({ success: false, error: { message: 'Nome, e-mail e senha são obrigatórios.' } }, 400)
  }

  const db = await getDb()
  const existing = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get()
  if (existing) {
    return c.json({ success: false, error: { message: 'Já existe um usuário cadastrado com este e-mail.' } }, 400)
  }

  try {
    const { getAuth } = await import('../../auth')
    const auth = await getAuth()
    const userRes = await auth.api.signUpEmail({
      body: { name, email, password },
    })

    const assignedRole = role || 'user'
    if (assignedRole !== 'user') {
      await db.update(users).set({ role: assignedRole }).where(eq(users.email, email))
    }

    return c.json(
      {
        success: true,
        message: 'Usuário final da aplicação criado com sucesso!',
        data: { ...userRes.user, role: assignedRole },
      },
      201,
    )
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message || 'Falha ao criar usuário.' } }, 500)
  }
})

usersRoutes.patch('/users/:id/role', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const role = body.role || 'user'
  const db = await getDb()

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id))
  return c.json({ success: true, message: `Função do usuário atualizada para ${role}.` })
})

usersRoutes.delete('/users/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const db = await getDb()

  await db.delete(sessions).where(eq(sessions.userId, id)).catch(() => {})
  await db.delete(accounts).where(eq(accounts.userId, id)).catch(() => {})
  await db.delete(users).where(eq(users.id, id))

  return c.json({ success: true, message: 'Usuário removido com sucesso.' })
})

// =========================================================================
// 2. SESSÕES E ORGANIZAÇÕES DA APLICAÇÃO (BETTER AUTH EXTENSIONS)
// =========================================================================

// Listar sessões ativas de um usuário
usersRoutes.get('/users/:id/sessions', requireAdmin(), async (c) => {
  const userId = c.req.param('id')
  const db = await getDb()
  const userSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).all()

  return c.json({
    success: true,
    data: userSessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      activeOrganizationId: s.activeOrganizationId,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    })),
  })
})

// Revogar sessão de usuário
usersRoutes.delete('/sessions/:id', requireAdmin(), async (c) => {
  const sessionId = c.req.param('id')
  const db = await getDb()
  await db.delete(sessions).where(eq(sessions.id, sessionId))

  return c.json({ success: true, message: 'Sessão revogada com sucesso.' })
})

// Listar organizações
usersRoutes.get('/organizations', requireAdmin(), async (c) => {
  const db = await getDb()
  const orgs = await db.select().from(organizations).all()

  const orgsWithCount = await Promise.all(
    orgs.map(async (org) => {
      const memberCount = await db
        .select({ count: count() })
        .from(members)
        .where(eq(members.organizationId, org.id))
        .get()

      return {
        ...org,
        memberCount: memberCount?.count ?? 0,
      }
    }),
  )

  return c.json({ success: true, data: orgsWithCount })
})

// Criar organização diretamente como admin
usersRoutes.post('/organizations', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, slug } = body

  if (!name || !slug) {
    return c.json({ success: false, error: { message: 'Nome e slug são obrigatórios.' } }, 400)
  }

  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  const db = await getDb()

  const existing = await db.select().from(organizations).where(eq(organizations.slug, cleanSlug)).get()
  if (existing) {
    return c.json({ success: false, error: { message: 'Já existe uma organização com este slug.' } }, 400)
  }

  const now = new Date()
  const newOrg = {
    id: nanoid(),
    name: name.trim(),
    slug: cleanSlug,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(organizations).values(newOrg)
  return c.json({ success: true, data: newOrg }, 201)
})

// Listar membros de uma organização
usersRoutes.get('/organizations/:id/members', requireAdmin(), async (c) => {
  const orgId = c.req.param('id')
  const db = await getDb()

  const memberRows = await db
    .select({
      memberId: members.id,
      role: members.role,
      joinedAt: members.createdAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, orgId))
    .all()

  return c.json({ success: true, data: memberRows })
})

// Adicionar membro a uma organização
usersRoutes.post('/organizations/:id/members', requireAdmin(), async (c) => {
  const orgId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const { userId, role } = body

  if (!userId) {
    return c.json({ success: false, error: { message: 'ID do usuário é obrigatório.' } }, 400)
  }

  const db = await getDb()
  const existing = await db
    .select()
    .from(members)
    .where(sql`${members.organizationId} = ${orgId} AND ${members.userId} = ${userId}`)
    .get()

  if (existing) {
    return c.json({ success: false, error: { message: 'Usuário já é membro desta organização.' } }, 400)
  }

  const now = new Date()
  await db.insert(members).values({
    id: nanoid(),
    organizationId: orgId,
    userId,
    role: role || 'member',
    createdAt: now,
  })

  return c.json({ success: true, message: 'Membro adicionado com sucesso.' }, 201)
})

// Remover membro de uma organização
usersRoutes.delete('/organizations/:id/members/:userId', requireAdmin(), async (c) => {
  const orgId = c.req.param('id')
  const userId = c.req.param('userId')
  const db = await getDb()

  await db
    .delete(members)
    .where(sql`${members.organizationId} = ${orgId} AND ${members.userId} = ${userId}`)

  return c.json({ success: true, message: 'Membro removido da organização.' })
})
