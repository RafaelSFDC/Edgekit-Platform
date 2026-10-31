import React, { useState } from 'react';
import {
  Activity,
  Send,
  Trash2,
  Copy,
  Check,
  Radio,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { RealtimeMessage } from '@/types';

interface RealtimeChannelInspectorProps {
  channel: string;
  setChannel: (c: string) => void;
  status: 'connected' | 'connecting' | 'disconnected';
  messages: RealtimeMessage[];
  clearMessages: () => void;
  triggerBroadcast: (event: string, payload: any) => Promise<void>;
}

export const RealtimeChannelInspector: React.FC<RealtimeChannelInspectorProps> = ({
  channel,
  setChannel,
  status,
  messages,
  clearMessages,
  triggerBroadcast,
}) => {
  const [eventName, setEventName] = useState('edgekit:ping');
  const [payloadText, setPayloadText] = useState(
    '{\n  "message": "Olá mundo em tempo real!",\n  "sender": "Admin"\n}',
  );
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    let parsed: any = {};
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      parsed = { text: payloadText };
    }

    try {
      await triggerBroadcast(eventName, parsed);
      toast.success('Mensagem de broadcast transmitida com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao transmitir broadcast.');
    } finally {
      setSending(false);
    }
  };

  const copyPayload = (id: string, payload: any) => {
    navigator.clipboard.writeText(
      typeof payload === 'object' ? JSON.stringify(payload, null, 2) : String(payload),
    );
    setCopiedId(id);
    toast.success('Payload copiado para a área de transferência.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Painel de Emissão de Broadcast */}
      <Card className="lg:col-span-1 shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-primary animate-pulse" />
            <CardTitle className="text-sm font-semibold">Disparar Broadcast</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Canal (Channel)
            </label>
            <input
              type="text"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="ex: global, chat-1, db:users"
              className="w-full px-3 py-2 bg-muted/40 border border-border/80 rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Roteado deterministicamente para Cloudflare Durable Objects.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Nome do Evento (Event)
            </label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border/80 rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Dados da Mensagem (Payload JSON)
            </label>
            <textarea
              rows={5}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="w-full p-3 bg-muted/40 border border-border/80 rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || status !== 'connected'}
            className="w-full gap-1.5 text-xs h-9 cursor-pointer"
          >
            <Send className="size-3.5" />
            {sending ? 'Transmitindo...' : 'Enviar Broadcast'}
          </Button>
        </CardContent>
      </Card>

      {/* Feed de Eventos Recebidos */}
      <Card className="lg:col-span-2 flex flex-col h-[560px] shadow-xs border-border/80">
        <CardHeader className="flex flex-row items-center justify-between py-3 border-b border-border/50 space-y-0">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-500" />
            <span className="text-xs font-semibold text-foreground tracking-wide">
              Stream de Mensagens ao Vivo ({messages.length})
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            disabled={messages.length === 0}
            className="gap-1 text-xs h-7 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Trash2 className="size-3" />
            Limpar Feed
          </Button>
        </CardHeader>
        <CardContent className="p-3 flex-1 overflow-y-auto space-y-2.5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground gap-2">
              <Activity className="size-8 opacity-25" />
              <span className="text-xs">
                Aguardando eventos em tempo real no canal "{channel}" via Cloudflare Durable Objects...
              </span>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className="bg-card border border-border/80 p-3 rounded-xl text-xs space-y-1.5 shadow-2xs group hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold font-mono text-primary text-[11px] bg-primary/10 px-2 py-0.5 rounded-md">
                      {m.event}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      id: {m.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyPayload(m.id, m.payload)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Copiar JSON"
                    >
                      {copiedId === m.id ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                </div>
                <pre className="font-mono text-[11px] text-foreground/90 bg-muted/40 p-2.5 rounded-lg overflow-x-auto border border-border/40">
                  {typeof m.payload === 'object' ? JSON.stringify(m.payload, null, 2) : String(m.payload)}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
