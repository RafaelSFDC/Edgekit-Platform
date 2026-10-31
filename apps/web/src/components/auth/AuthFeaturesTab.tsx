import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface AuthFeaturesTabProps {
  publicConfig?: any;
}

type AuthSnippetType = 'signup' | 'signin' | 'magiclink' | 'emailotp' | 'org' | 'twofactor';

export const AuthFeaturesTab: React.FC<AuthFeaturesTabProps> = ({ publicConfig: _publicConfig }) => {
  const [activeSnippet, setActiveSnippet] = useState<AuthSnippetType>('signup');
  const [copied, setCopied] = useState(false);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

  const snippets = useMemo(() => {
    return {
      signup: `// 1. Cadastro de novo usuário via fetch ou Better-Auth Client
const res = await fetch('${originUrl}/api/v1/auth/sign-up/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Nome do Usuário',
    email: 'usuario@exemplo.com',
    password: 'senha-segura-123',
  }),
});

const data = await res.json();
console.log('Usuário cadastrado:', data.user);
// Cookie de sessão HttpOnly é gravado automaticamente no navegador`,

      signin: `// 2. Login com E-mail e Senha
const res = await fetch('${originUrl}/api/v1/auth/sign-in/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    password: 'senha-segura-123',
  }),
});

const data = await res.json();
console.log('Sessão iniciada:', data.session);`,

      magiclink: `// 3. Login sem senha via Magic Link
const res = await fetch('${originUrl}/api/v1/auth/sign-in/magic-link', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    callbackURL: '/dashboard',
  }),
});

console.log('Link mágico enviado para a caixa de entrada!');`,

      emailotp: `// 4. Autenticação via Código OTP (One-Time Password)
// Passo 1: Solicitar envio do código de 6 dígitos
await fetch('${originUrl}/api/v1/auth/email-otp/send-verification-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    type: 'sign-in',
  }),
});

// Passo 2: Validar o código digitado pelo usuário
const verifyRes = await fetch('${originUrl}/api/v1/auth/sign-in/email-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    otp: '123456',
  }),
});
const { session } = await verifyRes.json();`,

      org: `// 5. Multi-tenancy: Alternar Organização Ativa
// Todas as consultas subsequentes ao banco com RLS de 'org_member' filtrarão automaticamente por esta organização!
const res = await fetch('${originUrl}/api/v1/auth/organization/set-active', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    organizationId: 'org_id_aqui',
  }),
});

console.log('Organização ativa atualizada na sessão!');`,

      twofactor: `// 6. Autenticação de Dois Fatores (TOTP)
// Passo 1: Habilitar 2FA e obter URI / QR Code
const setupRes = await fetch('${originUrl}/api/v1/auth/two-factor/enable', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    password: 'senha-do-usuario',
  }),
});
const { totpURI, backupCodes } = await setupRes.json();

// Passo 2: Confirmar primeiro código do app autenticador
await fetch('${originUrl}/api/v1/auth/two-factor/verify-totp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: '123456',
  }),
});`,
    };
  }, [originUrl]);

  const copyCode = () => {
    navigator.clipboard.writeText(snippets[activeSnippet]);
    setCopied(true);
    toast.success('Snippet copiado com sucesso!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Email & Senha</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <CheckCircle2 className="size-2.5" />
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Cadastro, verificação de e-mail e hash seguro de credenciais com Better Auth.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Organizações & Times</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <CheckCircle2 className="size-2.5" />
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Multi-tenancy B2B com papéis (owner, admin, member) e integração nativa com o Policy Engine.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Dois Fatores (2FA / TOTP)</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <CheckCircle2 className="size-2.5" />
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Compatível com Google Authenticator, Authy e 1Password com suporte a códigos de backup.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Magic Link (Passwordless)</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <CheckCircle2 className="size-2.5" />
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Acesso com link seguro de um clique enviado por e-mail com expiração automática.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Email OTP (6 Dígitos)</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <CheckCircle2 className="size-2.5" />
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Códigos numéricos descartáveis para login rápido ou verificação de e-mail.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Bearer Token & Sessões</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <CheckCircle2 className="size-2.5" />
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Sessões híbridas: Cookies HttpOnly para a Web e Bearer Tokens para apps mobile e SDKs.
          </p>
        </div>
      </div>

      {/* Code Snippets Section */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-card/40 border border-border/70 p-2.5 rounded-xl">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={activeSnippet === 'signup' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSnippet('signup')}
              className="h-7 text-xs px-2.5 cursor-pointer"
            >
              Sign Up
            </Button>

            <Button
              variant={activeSnippet === 'signin' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSnippet('signin')}
              className="h-7 text-xs px-2.5 cursor-pointer"
            >
              Sign In
            </Button>

            <Button
              variant={activeSnippet === 'magiclink' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSnippet('magiclink')}
              className="h-7 text-xs px-2.5 cursor-pointer"
            >
              Magic Link
            </Button>

            <Button
              variant={activeSnippet === 'emailotp' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSnippet('emailotp')}
              className="h-7 text-xs px-2.5 cursor-pointer"
            >
              Email OTP
            </Button>

            <Button
              variant={activeSnippet === 'org' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSnippet('org')}
              className="h-7 text-xs px-2.5 cursor-pointer"
            >
              Organizações
            </Button>

            <Button
              variant={activeSnippet === 'twofactor' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSnippet('twofactor')}
              className="h-7 text-xs px-2.5 cursor-pointer"
            >
              2FA (TOTP)
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={copyCode}
            className="h-7 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </Button>
        </div>

        <div className="rounded-xl overflow-hidden border border-border/70 bg-zinc-950 p-4 font-mono text-xs text-zinc-200">
          <pre className="overflow-x-auto whitespace-pre leading-relaxed">
            <code>{snippets[activeSnippet]}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
