import type {
  PlatformStats,
  D1TableInfo,
  SqlQueryResult,
  StorageFile,
  SetupStatusResponse,
  PlatformKeys,
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
