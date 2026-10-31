import React, { useState } from 'react';
import { Plus, Trash2, Key, Database, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface ColumnDef {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  references?: {
    table: string;
    column?: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  };
}

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTables?: string[];
  onCreateTable: (params: { name: string; columns: ColumnDef[] }) => Promise<void>;
}

export const CreateTableDialog: React.FC<CreateTableDialogProps> = ({
  open,
  onOpenChange,
  availableTables = [],
  onCreateTable,
}) => {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: 'id', type: 'TEXT', primaryKey: true, notNull: true },
    { name: 'title', type: 'TEXT', primaryKey: false, notNull: true },
    {
      name: 'user_id',
      type: 'TEXT',
      primaryKey: false,
      notNull: false,
      references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
    },
  ]);
  const [expandedFkIndex, setExpandedFkIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddColumn = () => {
    setColumns([
      ...columns,
      { name: `col_${columns.length + 1}`, type: 'TEXT', primaryKey: false, notNull: false },
    ]);
  };

  const handleRemoveColumn = (index: number) => {
    if (columns.length <= 1) {
      toast.error('A tabela deve possuir ao menos uma coluna.');
      return;
    }
    if (expandedFkIndex === index) setExpandedFkIndex(null);
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index: number, field: keyof ColumnDef, val: any) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: val };
    setColumns(updated);
  };

  const handleFkChange = (
    index: number,
    fkField: 'table' | 'column' | 'onDelete',
    val: string
  ) => {
    const updated = [...columns];
    const currentFk = updated[index].references || { table: '', column: 'id', onDelete: 'CASCADE' };
    const newFk = { ...currentFk, [fkField]: val };

    if (!newFk.table.trim()) {
      delete updated[index].references;
    } else {
      updated[index].references = newFk;
    }
    setColumns(updated);
  };

  const toggleFk = (index: number) => {
    if (expandedFkIndex === index) {
      setExpandedFkIndex(null);
    } else {
      setExpandedFkIndex(index);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      toast.error('Informe um nome válido para a tabela.');
      return;
    }

    const validCols = columns
      .filter((c) => c.name.trim().length > 0)
      .map((c) => {
        // Limpa referências vazias
        if (c.references && !c.references.table.trim()) {
          const { references: _, ...rest } = c;
          return rest;
        }
        return c;
      });

    if (validCols.length === 0) {
      toast.error('Adicione ao menos uma coluna válida.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateTable({
        name: cleanName,
        columns: validCols,
      });
      toast.success(`Tabela "${cleanName}" criada com sucesso no Cloudflare D1!`);
      onOpenChange(false);
      setTableName('');
      setColumns([
        { name: 'id', type: 'TEXT', primaryKey: true, notNull: true },
        { name: 'title', type: 'TEXT', primaryKey: false, notNull: true },
        {
          name: 'user_id',
          type: 'TEXT',
          primaryKey: false,
          notNull: false,
          references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
        },
      ]);
      setExpandedFkIndex(null);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar tabela.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Database className="size-4" />
            </div>
            <DialogTitle>Criar Nova Tabela (D1)</DialogTitle>
          </div>
          <DialogDescription>
            Defina o nome da tabela, tipos de dados e relações declarativas (Foreign Keys).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Table Name */}
          <div className="space-y-1.5">
            <label htmlFor="new-table-name" className="text-xs font-semibold text-foreground">
              Nome da Tabela
            </label>
            <input
              id="new-table-name"
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="ex: posts, tasks, produtos"
              required
              className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary font-mono"
            />
          </div>

          {/* Columns Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Definição de Colunas & Relações</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddColumn}
                className="h-7 text-xs px-2 gap-1 cursor-pointer"
              >
                <Plus className="size-3" />
                <span>Adicionar Coluna</span>
              </Button>
            </div>

            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {columns.map((col, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-muted/30 border border-border/60 text-xs overflow-hidden"
                >
                  <div className="flex items-center gap-2 p-2">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => handleColumnChange(idx, 'name', e.target.value)}
                      placeholder="nome_coluna"
                      className="flex-1 h-7.5 rounded-md bg-muted/60 border border-border/70 px-2 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />

                    <select
                      value={col.type}
                      onChange={(e) => handleColumnChange(idx, 'type', e.target.value)}
                      className="h-7.5 text-xs rounded-md bg-muted/60 border border-border/70 px-2 text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                    >
                      <option value="TEXT">TEXT</option>
                      <option value="INTEGER">INTEGER</option>
                      <option value="REAL">REAL</option>
                      <option value="BOOLEAN">BOOLEAN</option>
                      <option value="BLOB">BLOB</option>
                    </select>

                    <label className="flex items-center gap-1 cursor-pointer select-none px-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={col.primaryKey}
                        onChange={(e) => handleColumnChange(idx, 'primaryKey', e.target.checked)}
                        className="rounded-sm accent-primary cursor-pointer"
                      />
                      <Key className="size-3 text-amber-500" />
                      <span>PK</span>
                    </label>

                    <label className="flex items-center gap-1 cursor-pointer select-none px-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={col.notNull}
                        onChange={(e) => handleColumnChange(idx, 'notNull', e.target.checked)}
                        className="rounded-sm accent-primary cursor-pointer"
                      />
                      <span>Not Null</span>
                    </label>

                    {/* Botão de Toggle FK */}
                    <button
                      type="button"
                      onClick={() => toggleFk(idx)}
                      className={`flex items-center gap-1 h-7.5 px-2 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                        col.references?.table
                          ? 'bg-blue-500/15 border-blue-500/40 text-blue-500 hover:bg-blue-500/20'
                          : 'bg-muted/50 border-border/70 text-muted-foreground hover:text-foreground'
                      }`}
                      title="Configurar Chave Estrangeira / Relação"
                    >
                      <Link2 className="size-3" />
                      <span>FK</span>
                      {col.references?.table && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-500/30">
                          {col.references.table}
                        </Badge>
                      )}
                      {expandedFkIndex === idx ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                    </button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveColumn(idx)}
                      className="size-7 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      title="Remover coluna"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  {/* Painel de Expansão de Relação (Foreign Key) */}
                  {expandedFkIndex === idx && (
                    <div className="p-2.5 bg-muted/50 border-t border-border/60 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Aponta para tabela:</span>
                        <input
                          type="text"
                          value={col.references?.table || ''}
                          onChange={(e) => handleFkChange(idx, 'table', e.target.value)}
                          placeholder="ex: users, orders"
                          list={`tables-list-${idx}`}
                          className="h-7 w-32 rounded bg-background border border-border px-2 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                        />
                        <datalist id={`tables-list-${idx}`}>
                          {availableTables.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Coluna:</span>
                        <input
                          type="text"
                          value={col.references?.column || 'id'}
                          onChange={(e) => handleFkChange(idx, 'column', e.target.value)}
                          placeholder="id"
                          className="h-7 w-20 rounded bg-background border border-border px-2 text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">ON DELETE:</span>
                        <select
                          value={col.references?.onDelete || 'CASCADE'}
                          onChange={(e) => handleFkChange(idx, 'onDelete', e.target.value as any)}
                          className="h-7 text-xs rounded bg-background border border-border px-2 text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                        >
                          <option value="CASCADE">CASCADE</option>
                          <option value="SET NULL">SET NULL</option>
                          <option value="RESTRICT">RESTRICT</option>
                          <option value="NO ACTION">NO ACTION</option>
                        </select>
                      </div>

                      {col.references?.table && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...columns];
                            delete updated[idx].references;
                            setColumns(updated);
                          }}
                          className="text-[10px] text-rose-500 hover:underline cursor-pointer ml-auto"
                        >
                          Limpar FK
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? 'Criando...' : 'Criar Tabela'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
