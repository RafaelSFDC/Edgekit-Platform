import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  Users,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  BookOpen,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useStatsQuery } from '../hooks/api/use-stats';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const OverviewPage: React.FC = () => {
  const { t } = useI18n();
  const { data: stats, isLoading } = useStatsQuery();
  const [copied, setCopied] = useState(false);

  const snippetCode = `import { createEdgekitClient } from '@edgekit/platform-client'

const client = createEdgekitClient({
  url: window.location.origin,
  anonKey: 'sua-chave-anon-aqui'
})

// Consultar dados tipados no Cloudflare D1
const { data, error } = await client
  .from('users')
  .select('id, name, email')
  .limit(10)
  .execute()`;

  const copySnippet = () => {
    navigator.clipboard.writeText(snippetCode);
    setCopied(true);
    toast.success(t.common.success);
    setTimeout(() => setCopied(false), 2000);
  };

  const plan = stats?.plan || {};
  const features = plan.features || {};

  return (
    <PageLayout>
      <PageHeader
        title={t.overview.title}
        description={t.overview.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-500 gap-1.5 py-1 px-3">
              <span className="size-2 rounded-full bg-orange-500 animate-pulse" />
              Cloudflare Edge (Free Tier)
            </Badge>
            <a href="/docs" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <BookOpen className="size-3.5" />
                API Docs (Scalar)
              </Button>
            </a>
          </div>
        }
      />

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Usuários */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.overview.registeredUsers}
            </span>
            <div className="size-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <Users className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {isLoading ? '...' : stats?.totalUsers ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Better-Auth Engine</p>
          </CardContent>
        </Card>

        {/* Card 2: D1 Tabelas */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.overview.d1Tables}
            </span>
            <div className="size-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Database className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {isLoading ? '...' : stats?.totalTables ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Cloudflare D1 SQLite</p>
          </CardContent>
        </Card>

        {/* Card 3: R2 Arquivos */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.overview.r2Files}
            </span>
            <div className="size-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <HardDrive className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {isLoading ? '...' : stats?.totalFiles ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Cloudflare R2 Storage</p>
          </CardContent>
        </Card>

        {/* Card 4: Realtime DO */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.overview.realtimeDO}
            </span>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Activity className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">Durable Objects</div>
            <p className="text-xs text-muted-foreground mt-1">WebSockets com hibernação</p>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Recursos Cloudflare */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-orange-500" />
            <CardTitle className="text-base">{t.overview.cloudflareResources}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Verificação automática das primitivas e limites na infraestrutura edge da Cloudflare
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Cloudflare D1 Database</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {features.d1Database?.tier || 'Free Tier'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {features.d1Database?.details || 'Instância SQLite serverless nativa com replicação global.'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Cloudflare R2 Object Storage</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {features.r2Storage?.tier || 'Free Tier'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {features.r2Storage?.details || 'Armazenamento de objetos compatível com S3 sem custos de tráfego.'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Realtime Durable Objects</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {features.realtimeDurableObjects?.tier || 'Free Tier'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {features.realtimeDurableObjects?.details || 'Sessões com estado fortemente consistente e hibernação de WebSockets.'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3">
              {features.dynamicWorkers?.enabled ? (
                <CheckCircle2 className="size-5 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Workers for Platforms</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {features.dynamicWorkers?.enabled ? 'Ativo' : 'Plano Pago Requerido'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {features.dynamicWorkers?.upgradeNotice ||
                    features.dynamicWorkers?.details ||
                    'Execução de código dinâmico sob demanda na borda.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snippet de Conexão Rápida */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t.overview.connectSnippetTitle}</CardTitle>
            <CardDescription className="text-xs">
              {t.overview.connectSnippetSubtitle}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copySnippet}
            className="gap-1.5 text-xs cursor-pointer"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span>{copied ? t.settings.copied : t.settings.copy}</span>
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted/60 p-4 rounded-xl text-xs font-mono text-foreground overflow-x-auto border border-border">
            {snippetCode}
          </pre>
        </CardContent>
      </Card>
    </PageLayout>
  );
};
