import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './apps/api/src/server/db/do-schema.ts',
  out: './drizzle/do-migrations',
})
