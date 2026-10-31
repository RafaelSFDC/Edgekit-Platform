import React, { useState, useRef } from 'react';
import { UploadCloud, Folder, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface FileUploadDropzoneProps {
  bucket: string;
  isUploading: boolean;
  onUpload: (file: File, pathPrefix?: string) => Promise<void>;
}

export const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  bucket,
  isUploading,
  onUpload,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pathPrefix, setPathPrefix] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleSubmitUpload = async () => {
    if (!selectedFile) return;
    try {
      await onUpload(selectedFile, pathPrefix.trim());
      setSelectedFile(null);
      setPathPrefix('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(`Arquivo "${selectedFile.name}" enviado com sucesso para "${bucket}"!`);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao enviar arquivo.');
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {!selectedFile ? (
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
            isDragOver
              ? 'border-primary bg-primary/10'
              : 'border-border/70 hover:border-primary/50 bg-card/40 hover:bg-card/60'
          }`}
        >
          <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <UploadCloud className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              Arraste e solte arquivos aqui ou clique para selecionar
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Upload direto no Cloudflare R2 para o bucket <strong className="font-mono text-foreground">{bucket}</strong>
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <File className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{selectedFile.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'binary'}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedFile(null)}
              className="size-7 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <div className="flex-1 relative">
              <Folder className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                placeholder="Pasta opcional (ex: imagens, relatorios)..."
                className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary font-mono"
              />
            </div>

            <Button
              onClick={handleSubmitUpload}
              disabled={isUploading}
              className="h-8 text-xs px-3.5 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs shrink-0"
            >
              <UploadCloud className="size-3.5" />
              <span>{isUploading ? 'Enviando...' : 'Iniciar Upload'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
