export const env: Record<string, unknown> | undefined = undefined

export class DurableObject {
  ctx: unknown
  env: unknown
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx
    this.env = env
  }
}

export class WorkerEntrypoint {
  ctx: unknown
  env: unknown
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx
    this.env = env
  }
}

export default {
  env,
  DurableObject,
  WorkerEntrypoint,
}
