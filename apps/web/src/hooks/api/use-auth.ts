import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import {
  checkSetupStatus,
  performSetup,
  fetchKeys,
  fetchPublicConfig,
  adminCreateUser,
  adminUpdateUserRole,
  adminDeleteUser,
  fetchUserSessions,
  revokeSession,
  fetchOrganizations,
  createOrganization,
  fetchOrganizationMembers,
  addOrganizationMember,
  removeOrganizationMember,
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

export function useAdminCreateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminCreateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', 'users'],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useAdminUpdateUserRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => adminUpdateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', 'users'],
      });
    },
  });
}

export function useAdminDeleteUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminDeleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', 'users'],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useUserSessionsQuery(userId: string) {
  return useQuery({
    queryKey: ['auth', 'users', userId, 'sessions'],
    queryFn: () => fetchUserSessions(userId),
    enabled: Boolean(userId),
  });
}

export function useRevokeSessionMutation(userId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: ['auth', 'users', userId, 'sessions'],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', 'sessions'],
      });
    },
  });
}

export function useOrganizationsQuery() {
  return useQuery({
    queryKey: ['auth', 'organizations'],
    queryFn: fetchOrganizations,
    staleTime: 30 * 1000,
  });
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string }) => createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['auth', 'organizations'],
      });
      queryClient.invalidateQueries({
        queryKey: ['database', 'rows', 'organizations'],
      });
    },
  });
}

export function useOrganizationMembersQuery(orgId: string) {
  return useQuery({
    queryKey: ['auth', 'organizations', orgId, 'members'],
    queryFn: () => fetchOrganizationMembers(orgId),
    enabled: Boolean(orgId),
  });
}

export function useAddOrganizationMemberMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; role?: string }) => addOrganizationMember(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['auth', 'organizations', orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['auth', 'organizations'],
      });
    },
  });
}

export function useRemoveOrganizationMemberMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(orgId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['auth', 'organizations', orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['auth', 'organizations'],
      });
    },
  });
}

