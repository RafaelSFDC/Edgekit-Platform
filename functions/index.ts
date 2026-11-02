import hello, { meta as helloMeta } from './hello/index'
import healthCheck, { meta as healthCheckMeta } from './health-check/index'

export interface LocalEdgeFunction {
  meta: {
    name: string
    description: string
    methods: string[]
    endpoint: string
  }
  handler: {
    fetch: (request: Request, env: any, ctx: any) => Promise<Response> | Response
  }
}

export const localFunctionsRegistry: Record<string, LocalEdgeFunction> = {
  hello: {
    meta: helloMeta,
    handler: hello,
  },
  'health-check': {
    meta: healthCheckMeta,
    handler: healthCheck,
  },
}

export function listLocalFunctions() {
  return Object.values(localFunctionsRegistry).map((fn) => fn.meta)
}

export function getLocalFunction(name: string) {
  return localFunctionsRegistry[name] || null
}
