import React, { useState } from 'react';
import {
  Key,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { usePlatformKeysQuery } from '../hooks/api/use-auth';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const SettingsPage: React.FC = () => {
  const { t } = useI18n();
  const { data: keys = {}, isLoading } = usePlatformKeysQuery();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success(t.settings.copied);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.settings.title}
        description={t.settings.subtitle}
      />

      <div className="space-y-6">
        {/* Card: Chave Pública Anon */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="size-4 text-emerald-500" />
                <CardTitle className="text-base">{t.settings.anonKey}</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">Uso Seguro no Frontend</Badge>
            </div>
            <CardDescription className="text-xs">
              Pode ser compartilhada publicamente no código do frontend (React, Next.js, mobile apps).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 bg-muted/60 p-2.5 rounded-xl border border-border">
              <code className="text-xs font-mono text-foreground flex-1 truncate">
                {isLoading ? '...' : keys.anonKey || 'hb_anon_default'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(keys.anonKey || 'hb_anon_default', 'anon')}
                className="gap-1.5 text-xs h-7 shrink-0"
              >
                {copiedKey === 'anon' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                <span>{copiedKey === 'anon' ? t.settings.copied : t.settings.copy}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card: Chave de Administração (Service Role Key) */}
        <Card className="border-amber-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber-500" />
                <CardTitle className="text-base">{t.settings.serviceRoleKey}</CardTitle>
              </div>
              <Badge variant="destructive" className="text-[10px]">Restrita / Admin</Badge>
            </div>
            <CardDescription className="text-xs">
              Concede controle total administrativo. Nunca exponha esta chave no navegador ou repositórios públicos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 bg-muted/60 p-2.5 rounded-xl border border-border">
              <code className="text-xs font-mono text-foreground flex-1 truncate">
                {isLoading ? '...' : keys.serviceRoleKey || 'hb_service_default'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(keys.serviceRoleKey || 'hb_service_default', 'service')}
                className="gap-1.5 text-xs h-7 shrink-0"
              >
                {copiedKey === 'service' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                <span>{copiedKey === 'service' ? t.settings.copied : t.settings.copy}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card: Documentação OpenAPI Scalar */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <CardTitle className="text-base">Documentação da API & OpenAPI 3.1</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Explore os endpoints REST com o Scalar API Reference integrado diretamente no Worker.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/docs" target="_blank" rel="noreferrer">
              <Button className="gap-2 text-xs">
                <span>{t.settings.docsLink}</span>
                <ExternalLink className="size-3.5" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
};
