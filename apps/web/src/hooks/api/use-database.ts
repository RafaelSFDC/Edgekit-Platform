import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { queryDefaults } from './query-defaults';
import {
  fetchTables,
  fetchTableRows,
  insertTableRow,
  deleteTableRow,
  runSql,
} from '../../services/api';

export function useTablesQuery() {
  return useQuery({
    queryKey: queryKeys.database.tables(),
    queryFn: fetchTables,
    ...queryDefaults.database,
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
