import type {
  PlatformStats,
  D1TableInfo,
  SqlQueryResult,
  StorageFile,
  SetupStatusResponse,
  PlatformKeys,
  TablePolicy,
  SecuritySettings,
  WebhookInfo,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    : '') || '';

export const STORAGE_KEY_ADMIN = 'edgekit_platform_admin_key';

export function getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const key = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ADMIN) : null;
  if (key) {
    headers['apikey'] = key;
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

export interface ApiRequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  errorMessage?: string;
  skipErrorCheck?: boolean;
}

export interface ApiRequestResult<T = any> {
  res: Response;
  json: any;
  data: T;
}

/**
 * Função base padronizada de comunicação HTTP com a API Cloudflare Workers.
 * Garante que 100% das chamadas enviem `credentials: 'include'` para tráfego seguro de cookies HttpOnly
 * em ambientes cross-origin e local, injeta chaves administrativas de forma centralizada
 * e padroniza o tratamento de erros em instâncias de `ApiError`.
 */
export async function apiRequest<T = any>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiRequestResult<T>> {
  const {
    method = 'GET',
    body,
    headers: customHeaders,
    errorMessage,
    skipErrorCheck = false,
  } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = getHeaders(customHeaders);

  if (isFormData) {
    delete finalHeaders['Content-Type'];
  }

  const fetchInit: RequestInit = {
    method,
    headers: finalHeaders,
    credentials: 'include',
  };

  if (body !== undefined) {
    fetchInit.body = isFormData || typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, fetchInit);

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { success: false, error: { message: text } };
  }

  if (!skipErrorCheck && (!res.ok || json.success === false)) {
    const msg =
      json?.error?.message ||
      json?.message ||
      errorMessage ||
      `Falha na requisição (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  return { res, json, data: json.data as T };
}

// =========================================================================
// 1. AUTENTICAÇÃO E SESSÃO ADMINISTRATIVA
// =========================================================================

export async function fetchAuthMe(): Promise<{ authenticated: boolean; data?: any }> {
  try {
    const { res, json } = await apiRequest('/api/v1/admin/me', { skipErrorCheck: true });
    if (!res.ok) {
      return { authenticated: false };
    }
    return {
      authenticated: Boolean(json.success && (json.data?.admin || json.data?.apiKey)),
      data: json.data,
    };
  } catch {
    return { authenticated: false };
  }
}

export async function loginAuth(passkey: string): Promise<{ authenticated: boolean; role?: string }> {
  const clean = passkey.trim();
  const { res, json } = await apiRequest('/api/v1/admin/login', {
    method: 'POST',
    body: { key: clean },
    skipErrorCheck: true,
  });

  if (!res.ok || !json.authenticated) {
    throw new ApiError(
      json.error?.message || 'Chave de acesso inválida.',
      res.status
    );
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ADMIN, clean);
  }

  return { authenticated: true, role: json.role };
}

export async function logoutAuth(): Promise<{ authenticated: boolean }> {
  try {
    await apiRequest('/api/v1/admin/logout', {
      method: 'POST',
      skipErrorCheck: true,
    });
  } catch {}

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_ADMIN);
  }

  return { authenticated: false };
}

export async function checkSetupStatus(): Promise<SetupStatusResponse> {
  const { json } = await apiRequest('/api/v1/admin/setup-status', {
    errorMessage: 'Falha ao verificar status do setup.',
  });
  return json.data ?? { isSetupComplete: true };
}

export async function performSetup(data: {
  name: string;
  email: string;
  password: string;
  setupToken?: string;
}): Promise<any> {
  const { json } = await apiRequest('/api/v1/admin/setup', {
    method: 'POST',
    body: data,
    errorMessage: 'Falha ao executar o setup inicial.',
  });
  return json;
}

export async function loginAdminCredentials(credentials: {
  email: string;
  password: string;
}): Promise<{ authenticated: boolean; role?: string; admin?: any }> {
  const { res, json } = await apiRequest('/api/v1/admin/login', {
    method: 'POST',
    body: {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    },
    skipErrorCheck: true,
  });

  if (!res.ok || !json.authenticated) {
    throw new ApiError(
      json.error?.message || 'Credenciais de administrador inválidas.',
      res.status
    );
  }

  return { authenticated: true, role: json.role, admin: json.data?.admin };
}

// =========================================================================
// 2. ESTATÍSTICAS E TABELAS CLOUDFLARE D1
// =========================================================================

export async function fetchStats(): Promise<PlatformStats> {
  const { data } = await apiRequest<PlatformStats>('/api/v1/admin/stats', {
    errorMessage: 'Falha ao buscar estatísticas da plataforma.',
  });
  return data;
}

export async function fetchTables(): Promise<D1TableInfo[]> {
  const { data } = await apiRequest<D1TableInfo[]>('/api/v1/admin/tables', {
    errorMessage: 'Falha ao listar tabelas do Cloudflare D1.',
  });
  return data || [];
}

export async function createTable(data: {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    primaryKey?: boolean;
    notNull?: boolean;
    defaultValue?: string;
    references?: {
      table: string;
      column?: string;
      onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    };
  }>;
}): Promise<any> {
  const { json } = await apiRequest('/api/v1/admin/tables', {
    method: 'POST',
    body: data,
    errorMessage: 'Falha ao criar tabela.',
  });
  return json;
}

export async function dropTable(tableName: string): Promise<boolean> {
  await apiRequest(`/api/v1/admin/tables/${encodeURIComponent(tableName)}`, {
    method: 'DELETE',
    errorMessage: 'Falha ao excluir tabela.',
  });
  return true;
}

// =========================================================================
// 3. OPERAÇÕES CRUD NO BANCO DE DADOS (D1)
// =========================================================================

export async function fetchTableRows(
  table: string,
  limit = 50,
  offset = 0
): Promise<any[]> {
  const { data } = await apiRequest<any[]>(
    `/api/v1/db/${encodeURIComponent(table)}?limit=${limit}&offset=${offset}`,
    {
      errorMessage: `Falha ao carregar registros da tabela "${table}".`,
    }
  );
  return data || [];
}

export async function insertTableRow(table: string, record: any): Promise<any> {
  const { data } = await apiRequest(
    `/api/v1/db/${encodeURIComponent(table)}`,
    {
      method: 'POST',
      body: record,
      errorMessage: 'Falha ao inserir linha.',
    }
  );
  return data;
}

export async function updateTableRow(table: string, id: string, record: any): Promise<any> {
  const { data } = await apiRequest(
    `/api/v1/db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: record,
      errorMessage: 'Falha ao atualizar linha.',
    }
  );
  return data;
}

