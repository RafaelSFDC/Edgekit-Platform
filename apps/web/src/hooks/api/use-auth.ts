import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import {
  checkSetupStatus,
  performSetup,
  fetchKeys,
  fetchPublicConfig,
} from '../../services/api';

export function useSetupStatusQuery() {
  return useQuery({
    queryKey: queryKeys.auth.setupStatus(),
    queryFn: checkSetupStatus,
    staleTime: 60 * 1000,
  });
}

export function usePublicConfigQuery() {
  return useQuery({
    queryKey: queryKeys.auth.publicConfig(),
    queryFn: fetchPublicConfig,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlatformKeysQuery() {
  return useQuery({
    queryKey: queryKeys.keys.detail(),
    queryFn: fetchKeys,
    staleTime: 60 * 1000,
  });
}

export function usePerformSetupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: performSetup,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.auth.setupStatus(),
      });
    },
  });
}
