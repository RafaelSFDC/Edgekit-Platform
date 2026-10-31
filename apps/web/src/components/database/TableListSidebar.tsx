import React, { useState } from 'react';
import {
  Table as TableIcon,
  Plus,
  Trash2,
  Search,
  Database,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { D1TableInfo } from '../../types';

interface TableListSidebarProps {
  tables: D1TableInfo[];
  selectedTable: string;
  onSelectTable: (name: string) => void;
  onOpenCreate: () => void;
  onOpenDrop: (name: string) => void;
  isSystemTable: (name: string) => boolean;
}

export const TableListSidebar: React.FC<TableListSidebarProps> = ({
  tables,
  selectedTable,
  onSelectTable,
  onOpenCreate,
  onOpenDrop,
  isSystemTable,
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(filterText.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-card/40 border border-border/70 rounded-xl overflow-hidden shadow-xs">
      {/* Top Header */}
      <div className="p-3 border-b border-border/70 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
              <Database className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Tabelas D1</h3>
              <p className="text-[10px] text-muted-foreground">{tables.length} tabelas disponíveis</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={onOpenCreate}
            className="h-7 text-xs px-2.5 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-3.5" />
            <span>Nova</span>
          </Button>
        </div>

        {/* Campo de Busca */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar tabelas..."
            className="w-full h-7.5 pl-8 pr-2.5 rounded-lg bg-muted/50 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Lista de Tabelas */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredTables.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhuma tabela encontrada.
          </div>
        ) : (
          filteredTables.map((tbl) => {
            const isSelected = selectedTable === tbl.name;
            const isSys = isSystemTable(tbl.name);

            return (
              <div
                key={tbl.name}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  isSelected
                    ? 'bg-orange-500/10 text-orange-500 font-medium border border-orange-500/20'
                    : 'text-foreground hover:bg-muted/60 border border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTable(tbl.name)}
                  className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer py-0.5"
                >
                  {isSys ? (
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <TableIcon className="size-3.5 shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{tbl.name}</span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 border-border/70 text-muted-foreground"
                  >
                    {tbl.rowCount}
                  </Badge>

                  {!isSys && (
                    <button
                      type="button"
                      aria-label="Excluir tabela"
                      onClick={() => onOpenDrop(tbl.name)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity cursor-pointer rounded-sm hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
