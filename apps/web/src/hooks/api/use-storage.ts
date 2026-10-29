import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { queryDefaults } from './query-defaults';
import { fetchFiles, uploadFile, deleteFile } from '../../services/api';

export function useStorageFilesQuery(bucket = 'default') {
  return useQuery({
    queryKey: queryKeys.storage.files(bucket),
    queryFn: () => fetchFiles(bucket),
    ...queryDefaults.storage,
  });
}

export function useUploadFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bucket, file }: { bucket: string; file: File }) =>
      uploadFile(bucket, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.storage.files(variables.bucket),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}

export function useDeleteFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bucket, key }: { bucket: string; key: string }) =>
      deleteFile(bucket, key),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.storage.files(variables.bucket),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stats.detail(),
      });
    },
  });
}
