import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { queryDefaults } from './query-defaults';
import { fetchStats } from '../../services/api';

export function useStatsQuery() {
  return useQuery({
    queryKey: queryKeys.stats.detail(),
    queryFn: fetchStats,
    ...queryDefaults.stats,
  });
}
