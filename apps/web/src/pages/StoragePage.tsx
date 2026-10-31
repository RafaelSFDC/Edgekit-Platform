import React, { useState, useRef } from 'react';
import {
  HardDrive,
  UploadCloud,
  Trash2,
  Download,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import {
  useStorageFilesQuery,
  useUploadFileMutation,
  useDeleteFileMutation,
} from '../hooks/api/use-storage';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const StoragePage: React.FC = () => {
  const { t } = useI18n();
  const [bucket, _setBucket] = useState('default');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], refetch, isLoading } = useStorageFilesQuery(bucket);
  const uploadMutation = useUploadFileMutation();
  const deleteMutation = useDeleteFileMutation();

  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadMutation.mutateAsync({ bucket, file });
      toast.success(t.common.success);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      toast.error(err.message || t.common.error);
    }
  };

  const confirmDelete = async () => {
    if (!deletingKey) return;
    try {
      await deleteMutation.mutateAsync({ bucket, key: deletingKey });
      toast.success(t.common.success);
      setDeletingKey(null);
    } catch (err: any) {
      toast.error(err.message || t.common.error);
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.storage.title}
        description={t.storage.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              size="sm"
              className="gap-1.5 text-xs h-8"
            >
              <UploadCloud className="size-3.5" />
              {uploadMutation.isPending ? t.storage.uploading : t.storage.uploadFile}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              className="size-8"
              title={t.common.refresh}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        }
      />

      {/* Dropzone de Upload */}
      <Card
        onClick={() => fileInputRef.current?.click()}
        className="border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer bg-card/40"
      >
        <CardContent className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <UploadCloud className="size-6" />
          </div>
          <span className="text-xs font-medium text-foreground">{t.storage.dropzone}</span>
          <span className="text-[11px] text-muted-foreground">
            Suporte a imagens, documentos, vídeos e arquivos binários no Cloudflare R2
          </span>
        </CardContent>
      </Card>

      {/* Lista de Arquivos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-purple-500" />
            <CardTitle className="text-base">{t.storage.filesCount}</CardTitle>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {files.length} arquivos
          </Badge>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {t.common.loading}
            </div>
          ) : files.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              {t.storage.emptyFiles}
            </div>
          ) : (
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-muted/70 border-b border-border select-none">
                <tr>
                  <th className="p-3 font-semibold text-muted-foreground">Nome / Chave</th>
                  <th className="p-3 font-semibold text-muted-foreground">Tamanho</th>
                  <th className="p-3 font-semibold text-muted-foreground">Tipo</th>
                  <th className="p-3 font-semibold text-muted-foreground">Enviado em</th>
                  <th className="p-3 font-semibold text-muted-foreground text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.key} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-xs">{file.key}</span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatBytes(file.size)}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px]">
                        {file.httpMetadata?.contentType || 'binary'}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                      {file.uploaded ? new Date(file.uploaded).toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/v1/storage/${encodeURIComponent(bucket)}/file/${encodeURIComponent(file.key)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="ghost" size="icon" className="size-7" title="Download" aria-label="Download">
                            <Download className="size-3.5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingKey(file.key)}
                          className="size-7 text-destructive hover:bg-destructive/10"
                          title={t.common.delete}
                          aria-label={t.common.delete}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Exclusão */}
      <Dialog open={Boolean(deletingKey)} onOpenChange={() => setDeletingKey(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">{t.storage.deleteConfirm}</DialogTitle>
            <DialogDescription className="text-xs">
              O arquivo "{deletingKey}" será excluído permanentemente do Cloudflare R2.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDeletingKey(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t.common.loading : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
