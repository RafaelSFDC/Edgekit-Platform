import React, { useState } from 'react';
import { Plus, Trash2, Key, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface ColumnDef {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
}

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTable: (params: { name: string; columns: ColumnDef[] }) => Promise<void>;
}

export const CreateTableDialog: React.FC<CreateTableDialogProps> = ({
  open,
  onOpenChange,
  onCreateTable,
}) => {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: 'id', type: 'TEXT', primaryKey: true, notNull: true },
    { name: 'title', type: 'TEXT', primaryKey: false, notNull: true },
    { name: 'user_id', type: 'TEXT', primaryKey: false, notNull: false },
  ]);
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
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index: number, field: keyof ColumnDef, val: any) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: val };
    setColumns(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      toast.error('Informe um nome válido para a tabela.');
      return;
    }

    const validCols = columns.filter((c) => c.name.trim().length > 0);
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
        { name: 'user_id', type: 'TEXT', primaryKey: false, notNull: false },
      ]);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar tabela.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Database className="size-4" />
            </div>
            <DialogTitle>Criar Nova Tabela (D1)</DialogTitle>
          </div>
          <DialogDescription>
            Defina o nome da tabela e sua estrutura de colunas inicial. Uma chave primária será criada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Table Name */}
          <div className="space-y-1.5">
            <label htmlFor="new-table-name" className="text-xs font-semibold text-foreground">Nome da Tabela</label>
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
              <span className="text-xs font-semibold text-foreground">Definição de Colunas</span>
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

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {columns.map((col, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/60 text-xs"
                >
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
