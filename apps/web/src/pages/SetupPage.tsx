import React, { useState } from 'react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import {
  User,
  Mail,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
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
import { performSetup } from '../services/api';
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

export const SetupPage: React.FC = () => {
  const { isAuthenticated, isSetupComplete, isLoading, checkSetup } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Se o setup já foi concluído ou usuário já está autenticado, redireciona
  if (isSetupComplete && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (isSetupComplete && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedToken = setupToken.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (password.length < 8) {
      setError('A senha do proprietário deve conter no mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('A confirmação de senha não confere com a senha digitada.');
      return;
    }

    setIsSubmitting(true);
    try {
      await performSetup({
        name: trimmedName,
        email: trimmedEmail,
        password,
        setupToken: trimmedToken || undefined,
      });

      toast.success('Proprietário configurado com sucesso! Bem-vindo ao Edgekit Platform.');
      await checkSetup();
      navigate({ to: '/' });
    } catch (err: any) {
      const msg = err.message || 'Falha ao concluir o setup inicial da plataforma.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-8 select-none">
      {/* Botões Utilitários no Canto Superior Direito */}
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

      <div className="w-full max-w-lg space-y-6">
        {/* Logo e Cabeçalho */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-sm">
            <EdgekitLogo size={32} module="platform" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Edgekit <span className="text-orange-500">Platform</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Setup Inicial & Registro do Proprietário (Owner)</p>
          </div>
        </div>

        {/* Card do Formulário de Setup */}
        <Card className="shadow-lg border-border/80">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-orange-500" />
                <CardTitle className="text-base">{t.login.setupTitle}</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {t.login.setupSubtitle}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3.5">
              {error && (
                <Alert variant="destructive" className="py-2 px-3 text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              {/* Nome */}
              <div>
                <label htmlFor="setup-name" className="block text-xs font-medium text-foreground mb-1">
                  {t.login.nameLabel} <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    id="setup-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="ex: Alex Silva"
                    required
                    disabled={isSubmitting}
                    className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div>
                <label htmlFor="setup-email" className="block text-xs font-medium text-foreground mb-1">
                  {t.login.emailLabel} <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    id="setup-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="admin@seudominio.com"
                    required
                    disabled={isSubmitting}
                    className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="setup-password" className="block text-xs font-medium text-foreground mb-1">
                    {t.login.passwordLabel} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Mínimo 8 caracteres"
                      required
                      minLength={8}
                      disabled={isSubmitting}
                      className="w-full h-9 pl-8 pr-8 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      aria-label="Toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-hidden"
                    >
                      {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-confirm-password" className="block text-xs font-medium text-foreground mb-1">
                    Confirmar Senha <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      id="setup-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Repita a senha"
                      required
                      minLength={8}
                      disabled={isSubmitting}
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {/* SETUP_TOKEN (Opcional/Exigido se configurado) */}
              <div className="pt-1">
                <label htmlFor="setup-token" className="block text-xs font-medium text-foreground mb-1">
                  Setup Token (Opcional)
                </label>
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    id="setup-token"
                    type="password"
                    value={setupToken}
                    onChange={(e) => {
                      setSetupToken(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="ek_setup_... (se configurado nas variáveis de ambiente)"
                    disabled={isSubmitting}
                    className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Exigido somente se o segredo <code>SETUP_TOKEN</code> foi adicionado à Cloudflare ou ao <code>.dev.vars</code>.
                </p>
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                disabled={isSubmitting || !name.trim() || !email.trim() || password.length < 8}
                className="w-full gap-1.5 text-xs h-9 cursor-pointer bg-orange-600 hover:bg-orange-500 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Configurando Proprietário...</span>
                  </>
                ) : (
                  <>
                    <span>{t.login.setupSubmit}</span>
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
