import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  MutationFunction,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query';
import type { InvalidateTarget, InvalidateTargetInput } from './query-keys';

function isInvalidateTargetObject(
  target: InvalidateTargetInput
): target is InvalidateTarget {
  return !Array.isArray(target);
}

type InvalidateResolver<TData, TVariables> =
  | Array<InvalidateTargetInput>
  | ((args: {
      data: TData;
      variables: TVariables;
    }) => Array<InvalidateTargetInput>);

type MessageResolver<TData, TVariables> =
  | string
  | ((args: { data: TData; variables: TVariables }) => string);

interface UseInvalidateMutationConfig<TData, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, Error, TVariables, TContext>, 'mutationFn'> {
  errorMessage?: string;
  invalidate?: InvalidateResolver<TData, TVariables>;
  mutationFn: MutationFunction<TData, TVariables>;
  successMessage?: MessageResolver<TData, TVariables>;
}

function toInvalidateTarget(target: InvalidateTargetInput): InvalidateTarget {
  if (isInvalidateTargetObject(target)) {
    return target;
  }
  return { queryKey: [...target], exact: false };
}

export function useInvalidateMutation<TData, TVariables, TContext = unknown>(
  config: UseInvalidateMutationConfig<TData, TVariables, TContext>
): UseMutationResult<TData, Error, TVariables, TContext> {
  const queryClient = useQueryClient();

  return useMutation({
    ...config,
    onSuccess: async (data, variables, onMutateResult, mutationContext) => {
      const invalidateTargets =
        typeof config.invalidate === 'function'
          ? config.invalidate({ data, variables })
          : config.invalidate;

      if (invalidateTargets?.length) {
        void Promise.all(
          invalidateTargets.map((target) => {
            const t = toInvalidateTarget(target);
            return queryClient.invalidateQueries({
              queryKey: t.queryKey,
              exact: t.exact,
            });
          })
        );
      }

      if (config.successMessage) {
        const message =
          typeof config.successMessage === 'function'
            ? config.successMessage({ data, variables })
            : config.successMessage;
        toast.success(message);
      }

      await config.onSuccess?.(data, variables, onMutateResult, mutationContext);
    },
    onError: (error, variables, onMutateResult, mutationContext) => {
      toast.error(config.errorMessage ?? error.message);
      config.onError?.(error, variables, onMutateResult, mutationContext);
    },
  });
}
