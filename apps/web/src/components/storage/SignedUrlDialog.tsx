import React, { useState } from 'react';
import { KeyRound, Copy, Check, ExternalLink, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useGenerateSignedUrlMutation } from '../../hooks/api/use-storage';

interface SignedUrlDialogProps {
  bucket: string;
  fileKey: string | null;
  onClose: () => void;
}

export const SignedUrlDialog: React.FC<SignedUrlDialogProps> = ({
  bucket,
  fileKey,
  onClose,
}) => {
  const [durationSeconds, setDurationSeconds] = useState(3600); // 1 hora padrão
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = useGenerateSignedUrlMutation();

  const handleGenerate = async () => {
    if (!fileKey) return;
    try {
      const res = await generateMutation.mutateAsync({
        bucket,
        key: fileKey,
        expiresInSeconds: durationSeconds,
      });
      setGeneratedUrl(res.url);
      toast.success('Link temporário assinado gerado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao gerar link assinado.');
    }
  };

  const handleCopy = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success('Link assinado copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setGeneratedUrl(null);
    onClose();
  };

  return (
    <Dialog open={Boolean(fileKey)} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <KeyRound className="size-4" />
            </div>
            <DialogTitle>Gerar Link Temporário Assinado</DialogTitle>
          </div>
          <DialogDescription>
            Gere uma URL segura assinada com HMAC-SHA256 para compartilhar o arquivo{' '}
            <strong className="font-mono text-foreground">{fileKey}</strong> temporariamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="signed-url-duration" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>Duração do Acesso (Expiração)</span>
            </label>
            <select
              id="signed-url-duration"
              value={durationSeconds}
              onChange={(e) => {
                setDurationSeconds(Number(e.target.value));
                setGeneratedUrl(null); // Reseta URL gerada ao alterar tempo
              }}
              className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value={900}>15 minutos</option>
              <option value={3600}>1 hora (Recomendado)</option>
              <option value={86400}>24 horas (1 dia)</option>
              <option value={604800}>7 dias</option>
            </select>
          </div>

          {!generatedUrl ? (
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="w-full h-8.5 text-xs cursor-pointer gap-1.5"
            >
              <KeyRound className="size-3.5" />
              <span>{generateMutation.isPending ? 'Gerando assinatura...' : 'Gerar URL Assinada'}</span>
            </Button>
          ) : (
            <div className="space-y-2 p-3 rounded-lg bg-muted/40 border border-border/70">
              <label htmlFor="generated-signed-url-input" className="text-[11px] font-semibold text-foreground block">
                Link Assinado Pronto:
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="generated-signed-url-input"
                  type="text"
                  readOnly
                  value={generatedUrl}
                  className="flex-1 h-8 rounded-md bg-zinc-950 text-zinc-100 font-mono text-[11px] px-2.5 border border-border/70 focus:outline-hidden select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-8 text-xs px-2.5 gap-1 shrink-0 cursor-pointer"
                  title="Copiar link"
                >
                  {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </Button>
                <a href={generatedUrl} target="_blank" rel="noreferrer">
                  <Button size="icon" variant="outline" className="size-8 cursor-pointer" title="Abrir link no navegador">
                    <ExternalLink className="size-3.5" />
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
