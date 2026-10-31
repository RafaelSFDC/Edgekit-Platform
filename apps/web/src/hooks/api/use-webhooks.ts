import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
} from '@/services/api';
import { queryKeys } from './query-keys';
import { toast } from 'sonner';

export function useWebhooks() {
  const queryClient = useQueryClient();

  const webhooksQuery = useQuery({
    queryKey: queryKeys.webhooks.list(),
    queryFn: fetchWebhooks,
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: createWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      toast.success('Webhook criado com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao criar webhook.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateWebhook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      toast.success('Webhook atualizado!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao atualizar webhook.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
      toast.success('Webhook excluído.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao excluir webhook.');
    },
  });

  const testMutation = useMutation({
    mutationFn: testWebhook,
  });

  return {
    webhooks: webhooksQuery.data || [],
    isLoading: webhooksQuery.isLoading,
    refetch: webhooksQuery.refetch,
    createWebhook: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateWebhook: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteWebhook: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    testWebhook: testMutation.mutateAsync,
    isTesting: testMutation.isPending,
  };
}
