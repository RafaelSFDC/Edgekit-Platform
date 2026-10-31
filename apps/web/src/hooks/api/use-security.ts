import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SecuritySettings } from '../../types';
import { fetchSecuritySettings, updateSecuritySettings } from '../../services/api';

export function useSecuritySettingsQuery() {
  return useQuery({
    queryKey: ['admin', 'settings', 'security'],
    queryFn: fetchSecuritySettings,
    staleTime: 1000 * 30,
  });
}

export function useUpdateSecuritySettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<SecuritySettings>) => updateSecuritySettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'settings', 'security'],
      });
    },
  });
}