export async function deleteTableRow(table: string, id: string): Promise<boolean> {
  await apiRequest(
    `/api/v1/db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      errorMessage: 'Falha ao excluir registro.',
    }
  );
  return true;
}

export async function runStructuredQuery(
  table: string,
  spec: {
    select?: string[] | string;
    where?: Array<{ field: string; op: string; value: any }>;
    orderBy?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
    limit?: number;
    offset?: number;
    expand?: string[] | string;
    single?: boolean;
  },
): Promise<{
  success: boolean;
  data?: any[];
  meta?: { total: number; limit: number; offset: number; hasMore: boolean };
  error?: { message: string; code?: string };
}> {
  try {
    const { json } = await apiRequest(`/api/v1/db/${encodeURIComponent(table)}/query`, {
      method: 'POST',
      body: spec,
    });
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: {
        message: err.message || 'Falha ao executar consulta declarativa.',
      },
    };
  }
}

// =========================================================================
// 4. EDGE FUNCTIONS, SQL DIRETO E SCHEMA TYPEGEN
// =========================================================================

export async function fetchFunctionsList(): Promise<
  Array<{
    name: string;
    description: string;
    methods: string[];
    endpoint: string;
  }>
> {
  const { data } = await apiRequest<Array<{
    name: string;
    description: string;
    methods: string[];
    endpoint: string;
  }>>('/api/v1/functions', {
    errorMessage: 'Falha ao listar Edge Functions locais.',
  });
  return data || [];
}

export async function invokeFunctionTest(
  functionName: string,
  method = 'GET',
  body?: any,
): Promise<{ status: number; ok: boolean; data: any }> {
  const fetchHeaders = getHeaders();
  const init: RequestInit = {
    method,
    headers: fetchHeaders,
    credentials: 'include',
  };
  if (body && method !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}/api/v1/functions/${encodeURIComponent(functionName)}`, init);
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch {
    return { status: res.status, ok: res.ok, data: text };
  }
}

export async function fetchGeneratedTypes(): Promise<string> {
  const { data } = await apiRequest<{ typescript?: string }>('/api/v1/admin/schema/types', {
    errorMessage: 'Falha ao gerar tipagens TypeScript do schema.',
  });
  return data?.typescript || '';
}

export async function runSql(query: string): Promise<SqlQueryResult> {
  try {
    const { json } = await apiRequest('/api/v1/admin/sql', {
      method: 'POST',
      body: { query },
    });
    return {
      success: true,
      rowCount: json.rowCount,
      rows: json.rows,
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        message: err.message || 'Erro ao executar consulta SQL.',
      },
    };
  }
}

// =========================================================================
// 5. STORAGE CLOUDFLARE R2
// =========================================================================

export async function fetchFiles(bucket = 'default'): Promise<StorageFile[]> {
  const { json } = await apiRequest(`/api/v1/storage/${encodeURIComponent(bucket)}/list`, {
    errorMessage: 'Falha ao listar arquivos do storage R2.',
  });
  return json.data?.objects || json.data || [];
}

