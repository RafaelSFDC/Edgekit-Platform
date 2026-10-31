import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { KeyRound, Sparkles, Plus, Webhook } from 'lucide-react';
import { toast } from 'sonner';

interface CreateWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    url: string;
    events: string[];
    secret?: string;
    enabled: boolean;
  }) => Promise<any>;
}

export const CreateWebhookDialog: React.FC<CreateWebhookDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<'all' | 'db_mutations' | 'custom'>('all');
  const [customEvents, setCustomEvents] = useState('db:users:insert, db:users:update');
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generateRandomSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let res = 'whsec_';
    for (let i = 0; i < 24; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSecret(res);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      toast.error('Preencha o nome e a URL de destino.');
      return;
    }

    let events: string[] = ['*'];
    if (selectedPreset === 'db_mutations') {
      events = ['INSERT', 'UPDATE', 'DELETE'];
    } else if (selectedPreset === 'custom') {
      events = customEvents
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        events,
        secret: secret.trim() || undefined,
        enabled,
      });
      setName('');
      setUrl('');
      setSecret('');
      setSelectedPreset('all');
      onOpenChange(false);
    } catch {
      // Erro já tratado no hook useWebhooks
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Webhook className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">Novo Webhook HTTP</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Nome do Webhook
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Notificações Slack, ERP Sync"
              required
              className="w-full px-3 py-2 bg-muted/40 border border-border/80 rounded-lg text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              URL de Destino (Endpoint HTTPS)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://sua-api.com/webhooks/edgekit"
              required
              className="w-full px-3 py-2 bg-muted/40 border border-border/80 rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">
                Segredo de Assinatura (HMAC Secret)
              </label>
              <button
                type="button"
                onClick={generateRandomSecret}
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                <Sparkles className="size-3" /> Gerar automático
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="whsec_... (deixe em branco para auto-gerar)"
                className="w-full px-3 py-2 pl-8 bg-muted/40 border border-border/80 rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
              <KeyRound className="size-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Enviado via cabeçalho <code className="font-mono text-foreground">X-Edgekit-Signature</code> com HMAC-SHA256.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Eventos Subscritos
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedPreset('all')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  selectedPreset === 'all'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Todos (*)
              </button>
              <button
                type="button"
                onClick={() => setSelectedPreset('db_mutations')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  selectedPreset === 'db_mutations'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Mutações D1
              </button>
              <button
                type="button"
                onClick={() => setSelectedPreset('custom')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  selectedPreset === 'custom'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Personalizado
              </button>
            </div>

            {selectedPreset === 'custom' && (
              <div className="mt-2.5">
                <input
                  type="text"
                  value={customEvents}
                  onChange={(e) => setCustomEvents(e.target.value)}
                  placeholder="ex: db:orders:insert, storage:upload"
                  className="w-full px-3 py-2 bg-muted/40 border border-border/80 rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Eventos separados por vírgula.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="webhook-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="webhook-enabled" className="text-xs text-foreground cursor-pointer">
              Ativar envio de eventos imediatamente
            </label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              {isSubmitting ? 'Criando...' : 'Criar Webhook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
