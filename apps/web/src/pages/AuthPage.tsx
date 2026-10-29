import React from 'react';
import {
  Users,
  Shield,
  KeyRound,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useTableRowsQuery } from '../hooks/api/use-database';
import { usePublicConfigQuery } from '../hooks/api/use-auth';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const AuthPage: React.FC = () => {
  const { t } = useI18n();
  const { data: users = [], refetch, isLoading } = useTableRowsQuery('users');
  const { data: publicConfig } = usePublicConfigQuery();

  return (
    <PageLayout>
      <PageHeader
        title={t.auth.title}
        description={t.auth.subtitle}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className="size-3.5" />
            {t.common.refresh}
          </Button>
        }
      />

      {/* Grid de Provedores & Configurações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Motor de Auth</span>
              <Shield className="size-4 text-primary" />
            </div>
            <CardTitle className="text-base mt-2">Better-Auth</CardTitle>
            <CardDescription className="text-xs">
              Sessões com cookies HttpOnly seguros e suporte a OAuth nativo
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 gap-1.5">
              <CheckCircle2 className="size-3" />
              {t.auth.statusActive}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Provedores Sociais</span>
              <KeyRound className="size-4 text-blue-500" />
            </div>
            <CardTitle className="text-base mt-2">OAuth 2.0</CardTitle>
            <CardDescription className="text-xs">
              Google & GitHub integráveis via variáveis de ambiente
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[11px]">Email / Senha</Badge>
              <Badge variant="secondary" className="text-[11px]">Google</Badge>
              <Badge variant="secondary" className="text-[11px]">GitHub</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">{t.auth.usersCount}</span>
              <Users className="size-4 text-orange-500" />
            </div>
            <CardTitle className="text-2xl font-bold mt-2">{users.length}</CardTitle>
            <CardDescription className="text-xs">
              Identidades ativas registradas na tabela D1
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Tabela de Usuários */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Usuários Cadastrados</CardTitle>
            <CardDescription className="text-xs">
              Listagem de administradores e usuários do aplicativo
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {users.length} registros
          </Badge>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {t.common.loading}
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              {t.auth.emptyUsers}
            </div>
          ) : (
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-muted/70 border-b border-border select-none">
                <tr>
                  <th className="p-3 font-semibold text-muted-foreground">ID</th>
                  <th className="p-3 font-semibold text-muted-foreground">Nome</th>
                  <th className="p-3 font-semibold text-muted-foreground">E-mail</th>
                  <th className="p-3 font-semibold text-muted-foreground">Papel</th>
                  <th className="p-3 font-semibold text-muted-foreground">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-muted-foreground truncate max-w-[140px]">
                      {user.id}
                    </td>
                    <td className="p-3 font-medium">{user.name || 'Sem nome'}</td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                        {user.role || 'user'}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-[11px]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
};
