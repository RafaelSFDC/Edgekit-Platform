import React, { useState } from 'react';
import { Navigate, Link } from '@tanstack/react-router';
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Globe,
  Sun,
  Moon,
  ArrowRight,
  ShieldAlert,
  Users,
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

type LoginMode = 'credentials' | 'key';

export const LoginPage: React.FC = () => {
  const {
    isAuthenticated,
    isLoading,
    isLoggingIn,
    isSetupComplete,
    login,
    loginWithCredentials,
    error: authError,
  } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [mode, setMode] = useState<LoginMode>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

    if (mode === 'credentials') {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        setLocalError('Informe seu e-mail e senha de administrador.');
        return;
      }
      const success = await loginWithCredentials({ email: cleanEmail, password });
      if (success) {
        toast.success('Autenticado com sucesso na sessão administrativa!');
      } else {
        const msg = authError || 'Credenciais de administrador inválidas.';
        setLocalError(msg);
        toast.error(msg);
      }
    } else {
      const trimmed = passkey.trim();
      if (!trimmed) {
        setLocalError('Informe a Chave de Acesso (Service Role Key).');
        return;
      }
      const success = await login(trimmed);
      if (success) {
        toast.success('Autenticado com sucesso via Service Role Key!');
      } else {
        const msg = authError || 'Chave de acesso inválida.';
        setLocalError(msg);
        toast.error(msg);
      }
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

      <div className="w-full max-w-md space-y-5">
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

        {/* Aviso de Setup Pendente */}
        {!isSetupComplete && (
          <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-orange-500 font-medium">
              <ShieldAlert className="size-4 shrink-0" />
              <span>Instância não inicializada</span>
            </div>
            <Link
              to="/setup"
              className="px-2.5 py-1 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-medium text-[11px] transition-colors"
            >
              Fazer Setup Inicial &rarr;
            </Link>
          </div>
        )}

        {/* Card de Login */}
        <Card className="shadow-lg border-border/80">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{t.login.title}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {mode === 'credentials'
                      ? 'Acesso administrativo seguro com cookie HttpOnly.'
                      : t.login.subtitle}
                  </CardDescription>
                </div>
              </div>

              {/* Seletor de Modo de Autenticação */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-muted/60 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('credentials');
                    setLocalError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                    mode === 'credentials'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="size-3.5" />
                  <span>Equipe / Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('key');
                    setLocalError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                    mode === 'key'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <KeyRound className="size-3.5" />
                  <span>Service Key</span>
                </button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3.5">
              {displayError && (
                <Alert variant="destructive" className="py-2 px-3 text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <AlertDescription className="text-xs">{displayError}</AlertDescription>
                </Alert>
              )}

              {mode === 'credentials' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      {t.login.emailLabel}
                    </label>
                    <div className="relative flex items-center">
                      <Mail className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (localError) setLocalError(null);
                        }}
                        placeholder="admin@empresa.com"
                        disabled={isLoggingIn}
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      {t.login.passwordLabel}
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (localError) setLocalError(null);
                        }}
                        placeholder="Sua senha de administrador"
                        disabled={isLoggingIn}
                        className="w-full h-9 pl-8 pr-9 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        aria-label="Toggle password visibility"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        className="absolute right-2.5 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-hidden"
                      >
                        {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
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
                      placeholder="ek_sec_... (Service Role Key)"
                      disabled={isLoggingIn}
                      className="w-full h-9 pl-8 pr-9 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      aria-label="Toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-2.5 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-hidden"
                    >
                      {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Utilizada em deploys locais ou automações via CI/CD.
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-2 pt-1">
              <Button
                type="submit"
                disabled={
                  isLoggingIn ||
                  (mode === 'credentials' ? !email.trim() || !password : !passkey.trim())
                }
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

              {!isSetupComplete && (
                <div className="text-center pt-1">
                  <Link
                    to="/setup"
                    className="text-xs text-orange-500 hover:text-orange-400 font-medium underline underline-offset-4"
                  >
                    Primeira instalação? Clique aqui para realizar o Setup.
                  </Link>
                </div>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

