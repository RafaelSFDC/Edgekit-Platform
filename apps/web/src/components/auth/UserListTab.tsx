import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Search,
  RefreshCw,
  Clock,
  Laptop,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
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
import {
  useAdminCreateUserMutation,
  useAdminUpdateUserRoleMutation,
  useAdminDeleteUserMutation,
  useUserSessionsQuery,
  useRevokeSessionMutation,
} from '../../hooks/api/use-auth';

interface UserListTabProps {
  users: any[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const UserListTab: React.FC<UserListTabProps> = ({
  users,
  isLoading,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');

  // Delete User Modal
  const [deletingUser, setDeletingUser] = useState<any | null>(null);

  // User Sessions Modal
  const [viewingSessionsUser, setViewingSessionsUser] = useState<any | null>(null);

  const createUserMutation = useAdminCreateUserMutation();
  const updateRoleMutation = useAdminUpdateUserRoleMutation();
  const deleteUserMutation = useAdminDeleteUserMutation();

  const { data: userSessions = [], isLoading: loadingSessions, refetch: refetchSessions } =
    useUserSessionsQuery(viewingSessionsUser?.id || '');
  const revokeSessionMutation = useRevokeSessionMutation(viewingSessionsUser?.id);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.id && u.id.toLowerCase().includes(term)),
    );
  }, [users, searchTerm]);

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
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar usuário.');
    }
  };

  const handleToggleRole = async (user: any) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await updateRoleMutation.mutateAsync({ id: user.id, role: newRole });
      toast.success(`Função de "${user.name || user.email}" alterada para ${newRole}!`);
      onRefresh();
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
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir usuário.');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSessionMutation.mutateAsync(sessionId);
      toast.success('Sessão revogada com sucesso!');
      refetchSessions();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao revogar sessão.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail ou ID..."
            className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-8 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            title="Atualizar lista de usuários"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-8 text-xs px-3 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
          >
            <UserPlus className="size-3.5" />
            <span>Novo Usuário</span>
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-border/70 rounded-xl overflow-hidden bg-card/40">
        <div className="p-3.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">Usuários Cadastrados</h3>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {filteredUsers.length} usuários
          </Badge>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <span>Carregando usuários...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            {users.length === 0
              ? 'Nenhum usuário cadastrado na aplicação ainda.'
              : 'Nenhum usuário encontrado para a busca.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/60 border-b border-border/70">
                <tr>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Usuário
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    E-mail
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Função
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    2FA
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Criado em
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                          {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{user.name || 'Sem nome'}</p>
                          <p className="font-mono text-[10px] text-muted-foreground truncate">{user.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3.5 py-2.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{user.email}</span>
                        {user.emailVerified && (
                          <span title="E-mail Verificado">
                            <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3.5 py-2.5">
                      <button
                        type="button"
                        aria-label={`Alternar função de ${user.name || user.email}`}
                        onClick={() => handleToggleRole(user)}
                        title="Clique para alternar entre user e admin"
                        className="cursor-pointer"
                      >
                        <Badge
                          variant={user.role === 'admin' ? 'default' : 'secondary'}
                          className={`text-[10px] ${
                            user.role === 'admin' ? 'bg-orange-500 hover:bg-orange-600' : ''
                          }`}
                        >
                          {user.role || 'user'}
                        </Badge>
                      </button>
                    </td>

                    <td className="px-3.5 py-2.5">
                      {user.twoFactorEnabled ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                          Ativo
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">—</span>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 text-muted-foreground font-mono text-[11px]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>

                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingSessionsUser(user)}
                          className="h-7 text-xs px-2 gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
                          title="Ver sessões ativas deste usuário"
                        >
                          <Laptop className="size-3.5" />
                          <span>Sessões</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingUser(user)}
                          className="size-7 text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Excluir usuário"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Criar Usuário */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Cadastre um novo usuário para sua aplicação. As senhas são criptografadas com segurança no Better Auth.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3.5 py-2">
            <div className="space-y-1">
              <label htmlFor="create-user-name" className="text-xs font-semibold text-foreground">Nome Completo</label>
              <input
                id="create-user-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: João Silva"
                required
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-user-email" className="text-xs font-semibold text-foreground">E-mail</label>
              <input
                id="create-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="joao@exemplo.com"
                required
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-user-password" className="text-xs font-semibold text-foreground">Senha Inicial</label>
              <input
                id="create-user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-user-role" className="text-xs font-semibold text-foreground">Função (Role)</label>
              <select
                id="create-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="user">Usuário Comum (user)</option>
                <option value="admin">Administrador do App (admin)</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Sessões do Usuário */}
      <Dialog
        open={Boolean(viewingSessionsUser)}
        onOpenChange={(open) => !open && setViewingSessionsUser(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Laptop className="size-4 text-primary" />
              <DialogTitle>Sessões Ativas de {viewingSessionsUser?.name || viewingSessionsUser?.email}</DialogTitle>
            </div>
            <DialogDescription>
              Sessões com cookies seguros emitidas para este usuário. Você pode revogá-las a qualquer momento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2 max-h-[350px] overflow-y-auto">
            {loadingSessions ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Carregando sessões...
              </div>
            ) : userSessions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhuma sessão ativa encontrada para este usuário.
              </div>
            ) : (
              userSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/70 text-xs"
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate max-w-[200px]">
                        {s.userAgent || 'Navegador Web'}
                      </span>
                      {s.ipAddress && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {s.ipAddress}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                      <Clock className="size-3" />
                      Expira em: {new Date(s.expiresAt).toLocaleString()}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevokeSession(s.id)}
                    className="h-7 text-xs px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer shrink-0"
                  >
                    Revogar
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingSessionsUser(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusão */}
      <Dialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              <DialogTitle>Excluir Usuário?</DialogTitle>
            </div>
            <DialogDescription>
              Tem certeza de que deseja excluir <strong>{deletingUser?.name || deletingUser?.email}</strong>? Todas as sessões, contas vinculadas e referências serão excluídas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeletingUser(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
