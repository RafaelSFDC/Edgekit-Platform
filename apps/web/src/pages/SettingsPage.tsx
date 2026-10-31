import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  Globe,
  Shield,
  Plus,
  Trash2,
  Lock,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { usePlatformKeysQuery } from '../hooks/api/use-auth';
import { useSecuritySettingsQuery, useUpdateSecuritySettingsMutation } from '../hooks/api/use-security';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const SettingsPage: React.FC = () => {
  const { t } = useI18n();
  const { data: keys = {}, isLoading } = usePlatformKeysQuery();
  const { data: securitySettings } = useSecuritySettingsQuery();
  const updateSecurityMutation = useUpdateSecuritySettingsMutation();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Security Form State
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState('');
  const [blockExternalLocalhost, setBlockExternalLocalhost] = useState(true);

  useEffect(() => {
    if (securitySettings) {
      setAllowedOrigins(securitySettings.allowedOrigins || []);
      setAllowedIps(securitySettings.allowedIps || []);
      setBlockExternalLocalhost(securitySettings.blockExternalLocalhost ?? true);
    }
  }, [securitySettings]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success(t.settings.copied);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddOrigin = () => {
    const clean = newOrigin.trim();
    if (!clean) return;
    if (allowedOrigins.includes(clean)) {
      toast.error('Esta origem já está cadastrada.');
      return;
    }
    setAllowedOrigins([...allowedOrigins, clean]);
    setNewOrigin('');
  };

  const handleRemoveOrigin = (origin: string) => {
    setAllowedOrigins(allowedOrigins.filter((o) => o !== origin));
  };

  const handleAddIp = () => {
    const clean = newIp.trim();
    if (!clean) return;
    if (allowedIps.includes(clean)) {
      toast.error('Este IP já está na whitelist.');
      return;
    }
    setAllowedIps([...allowedIps, clean]);
    setNewIp('');
  };

  const handleRemoveIp = (ip: string) => {
    setAllowedIps(allowedIps.filter((i) => i !== ip));
  };

  const handleSaveSecurity = async () => {
    try {
      await updateSecurityMutation.mutateAsync({
        allowedOrigins,
        allowedIps,
        blockExternalLocalhost,
      });
      toast.success('Configurações de segurança atualizadas com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao salvar configurações de segurança.');
    }
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
              Concede controle total administrativo e bypass de RLS. Nunca exponha esta chave no navegador ou repositórios públicos.
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

        {/* Card: Segurança de Acesso, CORS & Whitelist de IPs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <CardTitle className="text-base">Segurança de Acesso, CORS & Whitelist de IPs</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">Controle de Rede</Badge>
            </div>
            <CardDescription className="text-xs">
              Defina quais domínios web e endereços IP externos possuem permissão para chamar sua API na Cloudflare.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Origens CORS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Globe className="size-3.5 text-sky-500" />
                  Domínios Frontend Confiáveis (CORS Whitelist)
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Origens de onde seu app frontend roda em produção.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="https://meuapp.com ou https://meuapp.vercel.app"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddOrigin()}
                  className="bg-background border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddOrigin}
                  className="h-8 text-xs gap-1 cursor-pointer"
                >
                  <Plus className="size-3" />
                  <span>Adicionar Origem</span>
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {allowedOrigins.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground italic">
                    Nenhum domínio restrito cadastrado. A API aceitará requisições de origens padrão (localhost e APP_URL).
                  </span>
                ) : (
                  allowedOrigins.map((org) => (
                    <Badge
                      key={org}
                      variant="secondary"
                      className="text-xs font-mono py-1 px-2 gap-1.5 flex items-center"
                    >
                      <span>{org}</span>
                      <button
                        onClick={() => handleRemoveOrigin(org)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer ml-1"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {/* Whitelist de IPs */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="size-3.5 text-emerald-500" />
                  Whitelist de IPs para Acesso Remoto
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Restrinja o acesso à API a IPs específicos. Deixe vazio para permitir qualquer IP.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="ex: 189.40.12.33 ou 201.55.*"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddIp()}
                  className="bg-background border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddIp}
                  className="h-8 text-xs gap-1 cursor-pointer"
                >
                  <Plus className="size-3" />
                  <span>Adicionar IP</span>
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {allowedIps.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground italic">
                    Whitelist vazia. Acesso liberado para qualquer IP público.
                  </span>
                ) : (
                  allowedIps.map((ip) => (
                    <Badge
                      key={ip}
                      variant="secondary"
                      className="text-xs font-mono py-1 px-2 gap-1.5 flex items-center"
                    >
                      <span>{ip}</span>
                      <button
                        onClick={() => handleRemoveIp(ip)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer ml-1"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {/* Proteção contra localhost externo */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-foreground block">
                  Bloquear Acessos de Localhost de Outros Computadores
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Impede que clientes externos forjem origens locais (localhost/127.0.0.1) se não estiverem na mesma máquina.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockExternalLocalhost}
                  onChange={(e) => setBlockExternalLocalhost(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveSecurity}
                disabled={updateSecurityMutation.isPending}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Check className="size-3.5" />
                <span>{updateSecurityMutation.isPending ? 'Salvando...' : 'Salvar Configurações de Segurança'}</span>
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
