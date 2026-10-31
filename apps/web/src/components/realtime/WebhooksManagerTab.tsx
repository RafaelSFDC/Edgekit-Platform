import React, { useState } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  Check,
  Copy,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useWebhooks } from '@/hooks/api/use-webhooks';
import { CreateWebhookDialog } from './CreateWebhookDialog';
import type { WebhookInfo } from '@/types';

export const WebhooksManagerTab: React.FC = () => {
  const {
    webhooks,
    isLoading,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
  } = useWebhooks();

  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const toggleRevealSecret = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copySecret = (id: string, secret?: string | null) => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    toast.success('Segredo HMAC copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleEnabled = async (wh: WebhookInfo) => {
    try {
      await updateWebhook({ id: wh.id, data: { enabled: !wh.enabled } });
    } catch {
      // Erro tratado no hook
    }
  };

  const handleTestDelivery = async (wh: WebhookInfo) => {
    try {
      setTestingId(wh.id);
      const res = await testWebhook(wh.id);
      toast.success(
        `Disparo de teste para "${wh.name}" bem-sucedido! (HTTP ${res.statusCode} em ${res.latencyMs}ms)`,
      );
    } catch (err: any) {
      toast.error(err.message || 'Falha no teste de disparo.');
    } finally {
      setTestingId(null);
    }
  };

  const filtered = webhooks.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.url.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Criação */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border border-border/70 p-3 rounded-xl shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filtrar por nome ou URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 border border-border/80 rounded-lg text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <Button
          onClick={() => setCreateDialogOpen(true)}
          size="sm"
          className="gap-1.5 text-xs h-8 cursor-pointer"
        >
          <Plus className="size-3.5" />
          Novo Webhook
        </Button>
      </div>

      {/* Lista de Webhooks */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-muted-foreground">
          Carregando webhooks configurados...
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border/80 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-2 bg-card/40">
          <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Webhook className="size-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Nenhum webhook cadastrado</h3>
          <p className="text-xs text-muted-foreground max-w-md">
            Envie eventos em tempo real via HTTP POST com assinaturas criptográficas HMAC-SHA256 para APIs externas, microsserviços ou Slack.
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            size="sm"
            variant="outline"
            className="mt-2 text-xs gap-1.5"
          >
            <Plus className="size-3.5" />
            Cadastrar Primeiro Webhook
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((wh) => {
            let eventsList: string[] = [];
            try {
              eventsList = typeof wh.events === 'string' ? JSON.parse(wh.events) : wh.events;
            } catch {
              eventsList = ['*'];
            }

            const isRevealed = Boolean(revealedSecrets[wh.id]);

            return (
              <div
                key={wh.id}
                className="bg-card border border-border/80 rounded-xl p-4 shadow-2xs hover:border-border transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Webhook className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground">{wh.name}</span>
                        <Badge
                          variant="outline"
                          className={
                            wh.enabled
                              ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[10px] py-0'
                              : 'border-muted-foreground/30 text-muted-foreground bg-muted/20 text-[10px] py-0'
                          }
                        >
                          {wh.enabled ? 'Ativo' : 'Desativado'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono mt-0.5">
                        <ExternalLink className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-md">{wh.url}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestDelivery(wh)}
                      disabled={testingId === wh.id}
                      className="h-7 text-xs gap-1 cursor-pointer"
                    >
                      <Send className="size-3 text-primary" />
                      {testingId === wh.id ? 'Testando...' : 'Testar Ping'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleEnabled(wh)}
                      className="h-7 text-xs cursor-pointer"
                    >
                      {wh.enabled ? 'Desativar' : 'Ativar'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteWebhook(wh.id)}
                      className="size-7 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Excluir webhook"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-[11px]">
                  {/* Eventos subscritos */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Eventos:</span>
                    <div className="flex flex-wrap gap-1">
                      {eventsList.map((ev, i) => (
                        <span
                          key={i}
                          className="bg-muted px-1.5 py-0.5 rounded-md font-mono text-[10px] text-foreground"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Secret HMAC */}
                  {wh.secret && (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-primary" />
                      <span className="text-muted-foreground">Segredo HMAC:</span>
                      <code className="font-mono text-[10px] bg-muted/60 px-1.5 py-0.5 rounded-md text-foreground">
                        {isRevealed ? wh.secret : '••••••••••••••••••••••••'}
                      </code>
                      <button
                        type="button"
                        onClick={() => toggleRevealSecret(wh.id)}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        title={isRevealed ? 'Ocultar' : 'Visualizar'}
                      >
                        {isRevealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copySecret(wh.id, wh.secret)}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        title="Copiar segredo"
                      >
                        {copiedId === wh.id ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação */}
      <CreateWebhookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={createWebhook}
      />
    </div>
  );
};
