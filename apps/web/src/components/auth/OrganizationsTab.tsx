import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Users,
  Search,
  RefreshCw,
  Trash2,
  UserPlus,
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
  useOrganizationsQuery,
  useCreateOrganizationMutation,
  useOrganizationMembersQuery,
  useAddOrganizationMemberMutation,
  useRemoveOrganizationMemberMutation,
} from '../../hooks/api/use-auth';

interface OrganizationsTabProps {
  allUsers: any[];
}

export const OrganizationsTab: React.FC<OrganizationsTabProps> = ({ allUsers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  // Selected Org for Members Modal
  const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'admin' | 'owner'>('member');

  const { data: orgs = [], isLoading, refetch } = useOrganizationsQuery();
  const createOrgMutation = useCreateOrganizationMutation();

  const {
    data: members = [],
    isLoading: loadingMembers,
    refetch: refetchMembers,
  } = useOrganizationMembersQuery(selectedOrg?.id || '');

  const addMemberMutation = useAddOrganizationMemberMutation(selectedOrg?.id || '');
  const removeMemberMutation = useRemoveOrganizationMemberMutation(selectedOrg?.id || '');

  const filteredOrgs = useMemo(() => {
    if (!searchTerm.trim()) return orgs;
    const term = searchTerm.toLowerCase();
    return orgs.filter(
      (o: any) =>
        (o.name && o.name.toLowerCase().includes(term)) ||
        (o.slug && o.slug.toLowerCase().includes(term)),
    );
  }, [orgs, searchTerm]);

  const handleNameChange = (val: string) => {
    setOrgName(val);
    if (!orgSlug || orgSlug === orgName.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setOrgSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim()) {
      toast.error('Informe o nome e o slug da organização.');
      return;
    }

    try {
      await createOrgMutation.mutateAsync({
        name: orgName.trim(),
        slug: orgSlug.trim().toLowerCase(),
      });
      toast.success('Organização criada com sucesso!');
      setIsCreateOpen(false);
      setOrgName('');
      setOrgSlug('');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar organização.');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberUserId) {
      toast.error('Selecione um usuário para adicionar à organização.');
      return;
    }

    try {
      await addMemberMutation.mutateAsync({
        userId: newMemberUserId,
        role: newMemberRole,
      });
      toast.success('Membro adicionado à organização com sucesso!');
      setNewMemberUserId('');
      refetchMembers();
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao adicionar membro.');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMemberMutation.mutateAsync(userId);
      toast.success('Membro removido da organização!');
      refetchMembers();
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao remover membro.');
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
            placeholder="Buscar por nome ou slug..."
            className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-8 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            title="Atualizar lista de organizações"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-8 text-xs px-3 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>Nova Organização</span>
          </Button>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="border border-border/70 rounded-xl overflow-hidden bg-card/40">
        <div className="p-3.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">Organizações & Times Multi-tenant</h3>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {filteredOrgs.length} organizações
          </Badge>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <span>Carregando organizações...</span>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            {orgs.length === 0
              ? 'Nenhuma organização cadastrada ainda. Crie a primeira para isolamento B2B multi-tenant!'
              : 'Nenhuma organização encontrada para a pesquisa.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/60 border-b border-border/70">
                <tr>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Organização
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Slug
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Membros
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    Criada em
                  </th>
                  <th className="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredOrgs.map((org: any) => (
                  <tr key={org.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Building2 className="size-3.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground truncate">{org.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{org.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3.5 py-2.5 font-mono text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">
                        {org.slug}
                      </Badge>
                    </td>

                    <td className="px-3.5 py-2.5">
                      <Badge variant="outline" className="text-[10px] gap-1 font-mono">
                        <Users className="size-2.5" />
                        {org.memberCount ?? 0} membros
                      </Badge>
                    </td>

                    <td className="px-3.5 py-2.5 text-muted-foreground font-mono text-[11px]">
                      {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
                    </td>

                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedOrg(org)}
                        className="h-7 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <Users className="size-3.5" />
                        <span>Gerenciar Membros</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Criar Organização */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Nova Organização</DialogTitle>
            <DialogDescription>
              Organizações fornecem isolamento nativo de dados entre diferentes empresas ou equipes na sua aplicação.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateOrg} className="space-y-3.5 py-2">
            <div className="space-y-1">
              <label htmlFor="create-org-name" className="text-xs font-semibold text-foreground">Nome da Organização</label>
              <input
                id="create-org-name"
                type="text"
                value={orgName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex: Acme Corp"
                required
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-org-slug" className="text-xs font-semibold text-foreground">Slug Identificador</label>
              <input
                id="create-org-slug"
                type="text"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="acme-corp"
                required
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createOrgMutation.isPending}>
                {createOrgMutation.isPending ? 'Criando...' : 'Criar Organização'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Gerenciar Membros da Organização */}
      <Dialog open={Boolean(selectedOrg)} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              <DialogTitle>Membros de {selectedOrg?.name}</DialogTitle>
            </div>
            <DialogDescription>
              Gerencie quem possui acesso aos recursos desta organização (<code>{selectedOrg?.slug}</code>).
            </DialogDescription>
          </DialogHeader>

          {/* Adicionar Membro Form */}
          <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 p-3 rounded-lg bg-muted/30 border border-border/70">
            <div className="flex-1 space-y-1">
              <label htmlFor="org-select-user" className="text-[11px] font-medium text-muted-foreground">Selecionar Usuário</label>
              <select
                id="org-select-user"
                value={newMemberUserId}
                onChange={(e) => setNewMemberUserId(e.target.value)}
                className="w-full h-7.5 rounded-md bg-muted/60 border border-border/70 px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Escolha um usuário --</option>
                {allUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-28 space-y-1">
              <label htmlFor="org-select-role" className="text-[11px] font-medium text-muted-foreground">Papel</label>
              <select
                id="org-select-role"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as any)}
                className="w-full h-7.5 rounded-md bg-muted/60 border border-border/70 px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="member">Membro</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={addMemberMutation.isPending}
              className="h-7.5 text-xs px-3 gap-1 cursor-pointer bg-primary text-primary-foreground"
            >
              <UserPlus className="size-3.5" />
              <span>Adicionar</span>
            </Button>
          </form>

          {/* Lista de Membros */}
          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
            {loadingMembers ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Carregando membros...
              </div>
            ) : members.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhum membro vinculado a esta organização ainda. Adicione um acima!
              </div>
            ) : (
              members.map((m: any) => (
                <div
                  key={m.memberId}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-7 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                      {m.userName ? m.userName.slice(0, 2).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{m.userName || 'Sem nome'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{m.userEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {m.role || 'member'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(m.userId)}
                      className="size-6 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Remover membro da organização"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSelectedOrg(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
