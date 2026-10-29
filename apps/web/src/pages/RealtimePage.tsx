import React, { useState } from 'react';
import {
  Activity,
  Send,
  Wifi,
  WifiOff,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useRealtimeStream } from '../hooks/api/use-realtime';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const RealtimePage: React.FC = () => {
  const { t } = useI18n();
  const [channel, setChannel] = useState('global');
  const [eventName, setEventName] = useState('edgekit:ping');
  const [payloadText, setPayloadText] = useState('{\n  "message": "Olá mundo em tempo real!",\n  "sender": "Admin"\n}');
  const [sending, setSending] = useState(false);

  const { status, messages, clearMessages, triggerBroadcast, reconnect } = useRealtimeStream(channel);

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
      toast.success(t.common.success);
    } catch (err: any) {
      toast.error(err.message || t.common.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.realtime.title}
        description={t.realtime.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                status === 'connected'
                  ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10 gap-1.5'
                  : status === 'connecting'
                  ? 'border-amber-500/30 text-amber-500 bg-amber-500/10 gap-1.5'
                  : 'border-destructive/30 text-destructive bg-destructive/10 gap-1.5'
              }
            >
              {status === 'connected' ? (
                <>
                  <Wifi className="size-3" />
                  <span>{t.realtime.connected}</span>
                </>
              ) : status === 'connecting' ? (
                <>
                  <RefreshCw className="size-3 animate-spin" />
                  <span>{t.realtime.connecting}</span>
                </>
              ) : (
                <>
                  <WifiOff className="size-3" />
                  <span>{t.realtime.disconnected}</span>
                </>
              )}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={reconnect}
              className="size-8"
              title="Reconectar"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de Emissão de Broadcast */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-emerald-500" />
              <CardTitle className="text-sm font-semibold">Disparar Mensagem de Teste</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {t.realtime.channel}
              </label>
              <input
                type="text"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {t.realtime.eventName}
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {t.realtime.payloadJson}
              </label>
              <textarea
                rows={5}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full p-3 bg-muted/50 border border-border rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full gap-1.5 text-xs h-9 cursor-pointer"
            >
              <Send className="size-3.5" />
              {sending ? t.common.loading : t.realtime.broadcastButton}
            </Button>
          </CardContent>
        </Card>

        {/* Feed de Eventos Recebidos */}
        <Card className="lg:col-span-2 flex flex-col h-[520px]">
          <CardHeader className="flex flex-row items-center justify-between py-3 border-b border-border space-y-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t.realtime.liveFeed} ({messages.length})
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="gap-1 text-xs h-7 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3" />
              {t.realtime.clearFeed}
            </Button>
          </CardHeader>
          <CardContent className="p-3 flex-1 overflow-y-auto space-y-2.5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground gap-2">
                <Activity className="size-8 opacity-20" />
                <span className="text-xs">
                  Aguardando mensagens em tempo real no canal "{channel}" via Cloudflare Durable Objects...
                </span>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="bg-card border border-border/80 p-3 rounded-xl text-xs space-y-1.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">{m.event}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="font-mono text-[11px] text-foreground/90 bg-muted/40 p-2 rounded-lg overflow-x-auto">
                    {typeof m.payload === 'object' ? JSON.stringify(m.payload, null, 2) : m.payload}
                  </pre>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
};
