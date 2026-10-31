import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, admin, organization, twoFactor, magicLink, emailOTP } from 'better-auth/plugins'
import { getDatabaseRuntime, schema } from '../db'
import { getBindings } from '../env'
import { ensureDefaultKeys } from './keys'

let cachedAuth: any = undefined

export async function getAuth() {
  if (cachedAuth) {
    return cachedAuth
  }

  const runtime = await getDatabaseRuntime()
  const bindings = await getBindings()
  const baseUrl = bindings.APP_URL || 'http://localhost:3000'
  const secret = bindings.BETTER_AUTH_SECRET || 'dev-edgekit-platform-secret-change-in-production'

  // Garante as chaves de API essenciais no banco de forma segura
  await ensureDefaultKeys(runtime.db)

  cachedAuth = betterAuth({
    secret,
    baseURL: baseUrl,
    basePath: '/api/v1/auth',
    database: drizzleAdapter(runtime.db, {
      provider: runtime.provider,
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
        twoFactor: schema.twoFactors,
      },
    }),
    plugins: [
      bearer(),
      admin(),
      organization(),
      twoFactor({
        issuer: 'Edgekit Platform',
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          console.log(`[Edgekit Auth MagicLink] Sent to ${email}: ${url}`)
        },
      }),
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }) => {
          console.log(`[Edgekit Auth EmailOTP] Sent to ${email} (type: ${type}): ${otp}`)
        },
      }),
    ],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 7200, // 2 horas de cache em cookie assinado para reduzir leituras no D1
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    socialProviders:
      bindings.GOOGLE_CLIENT_ID && bindings.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: bindings.GOOGLE_CLIENT_ID as string,
              clientSecret: bindings.GOOGLE_CLIENT_SECRET as string,
            },
          }
        : {},
    trustedOrigins: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      baseUrl,
    ],
  })

  return cachedAuth
}

export async function getSessionFromHeaders(headers: HeadersInit) {
  try {
    const auth = await getAuth()
    return await auth.api.getSession({ headers })
  } catch {
    return null
  }
}
