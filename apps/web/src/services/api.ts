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

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    : '') || '';

export const STORAGE_KEY_ADMIN = 'edgekit_platform_admin_key';

function getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
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

export async function fetchAuthMe(): Promise<{ authenticated: boolean; data?: any }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: getHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      return { authenticated: false };
    }
    const json = await res.json();
    return {
      authenticated: Boolean(json.authenticated),
      data: json.data,
    };
  } catch {
    return { authenticated: false };
  }
}

export async function loginAuth(passkey: string): Promise<{ authenticated: boolean; role?: string }> {
  const clean = passkey.trim();
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ passkey: clean }),
  });

  const json = await res.json().catch(() => ({ authenticated: false }));
  if (!res.ok || !json.authenticated) {
    throw new ApiError(
      json.error?.message || 'Chave de acesso inválida.',
      res.status
    );
  }

  // Se salvarmos no localStorage também, facilita chamadas com cabeçalho explícito
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ADMIN, clean);
  }

  return { authenticated: true, role: json.role };
}

export async function logoutAuth(): Promise<{ authenticated: boolean }> {
  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {}

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_ADMIN);
  }

  return { authenticated: false };
}

export async function checkSetupStatus(): Promise<SetupStatusResponse> {
  const res = await fetch(`${API_BASE}/api/v1/admin/setup-status`);
  if (!res.ok) {
    throw new ApiError('Falha ao verificar status do setup.', res.status);
  }
  const json = await res.json();
  return json.data ?? { isSetupComplete: true };
}

export async function performSetup(data: {
  name: string;
  email: string;
  password: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao executar o setup inicial.', res.status);
  }
  return json;
}

export async function fetchStats(): Promise<PlatformStats> {
  const res = await fetch(`${API_BASE}/api/v1/admin/stats`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao buscar estatísticas da plataforma.', res.status);
  }
  const json = await res.json();
  return json.data;
}

export async function fetchTables(): Promise<D1TableInfo[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/tables`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao listar tabelas do Cloudflare D1.', res.status);
  }
  const json = await res.json();
  return json.data || [];
}

export async function createTable(data: {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    primaryKey?: boolean;
    notNull?: boolean;
    defaultValue?: string;
  }>;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/tables`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao criar tabela.', res.status);
  }
  return json;
}

export async function dropTable(tableName: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/admin/tables/${encodeURIComponent(tableName)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao excluir tabela.', res.status);
  }
  return true;
}

export async function fetchTableRows(
  table: string,
  limit = 50,
  offset = 0
): Promise<any[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/db/${encodeURIComponent(table)}?limit=${limit}&offset=${offset}`,
    {
      headers: getHeaders(),
    }
  );

  if (!res.ok) {
    throw new ApiError(`Falha ao carregar registros da tabela "${table}".`, res.status);
  }
  const json = await res.json();
  return json.data || [];
}

export async function insertTableRow(table: string, record: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/db/${encodeURIComponent(table)}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(record),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao inserir linha.', res.status);
  }
  return json.data;
}

export async function updateTableRow(table: string, id: string, record: any): Promise<any> {
  const res = await fetch(
    `${API_BASE}/api/v1/db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(record),
    }
  );

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao atualizar linha.', res.status);
  }
  return json.data;
}

export async function deleteTableRow(table: string, id: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/api/v1/db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    }
  );

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao excluir registro.', res.status);
  }
  return true;
}

export async function runSql(query: string): Promise<SqlQueryResult> {
  const res = await fetch(`${API_BASE}/api/v1/admin/sql`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ query }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    return {
      success: false,
      error: {
        message: json.error?.message || 'Erro ao executar consulta SQL.',
        code: json.error?.code,
      },
    };
  }
  return {
    success: true,
    rowCount: json.rowCount,
    rows: json.rows,
  };
}

export async function fetchFiles(bucket = 'default'): Promise<StorageFile[]> {
  const res = await fetch(`${API_BASE}/api/v1/storage/${encodeURIComponent(bucket)}/list`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao listar arquivos do storage R2.', res.status);
  }
  const json = await res.json();
  return json.data?.objects || json.data || [];
}

export async function uploadFile(bucket: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const headers = getHeaders();
  delete headers['Content-Type'];

  const res = await fetch(`${API_BASE}/api/v1/storage/${encodeURIComponent(bucket)}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao enviar arquivo.', res.status);
  }
  return json.data;
}

export async function deleteFile(bucket: string, key: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/api/v1/storage/${encodeURIComponent(bucket)}/file/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    }
  );

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao excluir arquivo.', res.status);
  }
  return true;
}

export async function fetchBuckets(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/v1/storage/buckets`, {
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao listar buckets.', res.status);
  }
  return json.data || [];
}

export async function createBucket(data: {
  name: string;
  isPublic?: boolean;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  readRule?: string;
  writeRule?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/storage/buckets`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao criar bucket.', res.status);
  }
  return json.data;
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
  const res = await fetch(`${API_BASE}/api/v1/storage/buckets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao atualizar bucket.', res.status);
  }
  return json.data;
}

export async function generateSignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 3600
): Promise<{ url: string; expiresAt: string }> {
  const res = await fetch(`${API_BASE}/api/v1/storage/${encodeURIComponent(bucket)}/signed-url`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ key, expiresInSeconds }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao gerar link assinado.', res.status);
  }
  return json.data;
}

