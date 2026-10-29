import React, { useState } from 'react';
import {
  Table,
  Play,
  Trash2,
  RefreshCw,
  Plus,
  Terminal,
  Database as DbIcon,
  Check,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import {
  useTablesQuery,
  useTableRowsQuery,
  useDeleteTableRowMutation,
  useRunSqlMutation,
  useInsertTableRowMutation,
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
  const runSqlMutation = useRunSqlMutation();
  const insertRowMutation = useInsertTableRowMutation();

  // SQL Runner state
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM users LIMIT 10;');
  const [sqlResults, setSqlResults] = useState<any>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // Dialogs
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newRowJson, setNewRowJson] = useState('{\n  "name": "Novo Usuário",\n  "email": "user@example.com"\n}');

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
              className="text-xs h-7"
            >
              <Table className="size-3.5 mr-1.5" />
              {t.database.dataExplorer}
            </Button>
            <Button
              variant={activeTab === 'sql' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('sql')}
              className="text-xs h-7"
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
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => refetchTables()}
                title={t.common.refresh}
              >
                <RefreshCw className="size-3" />
              </Button>
            </CardHeader>
            <CardContent className="p-2 flex-1 overflow-y-auto space-y-1">
              {loadingTables ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  {t.common.loading}
                </div>
              ) : (
                tables.map((tbl) => (
                  <button
                    key={tbl.name}
                    type="button"
                    onClick={() => setSelectedTable(tbl.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      currentTable === tbl.name
                        ? 'bg-primary/10 text-primary border border-primary/20 font-medium'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{tbl.name}</span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                      D1
                    </Badge>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Área de Dados da Tabela */}
          <Card className="md:col-span-3 h-[calc(100vh-220px)] flex flex-col">
            <CardHeader className="p-3 border-b border-border flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {currentTable || 'Selecione uma tabela'}
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  {rows.length} {t.database.rowsCount}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(true)}
                  className="gap-1.5 text-xs h-7"
                >
                  <Plus className="size-3.5" />
                  Inserir Registro
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
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
                        <th key={col} className="p-2.5 font-semibold text-muted-foreground whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="p-2.5 font-semibold text-muted-foreground text-right">
                        {t.common.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.id || idx} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                        {columns.map((col) => (
                          <td key={col} className="p-2.5 max-w-[220px] truncate font-mono text-[11px]">
                            {typeof row[col] === 'object' && row[col] !== null
                              ? JSON.stringify(row[col])
                              : String(row[col] ?? '')}
                          </td>
                        ))}
                        <td className="p-2.5 text-right whitespace-nowrap">
                          {row.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingId(row.id)}
                              className="size-6 text-destructive hover:bg-destructive/10"
                              title={t.common.delete}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
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
        /* Aba SQL Query Runner */
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Comando SQL (Cloudflare D1)</CardTitle>
              <Button
                onClick={handleRunSql}
                disabled={runSqlMutation.isPending}
                className="gap-1.5 text-xs h-8"
              >
                <Play className="size-3.5 fill-current" />
                {runSqlMutation.isPending ? t.database.executing : t.database.runSql}
              </Button>
            </CardHeader>
            <CardContent>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                className="w-full bg-muted/50 border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                placeholder="SELECT * FROM users LIMIT 10;"
              />
            </CardContent>
          </Card>

          {sqlError && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs font-mono">
              ⚠️ {sqlError}
            </div>
          )}

          {sqlResults && (
            <Card>
              <CardHeader className="py-3">
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
    </PageLayout>
  );
};
