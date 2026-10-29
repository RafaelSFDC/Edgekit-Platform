import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { EdgekitLogo } from '../components/common/EdgekitLogo';
import { useI18n } from '../i18n/context';
import { useAuth } from '../context/auth-context';
import { usePerformSetupMutation } from '../hooks/api/use-auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyRound, UserCheck, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { login, isSetupComplete, checkSetup } = useAuth();
  const performSetupMutation = usePerformSetupMutation();

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [setupData, setSetupData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) {
      toast.error('Informe a Service Role Key.');
      return;
    }
    login(apiKeyInput.trim());
    toast.success('Autenticado com sucesso!');
    navigate({ to: '/' });
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData.name || !setupData.email || !setupData.password) {
      toast.error('Preencha todos os campos do administrador.');
      return;
    }

    try {
      await performSetupMutation.mutateAsync(setupData);
      toast.success('Administrador criado com sucesso!');
      await checkSetup();
      navigate({ to: '/' });
    } catch (err: any) {
      toast.error(err.message || 'Falha ao concluir setup.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        {/* Logo e Marca */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-sm">
            <EdgekitLogo size={32} module="platform" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Edgekit <span className="text-orange-500">Platform</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Cloudflare Serverless Studio</p>
          </div>
        </div>

        {!isSetupComplete ? (
          /* Formulário de Setup Inicial */
          <Card className="border-primary/30 shadow-lg">
            <form onSubmit={handleSetup}>
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
                  <Sparkles className="size-3.5" />
                  <span>Setup Inicial</span>
                </div>
                <CardTitle className="text-lg">{t.login.setupTitle}</CardTitle>
                <CardDescription className="text-xs">
                  {t.login.setupSubtitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t.login.nameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={setupData.name}
                    onChange={(e) => setSetupData({ ...setupData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    placeholder="Administrador"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t.login.emailLabel}
                  </label>
                  <input
                    type="email"
                    required
                    value={setupData.email}
                    onChange={(e) => setSetupData({ ...setupData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    placeholder="admin@edgekit.dev"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t.login.passwordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={setupData.password}
                    onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    placeholder="••••••••"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  disabled={performSetupMutation.isPending}
                  className="w-full gap-1.5 text-xs h-9 cursor-pointer"
                >
                  <UserCheck className="size-3.5" />
                  {performSetupMutation.isPending ? t.common.loading : t.login.setupSubmit}
                </Button>
              </CardFooter>
            </form>
          </Card>
        ) : (
          /* Formulário de Login com Service Role Key */
          <Card className="shadow-lg">
            <form onSubmit={handleLogin}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg">{t.login.title}</CardTitle>
                <CardDescription className="text-xs">
                  {t.login.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t.login.apiKeyLabel}
                  </label>
                  <div className="relative flex items-center">
                    <KeyRound className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={t.login.apiKeyPlaceholder}
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full gap-1.5 text-xs h-9 cursor-pointer">
                  <span>{t.login.submit}</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
};