export async function fetchKeys(): Promise<PlatformKeys> {
  const res = await fetch(`${API_BASE}/api/v1/admin/keys`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao obter credenciais da plataforma.', res.status);
  }
  const json = await res.json();
  return json.data || {};
}

export async function fetchPublicConfig(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/auth/public-config`);
  if (!res.ok) {
    throw new ApiError('Falha ao obter configurações públicas.', res.status);
  }
  const json = await res.json();
  return json.data;
}

export async function broadcastRealtime(
  channel: string,
  event: string,
  payload: any
): Promise<any> {
  const res = await fetch(
    `${API_BASE}/api/v1/realtime/${encodeURIComponent(channel)}/broadcast`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ event, payload }),
    }
  );

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao emitir mensagem realtime.', res.status);
  }
  return json;
}

export async function fetchTablePolicy(
  table: string
): Promise<TablePolicy> {
  const res = await fetch(`${API_BASE}/api/v1/admin/tables/${encodeURIComponent(table)}/policy`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao obter política da tabela.', res.status);
  }
  const json = await res.json();
  return (
    json.data || {
      tableName: table,
      rlsEnabled: true,
      selectRule: 'public',
      insertRule: 'authenticated',
      updateRule: 'owner',
      deleteRule: 'owner',
      ownerColumn: 'user_id',
    }
  );
}

export async function updateTablePolicy(
  table: string,
  policy: Partial<TablePolicy>
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/tables/${encodeURIComponent(table)}/policy`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(policy),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao atualizar política da tabela.', res.status);
  }
  return json.data;
}

export async function fetchSecuritySettings(): Promise<SecuritySettings> {
  const res = await fetch(`${API_BASE}/api/v1/admin/settings/security`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new ApiError('Falha ao obter configurações de segurança.', res.status);
  }
  const json = await res.json();
  return json.data || { allowedOrigins: [], allowedIps: [], blockExternalLocalhost: true };
}

export async function updateSecuritySettings(
  settings: Partial<SecuritySettings>
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/settings/security`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(settings),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao salvar configurações de segurança.', res.status);
  }
  return json.data;
}

export async function adminCreateUser(data: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao criar usuário.', res.status);
  }
  return json.data;
}

export async function adminUpdateUserRole(id: string, role: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ role }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao atualizar função do usuário.', res.status);
  }
  return json;
}

export async function adminDeleteUser(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao excluir usuário.', res.status);
  }
  return json;
}

export async function fetchUserSessions(userId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users/${encodeURIComponent(userId)}/sessions`, {
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao carregar sessões.', res.status);
  }
  return json.data || [];
}

export async function revokeSession(sessionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao revogar sessão.', res.status);
  }
  return json;
}

export async function fetchOrganizations(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/organizations`, {
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao carregar organizações.', res.status);
  }
  return json.data || [];
}

export async function createOrganization(data: { name: string; slug: string }): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/organizations`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao criar organização.', res.status);
  }
  return json.data;
}

export async function fetchOrganizationMembers(orgId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/organizations/${encodeURIComponent(orgId)}/members`, {
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao carregar membros da organização.', res.status);
  }
  return json.data || [];
}

export async function addOrganizationMember(orgId: string, data: { userId: string; role?: string }): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/organizations/${encodeURIComponent(orgId)}/members`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao adicionar membro.', res.status);
  }
  return json;
}

export async function removeOrganizationMember(orgId: string, userId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao remover membro da organização.', res.status);
  }
  return json;
}

// =========================================================================
// GESTÃO DE WEBHOOKS
// =========================================================================

export async function fetchWebhooks(): Promise<WebhookInfo[]> {
  const res = await fetch(`${API_BASE}/api/v1/webhooks`, {
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao listar webhooks.', res.status);
  }
  return json.data || [];
}

export async function createWebhook(data: {
  name: string;
  url: string;
  events?: string[];
  secret?: string;
  enabled?: boolean;
}): Promise<WebhookInfo> {
  const res = await fetch(`${API_BASE}/api/v1/webhooks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao criar webhook.', res.status);
  }
  return json.data;
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
  const res = await fetch(`${API_BASE}/api/v1/webhooks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao atualizar webhook.', res.status);
  }
  return json.data;
}

export async function deleteWebhook(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/webhooks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha ao excluir webhook.', res.status);
  }
  return json;
}

export async function testWebhook(id: string): Promise<{
  statusCode: number;
  statusText: string;
  latencyMs: number;
  responseSnippet: string;
  signatureSent: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/v1/webhooks/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error?.message || 'Falha no teste de envio do webhook.', res.status);
  }
  return json.data;
}


