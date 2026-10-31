export interface EdgekitClientOptions {
  url: string
  anonKey?: string
  serviceRoleKey?: string
  token?: string
  credentials?: 'include' | 'omit' | 'same-origin'
  fetch?: typeof fetch
}

export interface QueryBuilder<T = any> {
  select(columns: string): QueryBuilder<T>
  expand(relations: string | string[]): QueryBuilder<T>
  eq(column: string, value: any): QueryBuilder<T>
  neq(column: string, value: any): QueryBuilder<T>
  gt(column: string, value: any): QueryBuilder<T>
  gte(column: string, value: any): QueryBuilder<T>
  lt(column: string, value: any): QueryBuilder<T>
  lte(column: string, value: any): QueryBuilder<T>
  like(column: string, pattern: string): QueryBuilder<T>
  in(column: string, values: any[]): QueryBuilder<T>
  notIn(column: string, values: any[]): QueryBuilder<T>
  isNull(column: string): QueryBuilder<T>
  isNotNull(column: string): QueryBuilder<T>
  filter(column: string, operator: string, value: any): QueryBuilder<T>
  order(column: string, direction?: 'asc' | 'desc'): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  offset(count: number): QueryBuilder<T>
  execute(): Promise<{ data: T[] | null; error: Error | null; meta?: any }>
}

export interface RealtimeChannel {
  on(event: string, callback: (payload: any) => void): RealtimeChannel
  subscribe(): RealtimeChannel
  send(event: string, payload: any): void
  unsubscribe(): void
}

