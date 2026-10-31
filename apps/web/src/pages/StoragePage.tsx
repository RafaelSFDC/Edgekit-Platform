import React, { useState } from 'react';
import { useI18n } from '../i18n/context';
import {
  useStorageFilesQuery,
  useUploadFileMutation,
  useDeleteFileMutation,
  useStorageBucketsQuery,
  useCreateBucketMutation,
  useUpdateBucketMutation,
} from '../hooks/api/use-storage';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { BucketListSidebar } from '../components/storage/BucketListSidebar';
import { FileUploadDropzone } from '../components/storage/FileUploadDropzone';
import { FileExplorerGrid } from '../components/storage/FileExplorerGrid';

export const StoragePage: React.FC = () => {
  const { t } = useI18n();
  const [selectedBucket, setSelectedBucket] = useState('default');

  const { data: buckets = [], refetch: refetchBuckets } = useStorageBucketsQuery();
  const { data: files = [], refetch: refetchFiles, isLoading: loadingFiles } =
    useStorageFilesQuery(selectedBucket);

  const uploadMutation = useUploadFileMutation();
  const deleteMutation = useDeleteFileMutation();
  const createBucketMutation = useCreateBucketMutation();
  const updateBucketMutation = useUpdateBucketMutation();

  const handleCreateBucket = async (data: any) => {
    await createBucketMutation.mutateAsync(data);
    refetchBuckets();
  };

  const handleUpdateBucket = async (name: string, data: any) => {
    await updateBucketMutation.mutateAsync({ name, data });
    refetchBuckets();
  };

  const handleUploadFile = async (file: File) => {
    await uploadMutation.mutateAsync({ bucket: selectedBucket, file });
    refetchFiles();
  };

  const handleDeleteFile = async (key: string) => {
    await deleteMutation.mutateAsync({ bucket: selectedBucket, key });
    refetchFiles();
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.storage.title}
        description={t.storage.subtitle}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 min-h-[550px]">
        {/* Barra Lateral de Buckets R2 */}
        <div className="md:col-span-1 h-full">
          <BucketListSidebar
            buckets={buckets}
            selectedBucket={selectedBucket}
            onSelectBucket={(name) => setSelectedBucket(name)}
            onCreateBucket={handleCreateBucket}
            onUpdateBucket={handleUpdateBucket}
          />
        </div>

        {/* Área de Arquivos e Upload */}
        <div className="md:col-span-3 space-y-4">
          <FileUploadDropzone
            bucket={selectedBucket}
            isUploading={uploadMutation.isPending}
            onUpload={handleUploadFile}
          />

          <FileExplorerGrid
            bucket={selectedBucket}
            files={files}
            isLoading={loadingFiles}
            onRefresh={refetchFiles}
            onDeleteFile={handleDeleteFile}
          />
        </div>
      </div>
    </PageLayout>
  );
};
