import React, { useState, useMemo } from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  Table as TableIcon,
  AlertCircle,
  Copy,
  Check,
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

interface TableDataGridProps {
  tableName: string;
  rows: Record<string, any>[];
  isLoading: boolean;
  onRefresh: () => void;
  isSystemTable: boolean;
  onInsertRow: (record: Record<string, any>) => Promise<void>;
  onUpdateRow: (id: string, record: Record<string, any>) => Promise<void>;
  onDeleteRow: (id: string) => Promise<void>;
}

export const TableDataGrid: React.FC<TableDataGridProps> = ({
  tableName,
  rows,
  isLoading,
  onRefresh,
  isSystemTable,
  onInsertRow,
  onUpdateRow,
  onDeleteRow,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newRowJson, setNewRowJson] = useState('{\n  "title": "Novo Item"\n}');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRowJson, setEditRowJson] = useState('{}');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [rows, searchTerm]);

  const handleCopyCell = (val: any, cellKey: string) => {
    const text = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
    navigator.clipboard.writeText(text);
    setCopiedCell(cellKey);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleOpenEdit = (row: Record<string, any>) => {
    const id = row.id;
    if (id === undefined || id === null) {
      toast.error('O registro não possui uma coluna identificadora "id".');
      return;
    }
    setEditingId(String(id));
    const clone = { ...row };
    delete clone.id;
    setEditRowJson(JSON.stringify(clone, null, 2));
    setIsEditOpen(true);
  };

  const submitInsert = async () => {
    try {
      const parsed = JSON.parse(newRowJson);
      await onInsertRow(parsed);
      setIsAddOpen(false);
      setNewRowJson('{\n  "title": "Novo Item"\n}');
      toast.success('Registro inserido com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'JSON inválido');
    }
  };

  const submitUpdate = async () => {
    if (!editingId) return;
    try {
      const parsed = JSON.parse(editRowJson);
      await onUpdateRow(editingId, parsed);
      setIsEditOpen(false);
      setEditingId(null);
      toast.success('Registro atualizado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar registro.');
    }
  };

  const submitDelete = async () => {
    if (!deletingId) return;
    try {
      await onDeleteRow(deletingId);
      setDeletingId(null);
      toast.success('Registro removido com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir registro.');
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar nos registros..."
            className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-8 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            title="Atualizar registros"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          {!isSystemTable && (
            <Button
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="h-8 text-xs px-3 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>Inserir Linha</span>
            </Button>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 min-h-[300px] border border-border/70 rounded-xl overflow-hidden bg-card/40 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground gap-2">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <span>Carregando dados de {tableName}...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="size-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
              <TableIcon className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {rows.length === 0 ? 'Tabela vazia' : 'Nenhum resultado para a busca'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {rows.length === 0
                ? `A tabela "${tableName}" não possui registros gravados ainda.`
                : 'Tente alterar os termos de pesquisa ou limpe o campo.'}
            </p>
            {rows.length === 0 && !isSystemTable && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddOpen(true)}
                className="mt-4 text-xs h-8 gap-1.5 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Adicionar Primeiro Registro</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/60 sticky top-0 z-10 border-b border-border/70 backdrop-blur-xs">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase text-right w-24">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredRows.map((row, rIdx) => {
                  const rowId = row.id !== undefined ? String(row.id) : null;
                  return (
                    <tr
                      key={rowId ?? rIdx}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      {columns.map((col) => {
                        const val = row[col];
                        const cellKey = `${rIdx}_${col}`;
                        const displayVal =
                          val === null ? (
                            <span className="text-muted-foreground italic font-mono text-[10px]">
                              NULL
                            </span>
                          ) : typeof val === 'boolean' ? (
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-mono ${
                                val ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                              }`}
                            >
                              {val ? 'TRUE' : 'FALSE'}
                            </Badge>
                          ) : typeof val === 'object' ? (
                            <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px] block">
                              {JSON.stringify(val)}
                            </span>
                          ) : (
                            <span className="truncate max-w-[260px] block text-foreground">
                              {String(val)}
                            </span>
                          );

                        return (
                          <td
                            key={col}
                            onClick={() => handleCopyCell(val, cellKey)}
                            title="Clique para copiar conteúdo"
                            className="px-3 py-2 cursor-pointer font-mono text-[11px] relative group/cell"
                          >
                            <div className="flex items-center justify-between gap-1">
                              {displayVal}
                              <span className="opacity-0 group-hover/cell:opacity-100 transition-opacity ml-1">
                                {copiedCell === cellKey ? (
                                  <Check className="size-3 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3 text-muted-foreground/60 hover:text-foreground" />
                                )}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {rowId && !isSystemTable && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(row)}
                                className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Editar registro"
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingId(rowId)}
                                className="size-6 text-muted-foreground hover:text-destructive cursor-pointer"
                                title="Excluir registro"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer with Row Count */}
        <div className="px-3 py-2 border-t border-border/70 bg-card/60 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Exibindo <strong>{filteredRows.length}</strong> de <strong>{rows.length}</strong> registros
          </span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-[11px] text-primary hover:underline cursor-pointer"
            >
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      {/* Inserir Registro Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Inserir Linha em "{tableName}"</DialogTitle>
            <DialogDescription>
              Informe os dados da nova linha no formato JSON. Campos com valor padrão no banco podem ser omitidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <textarea
              value={newRowJson}
              onChange={(e) => setNewRowJson(e.target.value)}
              rows={8}
              className="w-full rounded-lg bg-muted/50 border border-border/70 p-3 font-mono text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitInsert}>Inserir Registro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar Registro Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Registro #{editingId}</DialogTitle>
            <DialogDescription>
              Atualize as propriedades do registro abaixo em formato JSON.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <textarea
              value={editRowJson}
              onChange={(e) => setEditRowJson(e.target.value)}
              rows={8}
              className="w-full rounded-lg bg-muted/50 border border-border/70 p-3 font-mono text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitUpdate}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar Exclusão Dialog */}
      <Dialog open={Boolean(deletingId)} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              <DialogTitle>Excluir Registro?</DialogTitle>
            </div>
            <DialogDescription>
              Tem certeza de que deseja excluir o registro <strong>#{deletingId}</strong> da tabela "{tableName}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={submitDelete}>
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
