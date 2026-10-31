export interface PlatformStats {
  totalUsers: number;
  totalTables: number;
  totalFiles: number;
  plan: {
    name?: string;
    tier?: string;
    features?: {
      d1Database?: { enabled: boolean; tier: string; details: string };
      r2Storage?: { enabled: boolean; tier: string; details: string };
      realtimeDurableObjects?: { enabled: boolean; tier: string; details: string };
      dynamicWorkers?: { enabled: boolean; upgradeNotice?: string; details?: string };
    };
  };
}

export interface D1TableInfo {
  name: string;
  type?: string;
  rowCount?: number;
}

export interface SqlQueryResult {
  success: boolean;
  rowCount?: number;
  rows?: any[];
  error?: {
    message: string;
    code?: string;
  };
}

export interface StorageFile {
  key: string;
  size: number;
  uploaded: string;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: string;
}

export interface SetupStatusResponse {
  isSetupComplete: boolean;
  appName?: string;
}

export interface PlatformKeys {
  anonKey?: string;
  serviceRoleKey?: string;
  jwtSecretConfigured?: boolean;
}

export interface TablePolicy {
  tableName: string;
  rlsEnabled?: boolean;
  selectRule?: 'public' | 'authenticated' | 'owner' | 'org_member' | 'admin' | 'disabled' | 'custom_sql';
  insertRule?: 'public' | 'authenticated' | 'owner' | 'org_member' | 'admin' | 'disabled' | 'custom_sql';
  updateRule?: 'public' | 'authenticated' | 'owner' | 'org_member' | 'admin' | 'disabled' | 'custom_sql';
  deleteRule?: 'public' | 'authenticated' | 'owner' | 'org_member' | 'admin' | 'disabled' | 'custom_sql';
  ownerColumn?: string;
  readLevel?: string;
  writeLevel?: string;
}

export interface SecuritySettings {
  allowedOrigins: string[];
  allowedIps: string[];
  blockExternalLocalhost: boolean;
}

export interface RealtimeMessage {
  id: string;
  channel: string;
  event: string;
  payload: any;
  timestamp: number;
}

export interface WebhookInfo {
  id: string;
  name: string;
  url: string;
  events: string;
  secret?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
