import React, { useState, useMemo } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Code2,
  Download,
  Trash2,
  KeyRound,
  Search,
  RefreshCw,
  HardDrive,
  Copy,
  Check,
  Globe,
  Lock,
} from 'lucide-react';
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
import { SignedUrlDialog } from './SignedUrlDialog';

interface FileExplorerGridProps {
  bucket: string;
  files: any[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteFile: (key: string) => Promise<void>;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileIcon(mime: string = '') {
  if (mime.startsWith('image/')) return <ImageIcon className="size-4 text-emerald-500" />;
  if (mime.startsWith('video/')) return <Film className="size-4 text-purple-500" />;
  if (mime.startsWith('audio/')) return <Music className="size-4 text-amber-500" />;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('typescript')) {
    return <Code2 className="size-4 text-blue-500" />;
  }
  return <FileText className="size-4 text-muted-foreground" />;
}

export const FileExplorerGrid: React.FC<FileExplorerGridProps> = ({
  bucket,
  files,
  isLoading,
  onRefresh,
  onDeleteFile,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [signedUrlTargetKey, setSignedUrlTargetKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) return files;
    const term = searchTerm.toLowerCase();
    return files.filter(
      (f) =>
        (f.key && f.key.toLowerCase().includes(term)) ||
        (f.name && f.name.toLowerCase().includes(term)),
    );
  }, [files, searchTerm]);

  const handleCopyDirectUrl = (key: string) => {
    const url = `${window.location.origin}/api/v1/storage/${encodeURIComponent(bucket)}/file/${encodeURIComponent(key)}`;
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    toast.success('URL direta copiada com sucesso!');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const confirmDelete = async () => {
    if (!deletingKey) return;
    try {
      await onDeleteFile(deletingKey);
      toast.success(`Arquivo "${deletingKey}" excluído do R2 com sucesso!`);
      setDeletingKey(null);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir arquivo.');
    }
  };

  return (
    <div className="space-y-3">
      {/* Search and Refresh Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar arquivos por nome ou chave..."
            className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary font-mono"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="h-8 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground self-end sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar Arquivos</span>
        </Button>
      </div>

      {/* Files Table */}
      <div className="border border-border/70 rounded-xl overflow-hidden bg-card/40">
        <div className="p-3.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-purple-500" />
            <h3 className="text-xs font-semibold text-foreground">
              Arquivos em <code className="text-primary font-mono">{bucket}</code>
            </h3>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {filteredFiles.length} arquivo(s)
          </Badge>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <span>Carregando arquivos do R2...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            {files.length === 0
              ? `O bucket "${bucket}" está vazio. Faça upload do primeiro arquivo acima!`
              : 'Nenhum arquivo encontrado para a busca.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/60 border-b border-border/70">
                <tr>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Nome / Chave
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Tamanho
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    MIME Type
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Visibilidade
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Data
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredFiles.map((file) => {
                  const directUrl = `/api/v1/storage/${encodeURIComponent(bucket)}/file/${encodeURIComponent(file.key)}`;
                  const isPub = file.isPublic !== false;

                  return (
                    <tr key={file.key} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                            {getFileIcon(file.mimeType || file.httpMetadata?.contentType)}
                          </div>
                          <div className="min-w-0 max-w-sm">
                            <p className="font-semibold text-foreground truncate font-mono text-[11px]">
                              {file.name || file.key}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground truncate">{file.key}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                        {formatBytes(file.size)}
                      </td>

                      <td className="px-3.5 py-2.5">
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {file.mimeType || file.httpMetadata?.contentType || 'binary'}
                        </Badge>
                      </td>

                      <td className="px-3.5 py-2.5">
                        {isPub ? (
                          <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30 bg-blue-500/10 gap-1">
                            <Globe className="size-2.5" />
                            Público
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10 gap-1">
                            <Lock className="size-2.5" />
                            Privado
                          </Badge>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        {file.createdAt || file.uploaded
                          ? new Date(file.createdAt || file.uploaded).toLocaleDateString()
                          : '—'}
                      </td>

                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Copiar URL direta */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyDirectUrl(file.key)}
                            className="size-7 text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Copiar URL direta"
                          >
                            {copiedKey === file.key ? (
                              <Check className="size-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>

                          {/* Gerar Link Assinado */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSignedUrlTargetKey(file.key)}
                            className="size-7 text-muted-foreground hover:text-primary cursor-pointer"
                            title="Gerar URL assinada com expiração"
                          >
                            <KeyRound className="size-3.5" />
                          </Button>

                          {/* Download / Ver */}
                          <a href={directUrl} target="_blank" rel="noreferrer">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Baixar ou abrir arquivo"
                            >
                              <Download className="size-3.5" />
                            </Button>
                          </a>

                          {/* Excluir */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingKey(file.key)}
                            className="size-7 text-muted-foreground hover:text-destructive cursor-pointer"
                            title="Excluir arquivo"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Link Assinado */}
      <SignedUrlDialog
        bucket={bucket}
        fileKey={signedUrlTargetKey}
        onClose={() => setSignedUrlTargetKey(null)}
      />

      {/* Modal Confirmar Exclusão de Arquivo */}
      <Dialog open={Boolean(deletingKey)} onOpenChange={() => setDeletingKey(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Arquivo?</DialogTitle>
            <DialogDescription>
              O arquivo <strong className="font-mono text-foreground">{deletingKey}</strong> será removido permanentemente do Cloudflare R2.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeletingKey(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
