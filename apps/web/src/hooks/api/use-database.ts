import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { queryDefaults } from './query-defaults';
import type { TablePolicy } from '../../types';
import {
  fetchTables,
  fetchTableRows,
  insertTableRow,
  updateTableRow,
  deleteTableRow,
  fetchTablePolicy,
  updateTablePolicy,
  runSql,
  createTable,
  dropTable,
} from '../../services/api';

export function useTablesQuery() {
  return useQuery({
    queryKey: queryKeys.database.tables(),
    queryFn: fetchTables,
    ...queryDefaults.database,
  });
}

export function useCreateTableMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      columns: Array<{
        name: string;
        type: string;
        primaryKey?: boolean;
        notNull?: boolean;
        defaultValue?: string;
      }>;
    }) => createTable(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.database.tables(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useDropTableMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tableName: string) => dropTable(tableName),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.database.tables(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useTableRowsQuery(table: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.database.rows(table, limit, offset),
    queryFn: () => fetchTableRows(table, limit, offset),
    enabled: Boolean(table),
    ...queryDefaults.database,
  });
}

export function useInsertTableRowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ table, record }: { table: string; record: any }) =>
      insertTableRow(table, record),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', variables.table],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useUpdateTableRowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ table, id, record }: { table: string; id: string; record: any }) =>
      updateTableRow(table, id, record),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', variables.table],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useTablePolicyQuery(table: string) {
  return useQuery({
    queryKey: ['database', 'policy', table],
    queryFn: () => fetchTablePolicy(table),
    enabled: Boolean(table),
    ...queryDefaults.database,
  });
}

export function useUpdateTablePolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      table,
      policy,
    }: {
      table: string;
      policy: Partial<TablePolicy>;
    }) => updateTablePolicy(table, policy),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'policy', variables.table],
      });
    },
  });
}

export function useDeleteTableRowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ table, id }: { table: string; id: string }) =>
      deleteTableRow(table, id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', variables.table],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useRunSqlMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: string) => runSql(query),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.database.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}
