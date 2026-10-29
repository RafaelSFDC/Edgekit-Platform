export interface EdgekitClientOptions {
  url: string
  anonKey?: string
  serviceRoleKey?: string
  fetch?: typeof fetch
}

export type HonoBaseClientOptions = EdgekitClientOptions

export interface QueryBuilder<T = any> {
  select(columns: string): QueryBuilder<T>
  eq(column: string, value: any): QueryBuilder<T>
  neq(column: string, value: any): QueryBuilder<T>
  gt(column: string, value: any): QueryBuilder<T>
  gte(column: string, value: any): QueryBuilder<T>
  lt(column: string, value: any): QueryBuilder<T>
  lte(column: string, value: any): QueryBuilder<T>
  like(column: string, pattern: string): QueryBuilder<T>
  order(column: string, direction?: 'asc' | 'desc'): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  offset(count: number): QueryBuilder<T>
  execute(): Promise<{ data: T[] | null; error: Error | null; meta?: any }>
}

export function createEdgekitClient(options: EdgekitClientOptions) {
  const baseUrl = options.url.replace(/\/+$/, '')
  const apiKey = options.serviceRoleKey || options.anonKey || ''
  const customFetch = options.fetch || globalThis.fetch

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['apikey'] = apiKey
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // 1. DATABASE CLIENT & QUERY BUILDER
  function from<T = any>(table: string) {
    const params = new URLSearchParams()

    const builder: QueryBuilder<T> = {
      select(columns: string) {
        params.set('select', columns)
        return builder
      },
      eq(col: string, val: any) {
        params.set(col, `eq:${val}`)
        return builder
      },
      neq(col: string, val: any) {
        params.set(col, `neq:${val}`)
        return builder
      },
      gt(col: string, val: any) {
        params.set(col, `gt:${val}`)
        return builder
      },
      gte(col: string, val: any) {
        params.set(col, `gte:${val}`)
        return builder
      },
      lt(col: string, val: any) {
        params.set(col, `lt:${val}`)
        return builder
      },
      lte(col: string, val: any) {
        params.set(col, `lte:${val}`)
        return builder
      },
      like(col: string, pattern: string) {
        params.set(col, `like:${pattern}`)
        return builder
      },
      order(col: string, direction = 'asc') {
        params.set('order', `${col}.${direction}`)
        return builder
      },
      limit(count: number) {
        params.set('limit', String(count))
        return builder
      },
      offset(count: number) {
        params.set('offset', String(count))
        return builder
      },
      async execute() {
        try {
          const queryString = params.toString() ? `?${params.toString()}` : ''
          const res = await customFetch(`${baseUrl}/api/v1/db/${table}${queryString}`, {
            headers,
          })
          const json: any = await res.json()
          if (!res.ok || !json.success) {
            return { data: null, error: new Error(json.error?.message || 'Database error') }
          }
          return { data: json.data, error: null, meta: json.meta }
        } catch (err: any) {
          return { data: null, error: err }
        }
      },
    }

    return {
      ...builder,
      async insert(recordOrRecords: any) {
        try {
          const res = await customFetch(`${baseUrl}/api/v1/db/${table}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(recordOrRecords),
          })
          const json: any = await res.json()
          if (!res.ok || !json.success) {
            return { data: null, error: new Error(json.error?.message || 'Insert error') }
          }
          return { data: json.data, error: null }
        } catch (err: any) {
          return { data: null, error: err }
        }
      },
      async update(updates: any) {
        return {
          async eq(col: string, id: any) {
            try {
              const res = await customFetch(`${baseUrl}/api/v1/db/${table}/${id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(updates),
              })
              const json: any = await res.json()
              if (!res.ok || !json.success) {
                return { data: null, error: new Error(json.error?.message || 'Update error') }
              }
              return { data: json.data, error: null }
            } catch (err: any) {
              return { data: null, error: err }
            }
          },
        }
      },
      async delete() {
        return {
          async eq(col: string, id: any) {
            try {
              const res = await customFetch(`${baseUrl}/api/v1/db/${table}/${id}`, {
                method: 'DELETE',
                headers,
              })
              const json: any = await res.json()
              if (!res.ok || !json.success) {
                return { data: null, error: new Error(json.error?.message || 'Delete error') }
              }
              return { data: json, error: null }
            } catch (err: any) {
              return { data: null, error: err }
            }
          },
        }
      },
    }
  }

  // 2. STORAGE CLIENT
  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, file: Blob | File) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('path', path)

          const authHeaders = { ...headers }
          delete (authHeaders as any)['Content-Type']

          const res = await customFetch(`${baseUrl}/api/v1/storage/${bucket}/upload`, {
            method: 'POST',
            headers: authHeaders,
            body: formData,
          })
          const json: any = await res.json()
          return { data: json.data || null, error: json.error ? new Error(json.error.message) : null }
        },
        getPublicUrl(path: string) {
          return {
            data: {
              publicUrl: `${baseUrl}/api/v1/storage/${bucket}/file/${path}`,
            },
          }
        },
      }
    },
  }

  // 3. REALTIME CLIENT (Durable Objects WebSockets)
  const realtime = {
    channel(channelName: string) {
      const callbacks = new Map<string, Array<(payload: any) => void>>()
      let socket: any = null

      return {
        on(event: string, callback: (payload: any) => void) {
          const list = callbacks.get(event) || []
          list.push(callback)
          callbacks.set(event, list)
          return this
        },
        subscribe() {
          const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws'
          const wsUrl = `${baseUrl.replace(/^https?/, wsProtocol)}/api/v1/realtime/${channelName}/ws?apikey=${apiKey}`
          socket = new (globalThis as any).WebSocket(wsUrl)

          socket.onmessage = (msg: any) => {
            try {
              const data = JSON.parse(msg.data)
              const eventCallbacks = callbacks.get(data.event)
              if (eventCallbacks) {
                eventCallbacks.forEach((cb) => cb(data.payload))
              }
            } catch {}
          }
          return this
        },
        send(event: string, payload: any) {
          if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify({ event, data: payload }))
          }
        },
        unsubscribe() {
          socket?.close()
        },
      }
    },
  }

  // 4. AUTH CLIENT (Better-Auth)
  const auth = {
    async getUser() {
      const res = await customFetch(`${baseUrl}/api/v1/auth/me`, { headers })
      const json: any = await res.json()
      return { data: json.data || null, error: json.error ? new Error(json.error.message) : null }
    },
    async signInWithPassword(params: { email: string; password: string }) {
      const res = await customFetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      })
      const json: any = await res.json()
      return { data: json, error: !res.ok ? new Error(json.message || 'Falha ao autenticar') : null }
    },
    async signUp(params: { name: string; email: string; password: string }) {
      const res = await customFetch(`${baseUrl}/api/v1/auth/sign-up/email`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      })
      const json: any = await res.json()
      return { data: json, error: !res.ok ? new Error(json.message || 'Falha ao cadastrar') : null }
    },
  }

  return {
    from,
    storage,
    realtime,
    auth,
    url: baseUrl,
  }
}

// Backwards compatibility alias
export const createHonoBaseClient = createEdgekitClient