export async function uploadFile(bucket: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiRequest(
    `/api/v1/storage/${encodeURIComponent(bucket)}/upload`,
    {
      method: 'POST',
      body: formData,
      errorMessage: 'Falha ao enviar arquivo.',
    }
  );
  return data;
}

export async function deleteFile(bucket: string, key: string): Promise<boolean> {
  await apiRequest(
    `/api/v1/storage/${encodeURIComponent(bucket)}/file/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      errorMessage: 'Falha ao excluir arquivo.',
    }
  );
  return true;
}

export async function fetchBuckets(): Promise<any[]> {
  const { data } = await apiRequest<any[]>('/api/v1/storage/buckets', {
    errorMessage: 'Falha ao listar buckets.',
  });
  return data || [];
}

export async function createBucket(data: {
  name: string;
  isPublic?: boolean;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  readRule?: string;
  writeRule?: string;
}): Promise<any> {
  const { data: result } = await apiRequest('/api/v1/storage/buckets', {
    method: 'POST',
    body: data,
    errorMessage: 'Falha ao criar bucket.',
  });
  return result;
}

export async function updateBucket(
  name: string,
  data: {
    isPublic?: boolean;
    maxSizeBytes?: number;
    allowedMimeTypes?: string[];
    readRule?: string;
    writeRule?: string;
  }
): Promise<any> {
  const { data: result } = await apiRequest(`/api/v1/storage/buckets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: data,
    errorMessage: 'Falha ao atualizar bucket.',
  });
  return result;
}

export async function generateSignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 3600
): Promise<{ url: string; expiresAt: string }> {
  const { data } = await apiRequest<{ url: string; expiresAt: string }>(
    `/api/v1/storage/${encodeURIComponent(bucket)}/signed-url`,
    {
      method: 'POST',
      body: { key, expiresInSeconds },
      errorMessage: 'Falha ao gerar link assinado.',
    }
  );
  return data;
}

// =========================================================================
// 6. CHAVES, CONFIGURAÇÃO PÚBLICA E REALTIME BROADCAST
// =========================================================================

export async function fetchKeys(): Promise<PlatformKeys> {
  const { data } = await apiRequest<PlatformKeys>('/api/v1/admin/keys', {
    errorMessage: 'Falha ao obter credenciais da plataforma.',
  });
  return data || {};
}

export async function fetchPublicConfig(): Promise<any> {
  const { data } = await apiRequest('/api/v1/auth/public-config', {
    errorMessage: 'Falha ao obter configurações públicas.',
  });
  return data;
}

export async function broadcastRealtime(
  channel: string,
  event: string,
  payload: any
): Promise<any> {
  const { json } = await apiRequest(
    `/api/v1/realtime/${encodeURIComponent(channel)}/broadcast`,
    {
      method: 'POST',
      body: { event, payload },
      errorMessage: 'Falha ao emitir mensagem realtime.',
    }
  );
  return json;
}

// =========================================================================
// 7. POLÍTICAS DE TABELA E SEGURANÇA
// =========================================================================

export async function fetchTablePolicy(
  table: string
): Promise<TablePolicy> {
  try {
    const { data } = await apiRequest<TablePolicy>(
      `/api/v1/admin/tables/${encodeURIComponent(table)}/policy`,
      {
        errorMessage: 'Falha ao obter política da tabela.',
      }
    );
    return (
      data || {
        tableName: table,
        rlsEnabled: true,
        selectRule: 'public',
        insertRule: 'authenticated',
        updateRule: 'owner',
        deleteRule: 'owner',
        ownerColumn: 'user_id',
      }
    );
  } catch {
    return {
      tableName: table,
      rlsEnabled: true,
      selectRule: 'public',
      insertRule: 'authenticated',
      updateRule: 'owner',
      deleteRule: 'owner',
      ownerColumn: 'user_id',
    };
  }
}

export async function updateTablePolicy(
  table: string,
  policy: Partial<TablePolicy>
): Promise<any> {
  const { data } = await apiRequest(
    `/api/v1/admin/tables/${encodeURIComponent(table)}/policy`,
    {
      method: 'PUT',
      body: policy,
      errorMessage: 'Falha ao atualizar política da tabela.',
    }
  );
  return data;
}

export async function fetchSecuritySettings(): Promise<SecuritySettings> {
  try {
    const { data } = await apiRequest<SecuritySettings>(
      '/api/v1/admin/settings/security',
      {
        errorMessage: 'Falha ao obter configurações de segurança.',
      }
    );
    return data || { allowedOrigins: [], allowedIps: [], blockExternalLocalhost: true };
  } catch {
    return { allowedOrigins: [], allowedIps: [], blockExternalLocalhost: true };
  }
}

