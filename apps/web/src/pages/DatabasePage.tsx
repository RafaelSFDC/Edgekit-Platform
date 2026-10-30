import React, { useState } from 'react';
import {
  Table,
  Play,
  Trash2,
  RefreshCw,
  Plus,
  Terminal,
  Database as DbIcon,
  Shield,
  X,
  Layers,
  Pencil,
  Search,
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
  const [activeTab, setActiveTab] = useState<'data' | 'sql'>('data');
  const [selectedTable, setSelectedTable] = useState<string>('');

  // Queries
  const { data: tables = [], refetch: refetchTables, isLoading: loadingTables } = useTablesQuery();
  const currentTable = selectedTable || (tables.length > 0 ? tables[0].name : '');
  const { data: rows = [], refetch: refetchRows, isLoading: loadingRows } = useTableRowsQuery(currentTable);

  // Mutations
  const deleteRowMutation = useDeleteTableRowMutation();
  const updateRowMutation = useUpdateTableRowMutation();
  const runSqlMutation = useRunSqlMutation();
  const insertRowMutation = useInsertTableRowMutation();
  const createTableMutation = useCreateTableMutation();
  const dropTableMutation = useDropTableMutation();

  const { data: tablePolicy } = useTablePolicyQuery(currentTable);
  const updatePolicyMutation = useUpdateTablePolicyMutation();

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
    { name: 'name', type: 'TEXT', primaryKey: false, notNull: true },
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
    if (!currentTable) return;
    try {
      const parsed = JSON.parse(newRowJson);
      await insertRowMutation.mutateAsync({ table: currentTable, record: parsed });
      toast.success(t.common.success);
      setIsAddOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'JSON inválido');
    }
  };

  const handleUpdateRow = async () => {
    if (!currentTable || !editingId) return;
    try {
      const parsed = JSON.parse(editRowJson);
      const { id: _id, ...updates } = parsed;
      await updateRowMutation.mutateAsync({
        table: currentTable,
        id: editingId,
        record: updates,
      });
      toast.success('Registro atualizado com sucesso!');
      setIsEditOpen(false);
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message || 'JSON inválido ou erro ao atualizar registro.');
    }
  };

  const handleAddColumnDef = () => {
    setNewTableColumns((prev) => [
      ...prev,
      { name: '', type: 'TEXT', primaryKey: false, notNull: false },
    ]);
  };

  const handleRemoveColumnDef = (idx: number) => {
    setNewTableColumns((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateNewTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTableName.trim();
    if (!cleanName) {
      toast.error('Informe o nome da tabela.');
      return;
    }

    const validCols = newTableColumns.filter((c) => c.name.trim().length > 0);
    if (validCols.length === 0) {
      toast.error('Adicione ao menos uma coluna com nome válido.');
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
        { name: 'name', type: 'TEXT', primaryKey: false, notNull: true },
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

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <PageLayout>
      <PageHeader
        title={t.database.title}
        description={t.database.subtitle}
        actions={
          <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border">
            <Button
              variant={activeTab === 'data' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('data')}
              className="text-xs h-7 cursor-pointer"
            >
              <Table className="size-3.5 mr-1.5" />
              {t.database.dataExplorer}
            </Button>
            <Button
              variant={activeTab === 'sql' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('sql')}
              className="text-xs h-7 cursor-pointer"
            >
              <Terminal className="size-3.5 mr-1.5" />
              {t.database.sqlRunner}
            </Button>
          </div>
        }
      />

      {activeTab === 'data' ? (
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
              ) : (
                tables.map((tbl) => {
                  const isSys = SYSTEM_TABLES.has(tbl.name.toLowerCase());
                  return (
                    <button
                      key={tbl.name}
                      type="button"
                      onClick={() => setSelectedTable(tbl.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        currentTable === tbl.name
                          ? 'bg-primary/10 text-primary border border-primary/20 font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {isSys ? (
                          <Shield className="size-3 text-muted-foreground shrink-0" />
                        ) : (
                          <Layers className="size-3 text-orange-500 shrink-0" />
                        )}
                        <span>{tbl.name}</span>
                      </span>
                      <Badge
                        variant={isSys ? 'outline' : 'secondary'}
                        className={`text-[9px] py-0 px-1 ${
                          !isSys ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : ''
                        }`}
                      >
                        {isSys ? 'Sistema' : 'D1'}
                      </Badge>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Área de Dados da Tabela */}
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
                ) : currentTable ? (
                  <div className="flex items-center gap-1.5 text-xs bg-muted/40 p-1 rounded-md border border-border/60">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Acesso:</span>
                    <select
                      value={tablePolicy?.readLevel || 'public'}
                      onChange={async (e) => {
                        const newRead = e.target.value;
                        await updatePolicyMutation.mutateAsync({
                          table: currentTable,
                          policy: {
                            readLevel: newRead,
                            writeLevel: tablePolicy?.writeLevel || 'authenticated',
                          },
                        });
                        toast.success('Política de leitura atualizada!');
                      }}
                      className="bg-background text-[11px] font-mono border border-border rounded px-1.5 py-0.5 cursor-pointer text-foreground"
                    >
                      <option value="public">Leitura: Pública</option>
                      <option value="authenticated">Leitura: Autenticada</option>
                      <option value="admin">Leitura: Admin Only</option>
                    </select>
                    <select
                      value={tablePolicy?.writeLevel || 'authenticated'}
                      onChange={async (e) => {
                        const newWrite = e.target.value;
                        await updatePolicyMutation.mutateAsync({
                          table: currentTable,
                          policy: {
                            readLevel: tablePolicy?.readLevel || 'public',
                            writeLevel: newWrite,
                          },
                        });
                        toast.success('Política de escrita atualizada!');
                      }}
                      className="bg-background text-[11px] font-mono border border-border rounded px-1.5 py-0.5 cursor-pointer text-foreground"
                    >
                      <option value="public">Escrita: Pública</option>
                      <option value="authenticated">Escrita: Autenticada</option>
                      <option value="admin">Escrita: Admin Only</option>
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <div className="relative">
                  <Search className="size-3.5 absolute left-2 top-2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filtrar dados..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-7 pr-2 py-1 text-xs bg-muted/60 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-28 sm:w-36"
                  />
                </div>

                {!isCurrentSystemTable && currentTable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDroppingTable(currentTable)}
                    className="text-destructive hover:bg-destructive/10 text-xs h-7 px-2 cursor-pointer gap-1"
                    title="Excluir esta tabela"
                  >
                    <Trash2 className="size-3" />
                    <span className="hidden sm:inline">Excluir</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(true)}
                  className="gap-1.5 text-xs h-7 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Novo</span>
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
            </CardHeader>

            <CardContent className="p-0 flex-1 overflow-auto">
              {loadingRows ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {t.common.loading}
                </div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  {t.database.emptyData}
                </div>
              ) : (
                <table className="w-full text-left text-xs text-foreground">
                  <thead className="bg-muted/70 sticky top-0 border-b border-border select-none">
                    <tr>
                      {columns.map((col) => (
                        <th key={col} className="p-2.5 font-mono text-muted-foreground font-semibold">
                          {col}
                        </th>
                      ))}
                      <th className="p-2.5 w-20 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(searchTerm
                      ? rows.filter((r) =>
                          Object.values(r).some((val) =>
                            String(val ?? '').toLowerCase().includes(searchTerm.toLowerCase())
                          )
                        )
                      : rows
                    ).map((row, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                        {columns.map((col) => (
                          <td key={col} className="p-2.5 font-mono text-[11px] truncate max-w-xs">
                            {typeof row[col] === 'object' && row[col] !== null
                              ? JSON.stringify(row[col])
                              : String(row[col] ?? '')}
                          </td>
                        ))}
                        <td className="p-2.5 text-right">
                          {row.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
                                onClick={() => {
                                  setEditingId(String(row.id));
                                  setEditRowJson(JSON.stringify(row, null, 2));
                                  setIsEditOpen(true);
                                }}
                                title="Editar Registro"
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-destructive hover:bg-destructive/10 cursor-pointer"
                                onClick={() => setDeletingId(String(row.id))}
                                title={t.common.delete}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* SQL Runner Tab */
        <div className="space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Terminal className="size-4 text-orange-500" />
                Console SQL Interativo (D1 Runner)
              </CardTitle>
              <Button
                size="sm"
                onClick={handleRunSql}
                disabled={runSqlMutation.isPending}
                className="gap-1.5 text-xs h-8 cursor-pointer"
              >
                <Play className="size-3.5 fill-current" />
                {runSqlMutation.isPending ? t.common.loading : t.database.runSql}
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <textarea
                rows={5}
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="Escreva sua query SQL aqui (ex: SELECT * FROM users;)"
                className="w-full bg-muted/60 border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
              {sqlError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-mono">
                  {sqlError}
                </div>
              )}
            </CardContent>
          </Card>

          {sqlResults && (
            <Card>
              <CardHeader className="p-3 border-b border-border">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Resultado: {sqlResults.rowCount ?? 0} {t.database.rowsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto max-h-96">
                {sqlResults.rows && sqlResults.rows.length > 0 ? (
                  <table className="w-full text-left text-xs text-foreground">
                    <thead className="bg-muted/70 sticky top-0 border-b border-border">
                      <tr>
                        {Object.keys(sqlResults.rows[0]).map((k) => (
                          <th key={k} className="p-2 font-mono text-muted-foreground font-semibold">
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResults.rows.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          {Object.values(r).map((v: any, j: number) => (
                            <td key={j} className="p-2 font-mono text-[11px] truncate max-w-xs">
                              {String(v ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <pre className="p-4 text-xs font-mono text-emerald-500 bg-muted/40">
                    {JSON.stringify(sqlResults, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modal: Criar Nova Tabela no D1 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <form onSubmit={handleCreateNewTable}>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Plus className="size-4 text-orange-500" />
                Criar Nova Tabela no Cloudflare D1
              </DialogTitle>
              <DialogDescription className="text-xs">
                Defina o nome da tabela e a estrutura das colunas. A tabela será criada instantaneamente no seu banco serverless.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Nome da Tabela
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: produtos, pedidos, logs"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-foreground">Colunas da Tabela</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddColumnDef}
                    className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>Adicionar Coluna</span>
                  </Button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newTableColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-muted/40 p-2 rounded-lg border border-border/60">
                      <input
                        type="text"
                        required
                        placeholder="Nome da coluna"
                        value={col.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewTableColumns((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, name: val } : c))
                          );
                        }}
                        className="flex-1 px-2.5 py-1 bg-background border border-border rounded text-xs font-mono text-foreground"
                      />

                      <select
                        value={col.type}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewTableColumns((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, type: val } : c))
                          );
                        }}
                        className="w-24 px-2 py-1 bg-background border border-border rounded text-xs font-mono text-foreground"
                      >
                        <option value="TEXT">TEXT</option>
                        <option value="INTEGER">INTEGER</option>
                        <option value="REAL">REAL</option>
                        <option value="BLOB">BLOB</option>
                        <option value="JSON">JSON</option>
                      </select>

                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={col.primaryKey}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNewTableColumns((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, primaryKey: val } : c))
                            );
                          }}
                        />
                        <span>PK</span>
                      </label>

                      {newTableColumns.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveColumnDef(idx)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded cursor-pointer"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
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
