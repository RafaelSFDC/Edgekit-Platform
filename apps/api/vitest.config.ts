import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(import.meta.dirname, './test/cloudflare-workers-mock.ts'),
    },
  },
})
