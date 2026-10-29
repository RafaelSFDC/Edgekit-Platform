export interface InvalidateTarget {
  queryKey: ReadonlyArray<unknown>;
  exact?: boolean;
}

export type InvalidateTargetInput = InvalidateTarget | ReadonlyArray<unknown>;

function createEntityQueryKeys<
  TListParams = Record<string, never>,
  TDetailId = string
>(entityName: string) {
  return {
    all: [entityName] as const,
    lists: () => [entityName, 'list'] as const,
    list: (filters: TListParams) => [entityName, 'list', filters] as const,
    details: () => [entityName, 'detail'] as const,
    detail: (id: TDetailId) => [entityName, 'detail', id] as const,
  };
}

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    setupStatus: () => ['auth', 'setup-status'] as const,
    publicConfig: () => ['auth', 'public-config'] as const,
  },
  stats: {
    all: ['stats'] as const,
    detail: () => ['stats', 'detail'] as const,
  },
  database: {
    ...createEntityQueryKeys<Record<string, never>, string>('database'),
    tables: () => ['database', 'tables'] as const,
    rows: (table: string, limit?: number, offset?: number) =>
      ['database', 'rows', table, limit, offset] as const,
  },
  storage: {
    ...createEntityQueryKeys<Record<string, never>, string>('storage'),
    files: (bucket: string) => ['storage', 'files', bucket] as const,
  },
  keys: {
    all: ['keys'] as const,
    detail: () => ['keys', 'detail'] as const,
  },
};
