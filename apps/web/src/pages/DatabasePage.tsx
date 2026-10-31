import React, { useState, useMemo } from 'react';
import {
  Table,
  Play,
  Trash2,
  RefreshCw,
  Plus,
  Terminal,
  Database as DbIcon,
  Shield,
  Pencil,
  Search,
  Code2,
  Lock,
  Globe,
  Copy,
  Check,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import {
  useTablesQuery,
  useTableRowsQuery,
  useDeleteTableRowMutation,
  useUpdateTableRowMutation,
  useTablePolicyQuery,
  useUpdateTablePolicyMutation,
  useRunSqlMutation,
  useInsertTableRowMutation,
  useCreateTableMutation,
  useDropTableMutation,
} from '../hooks/api/use-database';
import { usePlatformKeysQuery } from '../hooks/api/use-auth';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
import type { TablePolicy } from '../types';

interface ColumnDef {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
}

const SYSTEM_TABLES = new Set([
  'users',
  'sessions',
  'accounts',
  'verifications',
  'api_keys',
  'storage_files',
  'audit_logs',
  'webhooks',
  'app_settings',
  'table_policies',
  '__honobase_migrations',
  '__d1_migrations',
  'drizzle_migrations',
  'sqlite_master',
  'sqlite_sequence',
]);

export const DatabasePage: React.FC = () => {
  const { t } = useI18n();
  const [activeMainTab, setActiveMainTab] = useState<'explorer' | 'sql'>('explorer');
  const [tableSubTab, setTableSubTab] = useState<'data' | 'rls' | 'api'>('data');
  const [selectedTable, setSelectedTable] = useState<string>('');

  // Queries
  const { data: tables = [], refetch: refetchTables, isLoading: loadingTables } = useTablesQuery();
  const currentTable = selectedTable || (tables.length > 0 ? tables[0].name : '');
  const { data: rows = [], refetch: refetchRows, isLoading: loadingRows } = useTableRowsQuery(currentTable);
  const { data: platformKeys = {} } = usePlatformKeysQuery();

  // Mutations
  const deleteRowMutation = useDeleteTableRowMutation();
  const updateRowMutation = useUpdateTableRowMutation();
  const runSqlMutation = useRunSqlMutation();
  const insertRowMutation = useInsertTableRowMutation();
  const createTableMutation = useCreateTableMutation();
  const dropTableMutation = useDropTableMutation();

  const { data: rawPolicy, refetch: refetchPolicy } = useTablePolicyQuery(currentTable);
  const updatePolicyMutation = useUpdateTablePolicyMutation();

  // Local RLS Form State
  const [localPolicy, setLocalPolicy] = useState<Partial<TablePolicy>>({});
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [activeApiSnippet, setActiveApiSnippet] = useState<'get' | 'post' | 'patch' | 'delete' | 'realtime' | 'auth'>('get');

  // Atualiza estado local de política quando carrega a política do servidor
  React.useEffect(() => {
    if (rawPolicy) {
      setLocalPolicy({
        rlsEnabled: rawPolicy.rlsEnabled ?? true,
        selectRule: (rawPolicy.selectRule || rawPolicy.readLevel || 'public') as any,
        insertRule: (rawPolicy.insertRule || rawPolicy.writeLevel || 'authenticated') as any,
        updateRule: (rawPolicy.updateRule || rawPolicy.writeLevel || 'owner') as any,
        deleteRule: (rawPolicy.deleteRule || rawPolicy.writeLevel || 'owner') as any,
        ownerColumn: rawPolicy.ownerColumn || 'user_id',
      });
    }
  }, [rawPolicy, currentTable]);

  // SQL Runner state
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM users LIMIT 10;');
  const [sqlResults, setSqlResults] = useState<any>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // Dialogs
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newRowJson, setNewRowJson] = useState('{\n  "name": "Novo Item",\n  "active": true\n}');

  // Edit Row State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRowJson, setEditRowJson] = useState('{}');
  const [searchTerm, setSearchTerm] = useState('');

  // Create Table State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableColumns, setNewTableColumns] = useState<ColumnDef[]>([
    { name: 'id', type: 'TEXT', primaryKey: true, notNull: true },
    { name: 'title', type: 'TEXT', primaryKey: false, notNull: true },
    { name: 'user_id', type: 'TEXT', primaryKey: false, notNull: false },
  ]);

  // Drop Table State
  const [droppingTable, setDroppingTable] = useState<string | null>(null);

  const isCurrentSystemTable = SYSTEM_TABLES.has(currentTable.toLowerCase());

  const handleRunSql = async () => {
    setSqlError(null);
    setSqlResults(null);
    try {
      const res = await runSqlMutation.mutateAsync(sqlQuery);
      if (res.success) {
        setSqlResults(res);
        toast.success(t.common.success);
      } else {
        setSqlError(res.error?.message || t.common.error);
        toast.error(res.error?.message || t.common.error);
      }
    } catch (err: any) {
      setSqlError(err.message || t.common.error);
      toast.error(err.message || t.common.error);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId || !currentTable) return;
    try {
      await deleteRowMutation.mutateAsync({ table: currentTable, id: deletingId });
      toast.success(t.common.success);
      setDeletingId(null);
    } catch (err: any) {
      toast.error(err.message || t.common.error);
    }
  };

  const handleInsertRow = async () => {
    try {
      const parsed = JSON.parse(newRowJson);
      await insertRowMutation.mutateAsync({ table: currentTable, record: parsed });
      toast.success(t.common.success);
      setIsAddOpen(false);
      setNewRowJson('{\n  "name": "Novo Item",\n  "active": true\n}');
    } catch (err: any) {
      toast.error(err.message || 'JSON inválido');
    }
  };

  const handleOpenEdit = (row: any) => {
    const id = row.id;
    if (!id) {
      toast.error('O registro não possui uma coluna "id" identificadora.');
      return;
    }
    setEditingId(String(id));
    const clone = { ...row };
    delete clone.id;
    setEditRowJson(JSON.stringify(clone, null, 2));
    setIsEditOpen(true);
  };

  const handleUpdateRow = async () => {
    if (!editingId || !currentTable) return;
    try {
      const parsed = JSON.parse(editRowJson);
      await updateRowMutation.mutateAsync({
        table: currentTable,
        id: editingId,
        record: parsed,
      });
      toast.success(t.common.success);
      setIsEditOpen(false);
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar registro.');
    }
  };

  const handleAddColumnDef = () => {
    setNewTableColumns([
      ...newTableColumns,
      { name: `col_${newTableColumns.length + 1}`, type: 'TEXT', primaryKey: false, notNull: false },
    ]);
  };

  const handleRemoveColumnDef = (idx: number) => {
    setNewTableColumns(newTableColumns.filter((_, i) => i !== idx));
  };

  const handleColumnChange = (idx: number, field: keyof ColumnDef, val: any) => {
    const next = [...newTableColumns];
    next[idx] = { ...next[idx], [field]: val };
    setNewTableColumns(next);
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      toast.error('Informe um nome válido para a tabela.');
      return;
    }

    const validCols = newTableColumns.filter((c) => c.name.trim().length > 0);
    if (validCols.length === 0) {
      toast.error('Adicione ao menos uma coluna.');
      return;
    }

    try {
      await createTableMutation.mutateAsync({
        name: cleanName,
        columns: validCols,
      });
      toast.success(`Tabela "${cleanName}" criada com sucesso no Cloudflare D1!`);
      setSelectedTable(cleanName);
      setIsCreateOpen(false);
      setNewTableName('');
      setNewTableColumns([
        { name: 'id', type: 'TEXT', primaryKey: true, notNull: true },
        { name: 'title', type: 'TEXT', primaryKey: false, notNull: true },
        { name: 'user_id', type: 'TEXT', primaryKey: false, notNull: false },
      ]);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar tabela.');
    }
  };

  const handleConfirmDropTable = async () => {
    if (!droppingTable) return;
    try {
      await dropTableMutation.mutateAsync(droppingTable);
      toast.success(`Tabela "${droppingTable}" excluída com sucesso.`);
      setDroppingTable(null);
      if (selectedTable === droppingTable) {
        setSelectedTable('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir tabela.');
    }
  };

  // Presets de Políticas estilo Supabase
  const applyPreset = (preset: 'public_read_owner_write' | 'owner_only' | 'admin_only' | 'fully_public') => {
    if (preset === 'public_read_owner_write') {
      setLocalPolicy({
        ...localPolicy,
        rlsEnabled: true,
        selectRule: 'public',
        insertRule: 'authenticated',
        updateRule: 'owner',
        deleteRule: 'owner',
      });
      toast.success('Preset aplicado: Público para leitura, Dono para escrita.');
    } else if (preset === 'owner_only') {
      setLocalPolicy({
        ...localPolicy,
        rlsEnabled: true,
        selectRule: 'owner',
        insertRule: 'authenticated',
        updateRule: 'owner',
        deleteRule: 'owner',
      });
      toast.success('Preset aplicado: Privado (Apenas o Dono acessa).');
    } else if (preset === 'admin_only') {
      setLocalPolicy({
        ...localPolicy,
        rlsEnabled: true,
        selectRule: 'admin',
        insertRule: 'admin',
        updateRule: 'admin',
        deleteRule: 'admin',
      });
      toast.success('Preset aplicado: Restrito a Administradores.');
    } else if (preset === 'fully_public') {
      setLocalPolicy({
        ...localPolicy,
        rlsEnabled: false,
        selectRule: 'public',
        insertRule: 'public',
        updateRule: 'public',
        deleteRule: 'public',
      });
      toast.success('Preset aplicado: Totalmente Aberto (Sem restrições).');
    }
  };

  const handleSavePolicy = async () => {
    if (!currentTable) return;
    try {
      await updatePolicyMutation.mutateAsync({
        table: currentTable,
        policy: localPolicy,
      });
      toast.success(`Políticas de RLS para "${currentTable}" salvas com sucesso!`);
      refetchPolicy();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao salvar políticas.');
    }
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(id);
    toast.success('Snippet copiado para a área de transferência!');
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [rows, searchTerm]);

  // Snippets de Integração Frontend
  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://seu-worker.workers.dev';
  const anonKey = platformKeys.anonKey || 'hb_anon_default';

  const snippets = useMemo(() => {
    return {
      get: `// 1. Consultar registros com filtros e ordenação
const res = await fetch('${originUrl}/api/v1/db/${currentTable}?limit=10&order=created_at.desc', {
  headers: {
    'apikey': '${anonKey}',
    // Se a tabela exigir Dono (RLS), passe o token do usuário logado:
    // 'Authorization': 'Bearer ' + userSessionToken,
  }
});
const { data, meta } = await res.json();
console.log('Registros encontrados:', data);`,

      post: `// 2. Inserir novo registro (O RLS preenche o user_id automaticamente)
const res = await fetch('${originUrl}/api/v1/db/${currentTable}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': '${anonKey}',
    'Authorization': 'Bearer ' + userSessionToken, // Token obtido no login
  },
  body: JSON.stringify({
    title: 'Meu Novo Item',
    // user_id é injetado pelo servidor com base no token
  })
});
const { data } = await res.json();
console.log('Registro criado:', data);`,

      patch: `// 3. Atualizar registro existente (Somente o Dono pode editar se RLS estiver ativo)
const res = await fetch('${originUrl}/api/v1/db/${currentTable}/ID_DO_REGISTRO', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'apikey': '${anonKey}',
    'Authorization': 'Bearer ' + userSessionToken,
  },
  body: JSON.stringify({
    title: 'Título Atualizado'
  })
});
const { data } = await res.json();
console.log('Registro atualizado:', data);`,

      delete: `// 4. Excluir registro (Somente o Dono pode deletar se RLS estiver ativo)
const res = await fetch('${originUrl}/api/v1/db/${currentTable}/ID_DO_REGISTRO', {
  method: 'DELETE',
  headers: {
    'apikey': '${anonKey}',
    'Authorization': 'Bearer ' + userSessionToken,
  }
});
const result = await res.json();
console.log('Registro removido com sucesso!');`,

      realtime: `// 5. Escutar alterações em tempo real via WebSocket nativo do navegador
const wsUrl = '${originUrl.replace('http', 'ws')}/api/v1/realtime/db:${currentTable}/ws?apikey=${anonKey}';
const socket = new WebSocket(wsUrl);

socket.onopen = () => {
  console.log('⚡ Conectado ao canal em tempo real de ${currentTable}');
};

socket.onmessage = (event) => {
  const { event: action, payload } = JSON.parse(event.data);
  // action pode ser 'INSERT', 'UPDATE' ou 'DELETE'
  console.log('Evento CDC recebido:', action, payload);
};`,

      auth: `// 6. Autenticação no Frontend (Login e Registro via Better-Auth)
// Cadastro de novo usuário:
const signUpRes = await fetch('${originUrl}/api/v1/auth/sign-up/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Nome do Usuário',
    email: 'user@exemplo.com',
    password: 'minha-senha-segura-123'
  })
});
const authData = await signUpRes.json();
// Salve o token retornado para usar em 'Authorization: Bearer <token>'
const userSessionToken = authData.token || authData.session?.token;`,
    };
  }, [originUrl, currentTable, anonKey]);

  return (
    <PageLayout>
      <PageHeader
        title={t.database.title}
        description={t.database.subtitle}
        actions={
          <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border">
            <Button
              variant={activeMainTab === 'explorer' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveMainTab('explorer')}
              className="text-xs h-7 cursor-pointer"
            >
              <Table className="size-3.5 mr-1.5" />
              {t.database.dataExplorer}
            </Button>
            <Button
              variant={activeMainTab === 'sql' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveMainTab('sql')}
              className="text-xs h-7 cursor-pointer"
            >
              <Terminal className="size-3.5 mr-1.5" />
              {t.database.sqlRunner}
            </Button>
          </div>
        }
      />

      {activeMainTab === 'explorer' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Barra Lateral de Tabelas */}
          <Card className="md:col-span-1 h-[calc(100vh-220px)] flex flex-col">
            <CardHeader className="p-3 border-b border-border flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <DbIcon className="size-3.5" />
                {t.database.tables} ({tables.length})
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] gap-1 cursor-pointer"
                  onClick={() => setIsCreateOpen(true)}
                  title="Criar nova tabela no D1"
                >
                  <Plus className="size-3" />
                  <span>Nova</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 cursor-pointer"
                  onClick={() => refetchTables()}
                  title={t.common.refresh}
                >
                  <RefreshCw className="size-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2 flex-1 overflow-y-auto space-y-1">
              {loadingTables ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  {t.common.loading}
                </div>
              ) : tables.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  {t.database.emptyData}
                </div>
              ) : (
                tables.map((tItem: any) => {
                  const isSys = SYSTEM_TABLES.has(tItem.name.toLowerCase());
                  const isSelected = tItem.name === currentTable;
                  return (
                    <button
                      key={tItem.name}
                      onClick={() => {
                        setSelectedTable(tItem.name);
                        setTableSubTab('data');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer text-left ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isSys ? (
                          <Shield className="size-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Table className="size-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{tItem.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0 font-mono">
                        {tItem.rowCount ?? 0}
                      </Badge>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Painel Principal com Sub-abas da Tabela */}
          <Card className="md:col-span-3 h-[calc(100vh-220px)] flex flex-col">
            <CardHeader className="p-3 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 space-y-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {currentTable || 'Selecione uma tabela'}
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  {rows.length} {t.database.rowsCount}
                </Badge>
                {isCurrentSystemTable ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                    <Shield className="size-2.5" />
                    Protegida (Admin)
                  </Badge>
                ) : (
                  <Badge
                    variant={localPolicy.rlsEnabled ? 'default' : 'secondary'}
                    className="text-[10px] gap-1"
                  >
                    <Lock className="size-2.5" />
                    {localPolicy.rlsEnabled ? 'RLS Ativo' : 'RLS Desativado'}
                  </Badge>
                )}
              </div>

              {/* Seletor de Sub-abas da Tabela */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
                <Button
                  variant={tableSubTab === 'data' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTableSubTab('data')}
                  className="h-6 px-2 text-xs cursor-pointer gap-1"
                >
                  <Table className="size-3" />
                  <span>Dados</span>
                </Button>
                {!isCurrentSystemTable && (
                  <Button
                    variant={tableSubTab === 'rls' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTableSubTab('rls')}
                    className="h-6 px-2 text-xs cursor-pointer gap-1"
                  >
                    <Shield className="size-3" />
                    <span>Políticas & RLS</span>
                  </Button>
                )}
                <Button
                  variant={tableSubTab === 'api' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTableSubTab('api')}
                  className="h-6 px-2 text-xs cursor-pointer gap-1"
                >
                  <Code2 className="size-3" />
                  <span>Integração & API</span>
                </Button>
              </div>
            </CardHeader>

            {/* CONTEÚDO DA ABA: DADOS */}
            {tableSubTab === 'data' && (
              <>
                <div className="p-2 border-b border-border flex items-center justify-between gap-2 bg-muted/20">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2 top-2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filtrar dados na tabela..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-7 pr-2 py-1 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-48 sm:w-64"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {!isCurrentSystemTable && currentTable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDroppingTable(currentTable)}
                        className="text-destructive hover:bg-destructive/10 text-xs h-7 px-2 cursor-pointer gap-1"
                        title="Excluir esta tabela"
                      >
                        <Trash2 className="size-3" />
                        <span className="hidden sm:inline">Excluir Tabela</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddOpen(true)}
                      className="gap-1.5 text-xs h-7 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      <span>Novo Registro</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 cursor-pointer"
                      onClick={() => refetchRows()}
                      title={t.common.refresh}
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-0 flex-1 overflow-auto">
                  {loadingRows ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      {t.common.loading}
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">
                      {t.database.emptyData}
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-muted/70 sticky top-0 z-10 border-b border-border">
                        <tr>
                          {columns.map((c) => (
                            <th key={c} className="p-2 font-mono font-medium text-foreground whitespace-nowrap">
                              {c}
                            </th>
                          ))}
                          <th className="p-2 text-right font-medium text-foreground w-16">
                            {t.common.actions}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredRows.map((row: any, i: number) => {
                          const rowId = row.id || `row_${i}`;
                          return (
                            <tr key={rowId} className="hover:bg-muted/30 transition-colors">
                              {columns.map((c) => {
                                const val = row[c];
                                const displayVal =
                                  val === null
                                    ? 'NULL'
                                    : typeof val === 'object'
                                      ? JSON.stringify(val)
                                      : String(val);

                                return (
                                  <td
                                    key={c}
                                    className={`p-2 font-mono truncate max-w-[200px] ${
                                      val === null ? 'text-muted-foreground italic' : 'text-foreground'
                                    }`}
                                    title={displayVal}
                                  >
                                    {displayVal}
                                  </td>
                                );
                              })}
                              <td className="p-2 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 cursor-pointer text-muted-foreground hover:text-foreground"
                                    onClick={() => handleOpenEdit(row)}
                                    title="Editar linha"
                                    aria-label="Editar linha"
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 cursor-pointer text-destructive/80 hover:text-destructive"
                                    onClick={() => setDeletingId(String(row.id))}
                                    title={t.common.delete}
                                    aria-label={t.common.delete}
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </>
            )}

            {/* CONTEÚDO DA ABA: POLÍTICAS & RLS (SUPABASE STYLE) */}
            {tableSubTab === 'rls' && (
              <CardContent className="p-4 flex-1 overflow-y-auto space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Shield className="size-4 text-emerald-500" />
                    Políticas de Acesso & RLS (Row-Level Security)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Defina quem pode ler, inserir, atualizar e deletar dados na tabela "{currentTable}".
                    Quando a regra é "Dono", o Edgekit garante que os usuários só acessem seus próprios registros.
                  </p>
                </div>

                {/* Presets de 1 Clique */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-amber-500" />
                    Presets Rápidos (Estilo Supabase)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => applyPreset('public_read_owner_write')}
                      className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-left transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Globe className="size-3 text-sky-500" />
                        <span>Público / Dono</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Qualquer visitante lê. Apenas o autor edita e deleta (Posts, Comentários).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('owner_only')}
                      className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-left transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Lock className="size-3 text-emerald-500" />
                        <span>Totalmente Privado</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Apenas o Dono autenticado pode ler e gravar (Tarefas, Notas, Dados Pessoais).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('admin_only')}
                      className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-left transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Shield className="size-3 text-amber-500" />
                        <span>Apenas Admin</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Restrito exclusivamente à chave de serviço ou administradores da plataforma.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('fully_public')}
                      className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-left transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Sliders className="size-3 text-purple-500" />
                        <span>Totalmente Aberto</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Leitura e escrita abertas com a chave pública (Catálogos, formulários abertos).
                      </p>
                    </button>
                  </div>
                </div>

                {/* Configuração Granular por Operação */}
                <div className="space-y-3 bg-muted/30 p-3.5 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Controles por Operação CRUD</span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={localPolicy.rlsEnabled ?? true}
                        onChange={(e) => setLocalPolicy({ ...localPolicy, rlsEnabled: e.target.checked })}
                        className="rounded border-border text-primary focus:ring-primary size-3.5"
                      />
                      <span className="font-medium text-foreground">Habilitar RLS nesta tabela</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label htmlFor="policy-select-rule" className="block text-[11px] text-muted-foreground mb-1">
                        SELECT (Leitura de Dados)
                      </label>
                      <select
                        id="policy-select-rule"
                        value={localPolicy.selectRule || 'public'}
                        onChange={(e) => setLocalPolicy({ ...localPolicy, selectRule: e.target.value as any })}
                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground cursor-pointer"
                      >
                        <option value="public">Público (Qualquer visitante com anonKey)</option>
                        <option value="authenticated">Usuários Autenticados</option>
                        <option value="owner">Apenas o Dono (RLS filtrado)</option>
                        <option value="admin">Apenas Administradores</option>
                        <option value="disabled">Desabilitado (Bloqueado)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="policy-insert-rule" className="block text-[11px] text-muted-foreground mb-1">
                        INSERT (Criação de Registros)
                      </label>
                      <select
                        id="policy-insert-rule"
                        value={localPolicy.insertRule || 'authenticated'}
                        onChange={(e) => setLocalPolicy({ ...localPolicy, insertRule: e.target.value as any })}
                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground cursor-pointer"
                      >
                        <option value="authenticated">Usuários Autenticados</option>
                        <option value="owner">Dono (Atribui userId automaticamente)</option>
                        <option value="public">Público (Qualquer um pode inserir)</option>
                        <option value="admin">Apenas Administradores</option>
                        <option value="disabled">Desabilitado (Bloqueado)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="policy-update-rule" className="block text-[11px] text-muted-foreground mb-1">
                        UPDATE (Edição de Registros)
                      </label>
                      <select
                        id="policy-update-rule"
                        value={localPolicy.updateRule || 'owner'}
                        onChange={(e) => setLocalPolicy({ ...localPolicy, updateRule: e.target.value as any })}
                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground cursor-pointer"
                      >
                        <option value="owner">Apenas o Dono (RLS de segurança)</option>
                        <option value="authenticated">Qualquer Usuário Autenticado</option>
                        <option value="admin">Apenas Administradores</option>
                        <option value="disabled">Desabilitado (Bloqueado)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="policy-delete-rule" className="block text-[11px] text-muted-foreground mb-1">
                        DELETE (Exclusão de Registros)
                      </label>
                      <select
                        id="policy-delete-rule"
                        value={localPolicy.deleteRule || 'owner'}
                        onChange={(e) => setLocalPolicy({ ...localPolicy, deleteRule: e.target.value as any })}
                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground cursor-pointer"
                      >
                        <option value="owner">Apenas o Dono (RLS de segurança)</option>
                        <option value="admin">Apenas Administradores</option>
                        <option value="authenticated">Qualquer Usuário Autenticado</option>
                        <option value="disabled">Desabilitado (Bloqueado)</option>
                      </select>
                    </div>
                  </div>

                  {/* Coluna de Dono */}
                  <div className="pt-2">
                    <label htmlFor="policy-owner-column" className="block text-[11px] text-muted-foreground mb-1">
                      Coluna Identificadora do Dono (Owner Column)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="policy-owner-column"
                        type="text"
                        value={localPolicy.ownerColumn || 'user_id'}
                        onChange={(e) => setLocalPolicy({ ...localPolicy, ownerColumn: e.target.value })}
                        placeholder="ex: user_id ou author_id"
                        className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground w-64"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Coluna da tabela comparada com o ID do usuário na autenticação.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    onClick={handleSavePolicy}
                    disabled={updatePolicyMutation.isPending}
                    className="cursor-pointer gap-1.5 text-xs"
                  >
                    <Check className="size-3.5" />
                    <span>{updatePolicyMutation.isPending ? 'Salvando...' : 'Salvar Políticas de RLS'}</span>
                  </Button>
                </div>
              </CardContent>
            )}

            {/* CONTEÚDO DA ABA: INTEGRAÇÃO & API (ZERO SDK) */}
            {tableSubTab === 'api' && (
              <CardContent className="p-4 flex-1 overflow-y-auto space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Code2 className="size-4 text-primary" />
                    Integre no seu Frontend sem SDK (HTTP & WebSocket)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Copie e cole estes trechos em React, Next.js, Vue ou qualquer app. Não é necessário instalar nenhuma biblioteca.
                  </p>
                </div>

                {/* Seletor de Snippet */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'get', label: '1. Buscar (GET)' },
                    { id: 'post', label: '2. Criar (POST)' },
                    { id: 'patch', label: '3. Atualizar (PATCH)' },
                    { id: 'delete', label: '4. Deletar (DELETE)' },
                    { id: 'realtime', label: '5. Realtime (WebSocket)' },
                    { id: 'auth', label: '6. Auth (Login/Cadastro)' },
                  ].map((sn) => (
                    <Button
                      key={sn.id}
                      variant={activeApiSnippet === sn.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveApiSnippet(sn.id as any)}
                      className="text-xs h-7 cursor-pointer"
                    >
                      {sn.label}
                    </Button>
                  ))}
                </div>

                {/* Bloco de Código com Copiar */}
                <div className="relative bg-muted/60 border border-border rounded-xl p-3 font-mono text-xs">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/60">
                    <span className="text-[11px] text-muted-foreground">
                      JavaScript / TypeScript Nativo (fetch API)
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCode(snippets[activeApiSnippet], activeApiSnippet)}
                      className="h-6 px-2 text-xs gap-1 cursor-pointer"
                    >
                      {copiedSnippet === activeApiSnippet ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span className="text-emerald-500">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>Copiar Código</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="text-foreground overflow-x-auto whitespace-pre leading-relaxed text-[11px]">
                    {snippets[activeApiSnippet]}
                  </pre>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      ) : (
        /* SQL Runner */
        <div className="space-y-4">
          <Card>
            <CardHeader className="p-3 border-b border-border flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Terminal className="size-3.5" />
                SQL Query Console
              </span>
              <Button
                size="sm"
                onClick={handleRunSql}
                disabled={runSqlMutation.isPending}
                className="gap-1.5 text-xs h-7 cursor-pointer"
              >
                <Play className="size-3.5" />
                <span>{runSqlMutation.isPending ? t.common.loading : t.database.runSql}</span>
              </Button>
            </CardHeader>
            <CardContent className="p-3">
              <textarea
                rows={4}
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="Ex: SELECT * FROM users LIMIT 10;"
                className="w-full bg-muted/50 border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </CardContent>
          </Card>

          {sqlError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-mono">
              {sqlError}
            </div>
          )}

          {sqlResults && (
            <Card>
              <CardHeader className="p-3 border-b border-border">
                <CardTitle className="text-xs font-mono">
                  {sqlResults.rowCount ?? 0} {t.database.rowsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto max-h-[350px]">
                {sqlResults.rows && sqlResults.rows.length > 0 ? (
                  <table className="w-full text-xs text-left border-collapse font-mono">
                    <thead className="bg-muted/70 sticky top-0 border-b border-border">
                      <tr>
                        {Object.keys(sqlResults.rows[0]).map((col) => (
                          <th key={col} className="p-2 font-medium text-foreground">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {sqlResults.rows.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {Object.values(row).map((v: any, j: number) => (
                            <td key={j} className="p-2 text-foreground truncate max-w-[200px]">
                              {v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    Consulta executada sem retorno de linhas.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modal de Criação de Tabela */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base">Nova Tabela no Cloudflare D1</DialogTitle>
            <DialogDescription className="text-xs">
              Defina o nome da tabela e suas colunas iniciais. A chave primária "id" será criada automaticamente se não informada.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTable} className="space-y-4 py-2">
            <div>
              <label htmlFor="new-table-name" className="text-xs font-medium text-foreground block mb-1">
                Nome da Tabela
              </label>
              <input
                id="new-table-name"
                type="text"
                placeholder="ex: posts, clientes, pedidos"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary font-mono"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Colunas</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddColumnDef}
                  className="h-6 text-[11px] px-2 gap-1"
                >
                  <Plus className="size-3" />
                  <span>Adicionar Coluna</span>
                </Button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {newTableColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/40 p-2 rounded-md border border-border">
                    <input
                      type="text"
                      placeholder="Nome"
                      value={col.name}
                      onChange={(e) => handleColumnChange(idx, 'name', e.target.value)}
                      className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground flex-1 font-mono"
                      required
                    />
                    <select
                      value={col.type}
                      onChange={(e) => handleColumnChange(idx, 'type', e.target.value)}
                      className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono"
                    >
                      <option value="TEXT">TEXT</option>
                      <option value="INTEGER">INTEGER</option>
                      <option value="REAL">REAL</option>
                      <option value="BLOB">BLOB</option>
                      <option value="JSON">JSON</option>
                    </select>
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={col.primaryKey}
                        onChange={(e) => handleColumnChange(idx, 'primaryKey', e.target.checked)}
                        className="rounded border-border text-primary size-3"
                      />
                      <span>PK</span>
                    </label>
                    {newTableColumns.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveColumnDef(idx)}
                        className="size-6 text-destructive/80 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createTableMutation.isPending}
                className="cursor-pointer"
              >
                {createTableMutation.isPending ? t.common.loading : 'Criar Tabela'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Exclusão de Tabela */}
      <Dialog open={Boolean(droppingTable)} onOpenChange={() => setDroppingTable(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive">Excluir Tabela "{droppingTable}"?</DialogTitle>
            <DialogDescription className="text-xs">
              Aviso: todos os dados contidos nesta tabela serão permanentemente apagados do Cloudflare D1. Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDroppingTable(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDropTable}
              disabled={dropTableMutation.isPending}
            >
              {dropTableMutation.isPending ? t.common.loading : 'Excluir Tabela'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Exclusão de Registro */}
      <Dialog open={Boolean(deletingId)} onOpenChange={() => setDeletingId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">{t.database.deleteRowConfirm}</DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação removerá permanentemente a linha identificada com ID "{deletingId}" do Cloudflare D1.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleteRowMutation.isPending}
            >
              {deleteRowMutation.isPending ? t.common.loading : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Inserção de Registro */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base">Inserir Registro em "{currentTable}"</DialogTitle>
            <DialogDescription className="text-xs">
              Informe os campos do registro no formato JSON válido.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              rows={8}
              value={newRowJson}
              onChange={(e) => setNewRowJson(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setIsAddOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              onClick={handleInsertRow}
              disabled={insertRowMutation.isPending}
            >
              {insertRowMutation.isPending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição de Registro */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base">Editar Registro em "{currentTable}"</DialogTitle>
            <DialogDescription className="text-xs">
              Atualize os campos do registro no formato JSON válido.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              rows={8}
              value={editRowJson}
              onChange={(e) => setEditRowJson(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setIsEditOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              onClick={handleUpdateRow}
              disabled={updateRowMutation.isPending}
            >
              {updateRowMutation.isPending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
