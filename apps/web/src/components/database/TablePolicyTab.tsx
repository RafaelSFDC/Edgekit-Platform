import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Globe,
  UserCheck,
  Building2,
  Sliders,
  Save,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { TablePolicy } from '../../types';

interface TablePolicyTabProps {
  tableName: string;
  initialPolicy?: Partial<TablePolicy>;
  isSystemTable: boolean;
  onSavePolicy: (policy: Partial<TablePolicy>) => Promise<void>;
}

type PolicyRule = 'public' | 'authenticated' | 'owner' | 'org_member' | 'admin' | 'disabled';

export const TablePolicyTab: React.FC<TablePolicyTabProps> = ({
  tableName,
  initialPolicy,
  isSystemTable,
  onSavePolicy,
}) => {
  const [rlsEnabled, setRlsEnabled] = useState(true);
  const [selectRule, setSelectRule] = useState<PolicyRule>('public');
  const [insertRule, setInsertRule] = useState<PolicyRule>('authenticated');
  const [updateRule, setUpdateRule] = useState<PolicyRule>('owner');
  const [deleteRule, setDeleteRule] = useState<PolicyRule>('owner');
  const [ownerColumn, setOwnerColumn] = useState('user_id');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialPolicy) {
      setRlsEnabled(initialPolicy.rlsEnabled ?? true);
      setSelectRule((initialPolicy.selectRule as PolicyRule) || 'public');
      setInsertRule((initialPolicy.insertRule as PolicyRule) || 'authenticated');
      setUpdateRule((initialPolicy.updateRule as PolicyRule) || 'owner');
      setDeleteRule((initialPolicy.deleteRule as PolicyRule) || 'owner');
      setOwnerColumn(initialPolicy.ownerColumn || 'user_id');
    }
  }, [initialPolicy, tableName]);

  const applyPreset = (preset: 'public_read_owner_write' | 'owner_only' | 'org_member' | 'admin_only' | 'fully_public') => {
    if (preset === 'public_read_owner_write') {
      setRlsEnabled(true);
      setSelectRule('public');
      setInsertRule('authenticated');
      setUpdateRule('owner');
      setDeleteRule('owner');
      toast.success('Preset aplicado: Leitura Pública, Escrita pelo Dono');
    } else if (preset === 'owner_only') {
      setRlsEnabled(true);
      setSelectRule('owner');
      setInsertRule('authenticated');
      setUpdateRule('owner');
      setDeleteRule('owner');
      toast.success('Preset aplicado: Privado (Apenas Dono do Registro)');
    } else if (preset === 'org_member') {
      setRlsEnabled(true);
      setSelectRule('org_member');
      setInsertRule('org_member');
      setUpdateRule('org_member');
      setDeleteRule('org_member');
      toast.success('Preset aplicado: Compartilhado com Membros da Organização');
    } else if (preset === 'admin_only') {
      setRlsEnabled(true);
      setSelectRule('admin');
      setInsertRule('admin');
      setUpdateRule('admin');
      setDeleteRule('admin');
      toast.success('Preset aplicado: Restrito a Administradores da Plataforma');
    } else if (preset === 'fully_public') {
      setRlsEnabled(false);
      setSelectRule('public');
      setInsertRule('public');
      setUpdateRule('public');
      setDeleteRule('public');
      toast.success('Preset aplicado: Totalmente Público (Sem Restrições)');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSavePolicy({
        tableName,
        rlsEnabled,
        selectRule,
        insertRule,
        updateRule,
        deleteRule,
        ownerColumn: ownerColumn.trim() || 'user_id',
      });
      toast.success(`Políticas de segurança para "${tableName}" atualizadas com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao salvar políticas de segurança.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isSystemTable) {
    return (
      <div className="p-8 text-center bg-card/40 border border-border/70 rounded-xl">
        <Shield className="size-8 mx-auto text-muted-foreground/60 mb-3" />
        <h4 className="text-sm font-semibold text-foreground">Tabela de Sistema Protegida</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Tabelas de sistema e da plataforma possuem regras de isolamento embutidas no motor de autorização e não podem ter suas políticas alteradas manualmente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Presets Header Card */}
      <div className="bg-card/40 border border-border/70 rounded-xl p-4.5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sliders className="size-4 text-primary" />
            <span>Presets Rápidos de Segurança</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure políticas com um clique baseadas no modelo de acesso desejado.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset('public_read_owner_write')}
            className="flex flex-col items-start p-3 rounded-lg border border-border/70 bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground group-hover:text-primary">
              <Globe className="size-3.5 text-blue-500" />
              <span>Público Leitura / Dono Escrita</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
              Qualquer um consulta; apenas o criador do registro edita e remove.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('owner_only')}
            className="flex flex-col items-start p-3 rounded-lg border border-border/70 bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground group-hover:text-primary">
              <UserCheck className="size-3.5 text-emerald-500" />
              <span>Privado (Dono Apenas)</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
              Apenas o usuário autenticado que criou a linha tem acesso total a ela.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('org_member')}
            className="flex flex-col items-start p-3 rounded-lg border border-border/70 bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground group-hover:text-primary">
              <Building2 className="size-3.5 text-purple-500" />
              <span>Organização (Membros)</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
              Acessível para qualquer membro ativo da mesma organização.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('admin_only')}
            className="flex flex-col items-start p-3 rounded-lg border border-border/70 bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground group-hover:text-primary">
              <Shield className="size-3.5 text-amber-500" />
              <span>Apenas Administradores</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
              Bloqueia acesso via chave anônima/usuário final. Somente chaves de serviço ou admins.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('fully_public')}
            className="flex flex-col items-start p-3 rounded-lg border border-border/70 bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground group-hover:text-primary">
              <Lock className="size-3.5 text-rose-500" />
              <span>Totalmente Aberto</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
              Desativa RLS para leitura e escrita. Qualquer requisição pode ler e alterar.
            </p>
          </button>
        </div>
      </div>

      {/* Detailed Rules Form */}
      <div className="bg-card/40 border border-border/70 rounded-xl p-4.5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Regras por Operação</h4>
            <p className="text-xs text-muted-foreground">
              Personalize individualmente o nível de acesso para cada operação CRUD.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Estado do RLS:</span>
            <Badge
              variant={rlsEnabled ? 'default' : 'secondary'}
              className="text-xs cursor-pointer select-none"
              onClick={() => setRlsEnabled(!rlsEnabled)}
            >
              {rlsEnabled ? 'Ativo (Restrições Ativas)' : 'Desativado (Público)'}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SELECT */}
          <div className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-2">
            <label htmlFor="policy-select-rule" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>SELECT (Leitura / Consultas)</span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase">GET</span>
            </label>
            <select
              id="policy-select-rule"
              value={selectRule}
              onChange={(e) => setSelectRule(e.target.value as PolicyRule)}
              className="w-full h-8 text-xs rounded-md bg-muted/50 border border-border/70 px-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
            >
              <option value="public">Público (Qualquer visitante)</option>
              <option value="authenticated">Autenticado (Qualquer usuário logado)</option>
              <option value="owner">Dono (Apenas o autor do registro)</option>
              <option value="org_member">Membro da Organização (Better Auth Org)</option>
              <option value="admin">Administrador (Service Role / Admin)</option>
              <option value="disabled">Desabilitado (Ninguém pode ler via API)</option>
            </select>
          </div>

          {/* INSERT */}
          <div className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-2">
            <label htmlFor="policy-insert-rule" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>INSERT (Criação de novos registros)</span>
              <span className="font-mono text-[10px] text-emerald-500 uppercase">POST</span>
            </label>
            <select
              id="policy-insert-rule"
              value={insertRule}
              onChange={(e) => setInsertRule(e.target.value as PolicyRule)}
              className="w-full h-8 text-xs rounded-md bg-muted/50 border border-border/70 px-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
            >
              <option value="public">Público (Qualquer visitante)</option>
              <option value="authenticated">Autenticado (Qualquer usuário logado)</option>
              <option value="org_member">Membro da Organização (Better Auth Org)</option>
              <option value="admin">Administrador (Service Role / Admin)</option>
              <option value="disabled">Desabilitado (Criação bloqueada via API)</option>
            </select>
          </div>

          {/* UPDATE */}
          <div className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-2">
            <label htmlFor="policy-update-rule" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>UPDATE (Modificação de registros)</span>
              <span className="font-mono text-[10px] text-amber-500 uppercase">PATCH</span>
            </label>
            <select
              id="policy-update-rule"
              value={updateRule}
              onChange={(e) => setUpdateRule(e.target.value as PolicyRule)}
              className="w-full h-8 text-xs rounded-md bg-muted/50 border border-border/70 px-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
            >
              <option value="public">Público (Qualquer visitante)</option>
              <option value="authenticated">Autenticado (Qualquer usuário logado)</option>
              <option value="owner">Dono (Apenas o autor do registro)</option>
              <option value="org_member">Membro da Organização (Better Auth Org)</option>
              <option value="admin">Administrador (Service Role / Admin)</option>
              <option value="disabled">Desabilitado (Atualização bloqueada)</option>
            </select>
          </div>

          {/* DELETE */}
          <div className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-2">
            <label htmlFor="policy-delete-rule" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>DELETE (Remoção de registros)</span>
              <span className="font-mono text-[10px] text-rose-500 uppercase">DELETE</span>
            </label>
            <select
              id="policy-delete-rule"
              value={deleteRule}
              onChange={(e) => setDeleteRule(e.target.value as PolicyRule)}
              className="w-full h-8 text-xs rounded-md bg-muted/50 border border-border/70 px-2 text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
            >
              <option value="public">Público (Qualquer visitante)</option>
              <option value="authenticated">Autenticado (Qualquer usuário logado)</option>
              <option value="owner">Dono (Apenas o autor do registro)</option>
              <option value="org_member">Membro da Organização (Better Auth Org)</option>
              <option value="admin">Administrador (Service Role / Admin)</option>
              <option value="disabled">Desabilitado (Remoção bloqueada)</option>
            </select>
          </div>
        </div>

        {/* Owner Column Configuration */}
        <div className="pt-3 border-t border-border/60">
          <label htmlFor="policy-owner-column" className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
            <span>Coluna Identificadora do Dono (Owner Column)</span>
            <span title="Nome da coluna na tabela que armazena o user_id do proprietário.">
              <HelpCircle className="size-3 text-muted-foreground" />
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              id="policy-owner-column"
              type="text"
              value={ownerColumn}
              onChange={(e) => setOwnerColumn(e.target.value)}
              placeholder="user_id"
              className="max-w-xs h-8 text-xs rounded-md bg-muted/50 border border-border/70 px-2.5 font-mono text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
            />
            <span className="text-[11px] text-muted-foreground">
              Padrão recomendado: <code>user_id</code>
            </span>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="h-8.5 px-4 text-xs gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
          >
            <Save className="size-3.5" />
            <span>{isSaving ? 'Salvando...' : 'Salvar Políticas'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
