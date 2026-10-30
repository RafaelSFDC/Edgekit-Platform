import React, { useState } from 'react';
import { Navigate } from '@tanstack/react-router';
import {
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Globe,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react';
import { EdgekitLogo } from '../components/common/EdgekitLogo';
import { useAuth } from '../context/auth-context';
import { useI18n } from '../i18n/context';
import { useTheme } from '../theme/context';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
  const { isAuthenticated, isLoading, isLoggingIn, login, error: authError } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [passkey, setPasskey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background text-foreground gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 animate-pulse">
          <EdgekitLogo size={28} module="platform" />
        </div>
        <p className="text-xs text-muted-foreground animate-pulse">{t.common.loading}</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmed = passkey.trim();
    if (!trimmed) {
      setLocalError('Informe a Chave de Acesso (Service Role Key).');
      return;
    }

    const success = await login(trimmed);
    if (success) {
      toast.success('Autenticado com sucesso!');
    } else {
      const msg = authError || 'Chave de acesso inválida.';
      setLocalError(msg);
      toast.error(msg);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-8 select-none">
      {/* Botões Utilitários de Idioma e Tema no Canto Superior Direito */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
        >
          <Globe className="size-3.5" />
          <span className="font-semibold text-[10px] uppercase bg-muted px-1 py-0.5 rounded border border-border/70">
            {locale === 'pt-BR' ? 'PT-BR' : 'EN'}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          className="size-8 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Alternar Tema"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="size-4 text-primary" />
          ) : (
            <Sun className="size-4 text-amber-500" />
          )}
        </Button>
      </div>

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
            <p className="text-xs text-muted-foreground mt-0.5">Cloudflare Serverless BaaS Studio</p>
          </div>
        </div>

        {/* Card de Login */}
        <Card className="shadow-lg border-border/80">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">{t.login.title}</CardTitle>
              <CardDescription className="text-xs">
                {t.login.subtitle}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3.5">
              {displayError && (
                <Alert variant="destructive" className="py-2 px-3 text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <AlertDescription className="text-xs">{displayError}</AlertDescription>
                </Alert>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  {t.login.apiKeyLabel}
                </label>
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passkey}
                    onChange={(e) => {
                      setPasskey(e.target.value);
                      if (localError) setLocalError(null);
                    }}
                    placeholder={t.login.apiKeyPlaceholder}
                    disabled={isLoggingIn}
                    autoFocus
                    className="w-full h-9 pl-8 pr-9 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-2.5 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-hidden"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                disabled={isLoggingIn || !passkey.trim()}
                className="w-full gap-1.5 text-xs h-9 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{t.common.loading}</span>
                  </>
                ) : (
                  <>
                    <span>{t.login.submit}</span>
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};
