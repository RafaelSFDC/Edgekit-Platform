import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Radio,
  Webhook,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useRealtimeStream } from '../hooks/api/use-realtime';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RealtimeChannelInspector } from '../components/realtime/RealtimeChannelInspector';
import { WebhooksManagerTab } from '../components/realtime/WebhooksManagerTab';

type RealtimeActiveTab = 'stream' | 'webhooks';

export const RealtimePage: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<RealtimeActiveTab>('stream');
  const [channel, setChannel] = useState('global');

  const { status, messages, clearMessages, triggerBroadcast, reconnect } = useRealtimeStream(channel);

  return (
    <PageLayout>
      <PageHeader
        title={t.realtime.title}
        description={t.realtime.subtitle}
        actions={
          <div className="flex items-center gap-3">
            {/* Seletor de Abas */}
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/70">
              <Button
                variant={activeTab === 'stream' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('stream')}
                className="text-xs h-7.5 cursor-pointer gap-1.5"
              >
                <Radio className="size-3.5" />
                <span>Canais & Stream</span>
              </Button>

              <Button
                variant={activeTab === 'webhooks' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('webhooks')}
                className="text-xs h-7.5 cursor-pointer gap-1.5"
              >
                <Webhook className="size-3.5" />
                <span>Webhooks HTTP</span>
              </Button>
            </div>

            {/* Status da Conexão WebSocket */}
            <div className="flex items-center gap-1.5">
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
                className="size-8 cursor-pointer"
                title="Reconectar WebSocket"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>
        }
      />

      {activeTab === 'stream' && (
        <RealtimeChannelInspector
          channel={channel}
          setChannel={setChannel}
          status={status}
          messages={messages}
          clearMessages={clearMessages}
          triggerBroadcast={triggerBroadcast}
        />
      )}

      {activeTab === 'webhooks' && <WebhooksManagerTab />}
    </PageLayout>
  );
};