export function createEdgekitClient(options: EdgekitClientOptions) {
  const baseUrl = options.url.replace(/\/+$/, '')
  const apiKey = options.serviceRoleKey || options.anonKey || ''
  const customFetch = options.fetch || globalThis.fetch
  const fetchCredentials = options.credentials || 'include'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['apikey'] = apiKey
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }

  function setToken(token: string | null) {
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    } else {
      delete headers['Authorization']
    }
  }

  function req(init: Record<string, any> = {}): any {
    const r: Record<string, any> = {
      headers,
      ...init,
    }
    if (fetchCredentials) {
      r.credentials = fetchCredentials
    }
    return r
  }

  // 1. REALTIME CLIENT (Durable Objects WebSockets Multiplexed)
  let sharedSocket: any = null
  const activeChannels = new Map<string, Map<string, Array<(payload: any) => void>>>()
  const pendingSubscriptions = new Set<string>()

  function getOrConnectSocket(): any {
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      return null
    }
    if (sharedSocket && (sharedSocket.readyState === 0 || sharedSocket.readyState === 1)) {
      return sharedSocket
    }

    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws'
    const wsUrl = `${baseUrl.replace(/^https?/, wsProtocol)}/api/v1/realtime/ws?apikey=${encodeURIComponent(apiKey)}`

    sharedSocket = new (globalThis as any).WebSocket(wsUrl)

    sharedSocket.onopen = () => {
      for (const channelName of activeChannels.keys()) {
        sharedSocket.send(JSON.stringify({ action: 'subscribe', channel: channelName }))
      }
      for (const channelName of pendingSubscriptions) {
        sharedSocket.send(JSON.stringify({ action: 'subscribe', channel: channelName }))
      }
      pendingSubscriptions.clear()
    }

    sharedSocket.onclose = () => {
      sharedSocket = null
      if (activeChannels.size > 0 && typeof setTimeout !== 'undefined') {
        setTimeout(() => {
          if (activeChannels.size > 0 && !sharedSocket) {
            getOrConnectSocket()
          }
        }, 1500)
      }
    }

    sharedSocket.onerror = () => {
      // Deixa o onclose cuidar do ciclo de reconexão
    }

    sharedSocket.onmessage = (msg: any) => {
      try {
        const raw = typeof msg.data === 'string' ? msg.data : new TextDecoder().decode(msg.data)
        const data = JSON.parse(raw)
        const channelName = data.channel
        if (channelName && activeChannels.has(channelName)) {
          const channelCallbacks = activeChannels.get(channelName)!
          const eventCallbacks = channelCallbacks.get(data.event)
          if (eventCallbacks) {
            eventCallbacks.forEach((cb) => cb(data.payload ?? data))
          }
          const allCallbacks = channelCallbacks.get('*')
          if (allCallbacks) {
            allCallbacks.forEach((cb) => cb(data))
          }
        }
      } catch {}
    }

    return sharedSocket
  }

  const realtime = {
    channel(channelName: string): RealtimeChannel {
      let channelCallbacks = activeChannels.get(channelName)
      if (!channelCallbacks) {
        channelCallbacks = new Map()
        activeChannels.set(channelName, channelCallbacks)
      }

      const channelObj: RealtimeChannel = {
        on(event: string, callback: (payload: any) => void) {
          const list = channelCallbacks!.get(event) || []
          list.push(callback)
          channelCallbacks!.set(event, list)
          return channelObj
        },
        subscribe() {
          const socket = getOrConnectSocket()
          if (socket) {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ action: 'subscribe', channel: channelName }))
            } else {
              pendingSubscriptions.add(channelName)
            }
          }
          return channelObj
        },
        send(event: string, payload: any) {
          const socket = getOrConnectSocket()
          if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify({ action: 'broadcast', channel: channelName, event, data: payload }))
          }
        },
        unsubscribe() {
          activeChannels.delete(channelName)
          pendingSubscriptions.delete(channelName)
          if (sharedSocket && sharedSocket.readyState === 1) {
            sharedSocket.send(JSON.stringify({ action: 'unsubscribe', channel: channelName }))
          }
          if (activeChannels.size === 0 && sharedSocket) {
            try { sharedSocket.close() } catch {}
            sharedSocket = null
          }
        },
      }

      return channelObj
    },
    getSocket() {
      return sharedSocket
    },
  }

  // 2. DATABASE CLIENT & QUERY BUILDER (com suporte a Realtime CDC)
  function from<T = any>(table: string) {
    const params = new URLSearchParams()

    const builder: QueryBuilder<T> = {
      select(columns: string) {
        params.set('select', columns)
        return builder
      },
      expand(relations: string | string[]) {
        const val = Array.isArray(relations) ? relations.join(',') : relations
        params.set('expand', val)
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
      in(col: string, values: any[]) {
        params.set(col, `in:${values.join(',')}`)
        return builder
      },
      notIn(col: string, values: any[]) {
        params.set(col, `not_in:${values.join(',')}`)
        return builder
      },
      isNull(col: string) {
        params.set(col, 'is:null')
        return builder
      },
      isNotNull(col: string) {
        params.set(col, 'is:not_null')
        return builder
      },
      filter(col: string, op: string, val: any) {
        const cleanOp = op.toLowerCase()
        if (cleanOp === 'in' && Array.isArray(val)) {
          return builder.in(col, val)
        }
        if (cleanOp === 'not_in' && Array.isArray(val)) {
          return builder.notIn(col, val)
        }
        if (cleanOp === 'is' && val === null) {
          return builder.isNull(col)
        }
        if (cleanOp === 'is_not' && val === null) {
          return builder.isNotNull(col)
        }
        params.set(col, `${cleanOp}:${val}`)
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
          const res = await customFetch(`${baseUrl}/api/v1/db/${table}${queryString}`, req())
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
          const res = await customFetch(
            `${baseUrl}/api/v1/db/${table}`,
            req({
              method: 'POST',
              body: JSON.stringify(recordOrRecords),
            }),
          )
          const json: any = await res.json()
          if (!res.ok || !json.success) {
            return { data: null, error: new Error(json.error?.message || 'Insert error') }
          }
          return { data: json.data, error: null }
        } catch (err: any) {
          return { data: null, error: err }
        }
      },
      update(updates: any) {
        return {
          async eq(col: string, id: any) {
            try {
              const res = await customFetch(
                `${baseUrl}/api/v1/db/${table}/${id}`,
                req({
                  method: 'PATCH',
                  body: JSON.stringify(updates),
                }),
              )
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
      delete() {
        return {
          async eq(col: string, id: any) {
            try {
              const res = await customFetch(
                `${baseUrl}/api/v1/db/${table}/${id}`,
                req({ method: 'DELETE' }),
              )
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
      // Realtime Database CDC Listener
      on(event: 'INSERT' | 'UPDATE' | 'DELETE' | '*', callback: (payload: any) => void) {
        const ch = realtime.channel(`db:${table}`)
        if (event === '*') {
          ch.on('INSERT', callback)
          ch.on('UPDATE', callback)
          ch.on('DELETE', callback)
        } else {
          ch.on(event, callback)
        }
        return ch
      },
      // Declarative Query Execution (Zero-Raw SQL)
      async query(structuredSpec: {
        select?: string[] | string
        columns?: string[] | string
        where?: Array<{ field: string; op: string; value: any }>
        expand?: string[] | string
        orderBy?: Array<{ field: string; direction?: 'asc' | 'desc' }>
        limit?: number
        offset?: number
      }) {
        try {
          const res = await customFetch(
            `${baseUrl}/api/v1/db/${table}/query`,
            req({
              method: 'POST',
              body: JSON.stringify(structuredSpec),
            }),
          )
          const json: any = await res.json()
          if (!res.ok || !json.success) {
            return { data: null, error: new Error(json.error?.message || 'Query error') }
          }
          return { data: json.data, error: null, meta: json.meta }
        } catch (err: any) {
          return { data: null, error: err }
        }
      },
    }
  }

  // 3. STORAGE CLIENT
  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, file: Blob | File) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('path', path)

          const authHeaders = { ...headers }
          delete (authHeaders as any)['Content-Type']

          const res = await customFetch(
            `${baseUrl}/api/v1/storage/${bucket}/upload`,
            req({
              method: 'POST',
              headers: authHeaders,
              body: formData,
            }),
          )
          const json: any = await res.json()
          return { data: json.data || null, error: json.error ? new Error(json.error.message) : null }
        },
        async delete(path: string) {
          const res = await customFetch(
            `${baseUrl}/api/v1/storage/${bucket}/file/${path}`,
            req({ method: 'DELETE' }),
          )
          const json: any = await res.json()
          return { data: json, error: !res.ok ? new Error(json.error?.message || 'Delete error') : null }
        },
        async list() {
          const res = await customFetch(`${baseUrl}/api/v1/storage/${bucket}/list`, req())
          const json: any = await res.json()
          return { data: json.data || [], error: !res.ok ? new Error(json.error?.message || 'List error') : null }
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

  // 4. AUTH CLIENT
  const auth = {
    async getUser() {
      const res = await customFetch(`${baseUrl}/api/v1/auth/me`, req())
      const json: any = await res.json()
      return {
        data: json.data || null,
        error: json.error ? new Error(json.error.message) : null,
      }
    },
    async getSession() {
      const res = await customFetch(`${baseUrl}/api/v1/auth/me`, req())
      const json: any = await res.json()
      return { data: json.data || null, error: json.error ? new Error(json.error.message) : null }
    },
    async signInWithPassword(params: { email: string; password: string }) {
      const res = await customFetch(
        `${baseUrl}/api/v1/auth/sign-in/email`,
        req({
          method: 'POST',
          body: JSON.stringify(params),
        }),
      )
      const json: any = await res.json()
      if (json?.token) {
        setToken(json.token)
      }
      return { data: json, error: !res.ok ? new Error(json?.message || 'Falha ao autenticar') : null }
    },
    async signUp(params: { name: string; email: string; password: string }) {
      const res = await customFetch(
        `${baseUrl}/api/v1/auth/sign-up/email`,
        req({
          method: 'POST',
          body: JSON.stringify(params),
        }),
      )
      const json: any = await res.json()
      if (json?.token) {
        setToken(json.token)
      }
      return { data: json, error: !res.ok ? new Error(json?.message || 'Falha ao cadastrar') : null }
    },
    async signOut() {
      const res = await customFetch(
        `${baseUrl}/api/v1/auth/sign-out`,
        req({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      )
      setToken(null)
      return { data: true, error: !res.ok ? new Error('Falha ao deslogar') : null }
    },
  }

  return {
    from,
    storage,
    realtime,
    auth,
    setToken,
    url: baseUrl,
  }
}

