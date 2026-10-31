import React, { useState } from 'react';
import { Table, Terminal, Shield, Lock } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableListSidebar } from '../components/database/TableListSidebar';
import { TableDataGrid } from '../components/database/TableDataGrid';
import { TablePolicyTab } from '../components/database/TablePolicyTab';
import { TableApiSnippets } from '../components/database/TableApiSnippets';
import { SqlRunnerTab } from '../components/database/SqlRunnerTab';
import { CreateTableDialog } from '../components/database/CreateTableDialog';
import { DropTableDialog } from '../components/database/DropTableDialog';
import type { TablePolicy } from '../types';

const SYSTEM_TABLES = new Set([
  '_ek_admins',
  '_ek_admin_sessions',
  '_ek_admin_invites',
  '_ek_api_keys',
  '_ek_table_policies',
  '_ek_storage_buckets',
  '_ek_storage_objects',
  '_ek_webhooks',
  '_ek_audit_logs',
  '_ek_settings',
  'users',
  'sessions',
  'accounts',
  'verifications',
  'organizations',
  'members',
  'invitations',
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

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [droppingTableName, setDroppingTableName] = useState<string | null>(null);

  // Queries
  const { data: tables = [], refetch: refetchTables, isLoading: _loadingTables } = useTablesQuery();
  const currentTable = selectedTable || (tables.length > 0 ? tables[0].name : '');
  const { data: rows = [], refetch: refetchRows, isLoading: loadingRows } = useTableRowsQuery(currentTable);
  const { data: platformKeys = {} } = usePlatformKeysQuery();
  const { data: rawPolicy, refetch: refetchPolicy } = useTablePolicyQuery(currentTable);

  // Mutations
  const deleteRowMutation = useDeleteTableRowMutation();
  const updateRowMutation = useUpdateTableRowMutation();
  const insertRowMutation = useInsertTableRowMutation();
  const createTableMutation = useCreateTableMutation();
  const dropTableMutation = useDropTableMutation();
  const updatePolicyMutation = useUpdateTablePolicyMutation();
  const runSqlMutation = useRunSqlMutation();

  const isCurrentSystemTable = SYSTEM_TABLES.has(currentTable.toLowerCase());

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setTableSubTab('data');
  };

  const handleInsertRow = async (record: Record<string, any>) => {
    await insertRowMutation.mutateAsync({ table: currentTable, record });
    refetchRows();
  };

  const handleUpdateRow = async (id: string, record: Record<string, any>) => {
    await updateRowMutation.mutateAsync({ table: currentTable, id, record });
    refetchRows();
  };

  const handleDeleteRow = async (id: string) => {
    await deleteRowMutation.mutateAsync({ table: currentTable, id });
    refetchRows();
  };

  const handleSavePolicy = async (policy: Partial<TablePolicy>) => {
    await updatePolicyMutation.mutateAsync({
      table: currentTable,
      policy,
    });
    refetchPolicy();
  };

  const handleCreateTable = async (params: {
    name: string;
    columns: Array<{ name: string; type: string; primaryKey: boolean; notNull: boolean }>;
  }) => {
    await createTableMutation.mutateAsync(params);
    refetchTables();
    setSelectedTable(params.name);
  };

  const handleDropTable = async (name: string) => {
    await dropTableMutation.mutateAsync(name);
    refetchTables();
    if (selectedTable === name) {
      setSelectedTable('');
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.database.title}
        description={t.database.subtitle}
        actions={
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/70">
            <Button
              variant={activeMainTab === 'explorer' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveMainTab('explorer')}
              className="text-xs h-7.5 cursor-pointer gap-1.5"
            >
              <Table className="size-3.5" />
              <span>{t.database.dataExplorer}</span>
            </Button>
            <Button
              variant={activeMainTab === 'sql' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveMainTab('sql')}
              className="text-xs h-7.5 cursor-pointer gap-1.5"
            >
              <Terminal className="size-3.5" />
              <span>{t.database.sqlRunner}</span>
            </Button>
          </div>
        }
      />

      {activeMainTab === 'explorer' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 h-[calc(100vh-210px)] min-h-[550px]">
          {/* Barra Lateral de Tabelas */}
          <div className="md:col-span-1 h-full">
            <TableListSidebar
              tables={tables}
              selectedTable={currentTable}
              onSelectTable={handleSelectTable}
              onOpenCreate={() => setIsCreateOpen(true)}
              onOpenDrop={(name) => setDroppingTableName(name)}
              isSystemTable={(name) => SYSTEM_TABLES.has(name.toLowerCase())}
            />
          </div>

          {/* Painel de Visualização e Configuração da Tabela Selecionada */}
          <div className="md:col-span-3 h-full flex flex-col bg-card/40 border border-border/70 rounded-xl overflow-hidden shadow-xs">
            {/* Header da Tabela Selecionada */}
            <div className="p-3.5 border-b border-border/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card/60">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground font-mono">
                  {currentTable || 'Nenhuma tabela selecionada'}
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  {rows.length} {t.database.rowsCount}
                </Badge>
                {isCurrentSystemTable ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                    <Shield className="size-2.5" />
                    Protegida (Sistema)
                  </Badge>
                ) : (
                  <Badge
                    variant={rawPolicy?.rlsEnabled ? 'default' : 'secondary'}
                    className="text-[10px] gap-1"
                  >
                    <Lock className="size-2.5" />
                    {rawPolicy?.rlsEnabled ? 'RLS Ativo' : 'RLS Desativado'}
                  </Badge>
                )}
              </div>

              {/* Sub-abas da Tabela */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/70 self-stretch sm:self-auto justify-end">
                <Button
                  variant={tableSubTab === 'data' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTableSubTab('data')}
                  className="h-7 px-2.5 text-xs cursor-pointer gap-1.5"
                >
                  <Table className="size-3.5" />
                  <span>Dados</span>
                </Button>
                {!isCurrentSystemTable && (
                  <Button
                    variant={tableSubTab === 'rls' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTableSubTab('rls')}
                    className="h-7 px-2.5 text-xs cursor-pointer gap-1.5"
                  >
                    <Shield className="size-3.5" />
                    <span>Políticas & RLS</span>
                  </Button>
                )}
                <Button
                  variant={tableSubTab === 'api' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTableSubTab('api')}
                  className="h-7 px-2.5 text-xs cursor-pointer gap-1.5"
                >
                  <span>API / SDK</span>
                </Button>
              </div>
            </div>

            {/* Conteúdo da Sub-aba */}
            <div className="flex-1 p-4 overflow-y-auto">
              {!currentTable ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <p className="text-sm font-medium text-muted-foreground">
                    Selecione uma tabela à esquerda ou crie uma nova para começar.
                  </p>
                </div>
              ) : tableSubTab === 'data' ? (
                <TableDataGrid
                  tableName={currentTable}
                  rows={rows}
                  isLoading={loadingRows}
                  onRefresh={refetchRows}
                  isSystemTable={isCurrentSystemTable}
                  onInsertRow={handleInsertRow}
                  onUpdateRow={handleUpdateRow}
                  onDeleteRow={handleDeleteRow}
                />
              ) : tableSubTab === 'rls' ? (
                <TablePolicyTab
                  tableName={currentTable}
                  initialPolicy={rawPolicy}
                  isSystemTable={isCurrentSystemTable}
                  onSavePolicy={handleSavePolicy}
                />
              ) : (
                <TableApiSnippets
                  tableName={currentTable}
                  anonKey={platformKeys.anonKey}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-210px)] min-h-[550px]">
          <SqlRunnerTab onRunSql={(sql) => runSqlMutation.mutateAsync(sql)} />
        </div>
      )}

      {/* Modals de Criação e Remoção de Tabela */}
      <CreateTableDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreateTable={handleCreateTable}
      />

      <DropTableDialog
        tableName={droppingTableName}
        onClose={() => setDroppingTableName(null)}
        onConfirmDrop={handleDropTable}
      />
    </PageLayout>
  );
};
