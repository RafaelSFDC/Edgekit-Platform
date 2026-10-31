import React, { useState } from 'react';
import {
  Users,
  Shield,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useTableRowsQuery } from '../hooks/api/use-database';
import {
  usePublicConfigQuery,
  useAdminCreateUserMutation,
  useAdminUpdateUserRoleMutation,
  useAdminDeleteUserMutation,
} from '../hooks/api/use-auth';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export const AuthPage: React.FC = () => {
  const { t } = useI18n();
  const { data: users = [], refetch, isLoading } = useTableRowsQuery('users');
  const { data: publicConfig } = usePublicConfigQuery();

  const createUserMutation = useAdminCreateUserMutation();
  const updateRoleMutation = useAdminUpdateUserRoleMutation();
  const deleteUserMutation = useAdminDeleteUserMutation();

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');

  // Delete User Modal
  const [deletingUser, setDeletingUser] = useState<any | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      toast.success('Usuário criado com sucesso!');
      setIsCreateOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setRole('user');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar usuário.');
    }
  };

  const handleToggleRole = async (user: any) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await updateRoleMutation.mutateAsync({ id: user.id, role: newRole });
      toast.success(`Função de "${user.name || user.email}" alterada para ${newRole}!`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar função.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    try {
      await deleteUserMutation.mutateAsync(deletingUser.id);
      toast.success(`Usuário "${deletingUser.name || deletingUser.email}" excluído com sucesso!`);
      setDeletingUser(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir usuário.');
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.auth.title}
        description={t.auth.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="gap-1.5 text-xs h-8 cursor-pointer"
            >
              <UserPlus className="size-3.5" />
              <span>Novo Usuário</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs h-8 cursor-pointer"
            >
              <RefreshCw className="size-3.5" />
              {t.common.refresh}
            </Button>
          </div>
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="secondary" className="text-[11px]">Email / Senha</Badge>
              <Badge
                variant={publicConfig?.oauthProviders?.google ? 'default' : 'secondary'}
                className="text-[11px]"
              >
                Google
              </Badge>
              <Badge
                variant={publicConfig?.oauthProviders?.github ? 'default' : 'secondary'}
                className="text-[11px]"
              >
                GitHub
              </Badge>
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
              Gerencie acessos, atribua privilégios administrativos e crie novos usuários
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
                  <th className="p-3 font-semibold text-muted-foreground">Função</th>
                  <th className="p-3 font-semibold text-muted-foreground">Criado em</th>
                  <th className="p-3 font-semibold text-muted-foreground text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-muted-foreground truncate max-w-[120px]">
                      {user.id}
                    </td>
                    <td className="p-3 font-medium">{user.name || 'Sem nome'}</td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Badge
                        variant={user.role === 'admin' ? 'default' : 'secondary'}
                        className={`text-[10px] ${
                          user.role === 'admin' ? 'bg-orange-500 hover:bg-orange-600' : ''
                        }`}
                      >
                        {user.role || 'user'}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-[11px]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleRole(user)}
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Alternar entre Admin e Usuário comum"
                        >
                          Tornar {user.role === 'admin' ? 'Usuário' : 'Admin'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingUser(user)}
                          className="size-7 text-destructive hover:bg-destructive/10 cursor-pointer"
                          title="Excluir Usuário"
                          aria-label="Excluir Usuário"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Modal: Criar Usuário */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base">Cadastrar Novo Usuário</DialogTitle>
            <DialogDescription className="text-xs">
              Crie uma conta com credenciais de email e senha no Better-Auth.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-3.5 py-2">
            <div>
              <label htmlFor="create-user-name" className="text-xs font-semibold text-foreground mb-1 block">Nome Completo</label>
              <input
                id="create-user-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full bg-muted/60 border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="create-user-email" className="text-xs font-semibold text-foreground mb-1 block">E-mail</label>
              <input
                id="create-user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@dominio.com"
                className="w-full bg-muted/60 border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="create-user-password" className="text-xs font-semibold text-foreground mb-1 block">Senha Inicial</label>
              <input
                id="create-user-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-muted/60 border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="create-user-role" className="text-xs font-semibold text-foreground mb-1 block">Função (Nível de Acesso)</label>
              <select
                id="create-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-muted/60 border border-border rounded-md px-3 py-1.5 text-xs text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="user">user (Usuário Regular do App)</option>
                <option value="admin">admin (Acesso Administrativo)</option>
              </select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={createUserMutation.isPending} className="cursor-pointer">
                {createUserMutation.isPending ? t.common.loading : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Exclusão de Usuário */}
      <Dialog open={Boolean(deletingUser)} onOpenChange={() => setDeletingUser(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive flex items-center gap-2">
              <ShieldAlert className="size-4" />
              Excluir Usuário?
            </DialogTitle>
            <DialogDescription className="text-xs">
              Tem certeza que deseja remover permanentemente o usuário{' '}
              <strong className="text-foreground">{deletingUser?.name || deletingUser?.email}</strong>?
              Todas as sessões e dados associados serão revogados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDeletingUser(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? t.common.loading : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