export async function updateSecuritySettings(
  settings: Partial<SecuritySettings>
): Promise<any> {
  const { data } = await apiRequest('/api/v1/admin/settings/security', {
    method: 'PUT',
    body: settings,
    errorMessage: 'Falha ao salvar configurações de segurança.',
  });
  return data;
}

// =========================================================================
// 8. ADMINISTRAÇÃO DE USUÁRIOS E ORGANIZAÇÕES
// =========================================================================

export async function adminCreateUser(data: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<any> {
  const { data: result } = await apiRequest('/api/v1/admin/users', {
    method: 'POST',
    body: data,
    errorMessage: 'Falha ao criar usuário.',
  });
  return result;
}

export async function adminUpdateUserRole(id: string, role: string): Promise<any> {
  const { json } = await apiRequest(`/api/v1/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    body: { role },
    errorMessage: 'Falha ao atualizar função do usuário.',
  });
  return json;
}

export async function adminDeleteUser(id: string): Promise<any> {
  const { json } = await apiRequest(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    errorMessage: 'Falha ao excluir usuário.',
  });
  return json;
}

export async function fetchUserSessions(userId: string): Promise<any[]> {
  const { data } = await apiRequest<any[]>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions`,
    {
      errorMessage: 'Falha ao carregar sessões.',
    }
  );
  return data || [];
}

export async function revokeSession(sessionId: string): Promise<any> {
  const { json } = await apiRequest(
    `/api/v1/admin/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
      errorMessage: 'Falha ao revogar sessão.',
    }
  );
  return json;
}

export async function fetchOrganizations(): Promise<any[]> {
  const { data } = await apiRequest<any[]>('/api/v1/admin/organizations', {
    errorMessage: 'Falha ao carregar organizações.',
  });
  return data || [];
}

export async function createOrganization(data: { name: string; slug: string }): Promise<any> {
  const { data: result } = await apiRequest('/api/v1/admin/organizations', {
    method: 'POST',
    body: data,
    errorMessage: 'Falha ao criar organização.',
  });
  return result;
}

export async function fetchOrganizationMembers(orgId: string): Promise<any[]> {
  const { data } = await apiRequest<any[]>(
    `/api/v1/admin/organizations/${encodeURIComponent(orgId)}/members`,
    {
      errorMessage: 'Falha ao carregar membros da organização.',
    }
  );
  return data || [];
}

export async function addOrganizationMember(orgId: string, data: { userId: string; role?: string }): Promise<any> {
  const { json } = await apiRequest(
    `/api/v1/admin/organizations/${encodeURIComponent(orgId)}/members`,
    {
      method: 'POST',
      body: data,
      errorMessage: 'Falha ao adicionar membro.',
    }
  );
  return json;
}

export async function removeOrganizationMember(orgId: string, userId: string): Promise<any> {
  const { json } = await apiRequest(
    `/api/v1/admin/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      errorMessage: 'Falha ao remover membro da organização.',
    }
  );
  return json;
}

// =========================================================================
// 9. GESTÃO DE WEBHOOKS
// =========================================================================

export async function fetchWebhooks(): Promise<WebhookInfo[]> {
  const { data } = await apiRequest<WebhookInfo[]>('/api/v1/webhooks', {
    errorMessage: 'Falha ao listar webhooks.',
  });
  return data || [];
}

export async function createWebhook(data: {
  name: string;
  url: string;
  events?: string[];
  secret?: string;
  enabled?: boolean;
}): Promise<WebhookInfo> {
  const { data: result } = await apiRequest<WebhookInfo>('/api/v1/webhooks', {
    method: 'POST',
    body: data,
    errorMessage: 'Falha ao criar webhook.',
  });
  return result;
}

export async function updateWebhook(
  id: string,
  data: Partial<{
    name: string;
    url: string;
    events: string[];
    secret: string;
    enabled: boolean;
  }>,
): Promise<WebhookInfo> {
  const { data: result } = await apiRequest<WebhookInfo>(`/api/v1/webhooks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: data,
    errorMessage: 'Falha ao atualizar webhook.',
  });
  return result;
}

export async function deleteWebhook(id: string): Promise<any> {
  const { json } = await apiRequest(`/api/v1/webhooks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    errorMessage: 'Falha ao excluir webhook.',
  });
  return json;
}

export async function testWebhook(id: string): Promise<{
  statusCode: number;
  statusText: string;
  latencyMs: number;
  responseSnippet: string;
  signatureSent: string | null;
}> {
  const { data } = await apiRequest<{
    statusCode: number;
    statusText: string;
    latencyMs: number;
    responseSnippet: string;
    signatureSent: string | null;
  }>(`/api/v1/webhooks/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    errorMessage: 'Falha no teste de envio do webhook.',
  });
  return data;
}
