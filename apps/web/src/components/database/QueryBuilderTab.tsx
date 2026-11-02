import React, { useState, useMemo } from 'react';
import {
  Play,
  Filter,
  Plus,
  Trash2,
  Copy,
  Check,
  Code2,
  Clock,
  Layers,
  Table as TableIcon,
  FileJson,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useStructuredQueryMutation } from '@/hooks/api/use-database';
import type { D1TableInfo } from '../../types';

interface QueryFilterRow {
  id: string;
  field: string;
  op: string;
  value: string;
}

interface QueryBuilderTabProps {
  tables: D1TableInfo[];
  selectedTable?: string;
  onSelectTable?: (table: string) => void;
  availableColumns?: string[];
}

const OPERATORS = [
  { value: 'eq', label: '= (Igual)' },
  { value: 'neq', label: '!= (Diferente)' },
  { value: 'gt', label: '> (Maior que)' },
  { value: 'gte', label: '>= (Maior ou igual)' },
  { value: 'lt', label: '< (Menor que)' },
  { value: 'lte', label: '<= (Menor ou igual)' },
  { value: 'like', label: 'LIKE (Busca com %)' },
  { value: 'ilike', label: 'ILIKE (Case-insensitive)' },
  { value: 'is', label: 'IS (null / true / false)' },
  { value: 'between', label: 'BETWEEN (min,max)' },
  { value: 'contains', label: 'CONTAINS (Contém valor)' },
  { value: 'in', label: 'IN (item1,item2)' },
  { value: 'not_in', label: 'NOT IN' },
];

export const QueryBuilderTab: React.FC<QueryBuilderTabProps> = ({
  tables,
  selectedTable: propSelectedTable,
  onSelectTable,
  availableColumns = [],
}) => {
  const [currentTable, setCurrentTable] = useState(
    propSelectedTable || (tables.length > 0 ? tables[0].name : ''),
  );
  const [selectedColumns, setSelectedColumns] = useState<string>('*');
  const [filters, setFilters] = useState<QueryFilterRow[]>([]);
  const [orderCol, setOrderCol] = useState<string>('');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc');
  const [limit, setLimit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);
  const [expand, setExpand] = useState<string>('');

  const [activeView, setActiveView] = useState<'table' | 'json'>('table');
  const [results, setResults] = useState<any[] | null>(null);
  const [meta, setMeta] = useState<any | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const queryMutation = useStructuredQueryMutation();

  const handleTableChange = (newTable: string) => {
    setCurrentTable(newTable);
    if (onSelectTable) onSelectTable(newTable);
    setFilters([]);
    setOrderCol('');
    setResults(null);
  };

  const addFilter = () => {
    const defaultField = availableColumns.length > 0 ? availableColumns[0] : 'id';
    setFilters([
      ...filters,
      {
        id: crypto.randomUUID(),
        field: defaultField,
        op: 'eq',
        value: '',
      },
    ]);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter((f) => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<QueryFilterRow>) => {
    setFilters(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleExecute = async () => {
    if (!currentTable) {
      toast.error('Selecione uma tabela para consultar.');
      return;
    }

    const start = performance.now();
    try {
      const spec: any = {
        select: selectedColumns === '*' ? '*' : selectedColumns.split(',').map((s) => s.trim()),
        limit,
        offset,
      };

      if (filters.length > 0) {
        spec.where = filters
          .filter((f) => f.field.trim() && f.value.trim() !== '')
          .map((f) => ({
            field: f.field.trim(),
            op: f.op,
            value: f.op === 'in' || f.op === 'not_in'
              ? f.value.split(',').map((s) => s.trim())
              : f.op === 'between'
              ? f.value.split(',').map((s) => s.trim())
              : f.value,
          }));
      }

      if (orderCol) {
        spec.orderBy = [{ field: orderCol, direction: orderDir }];
      }

      if (expand.trim()) {
        spec.expand = expand.trim();
      }

      const res = await queryMutation.mutateAsync({ table: currentTable, spec });
      const elapsed = Math.round(performance.now() - start);
      setExecutionTime(elapsed);

      if (res.success && res.data) {
        setResults(res.data);
        setMeta(res.meta);
        toast.success(`Consulta executada em ${elapsed}ms (${res.data.length} registros)!`);
      } else {
        toast.error(res.error?.message || 'Falha ao executar consulta.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar consulta declarativa.');
    }
  };

  // Gerador de Código SDK TypeScript Dinâmico (Seção 6.2)
  const generatedSdkCode = useMemo(() => {
    if (!currentTable) return '// Selecione uma tabela para gerar o código';

    let code = `import { createClient } from "@edgekit/platform-client";\n\n`;
    code += `const edgekit = createClient({\n  url: window.location.origin,\n  key: "SUA_API_KEY",\n});\n\n`;
    code += `const { data, error } = await edgekit\n  .from("${currentTable}")\n  .select("${selectedColumns}")`;

    for (const f of filters) {
      if (f.field && f.value !== '') {
        if (f.op === 'eq') code += `\n  .eq("${f.field}", ${JSON.stringify(f.value)})`;
        else if (f.op === 'neq') code += `\n  .neq("${f.field}", ${JSON.stringify(f.value)})`;
        else if (f.op === 'gt') code += `\n  .gt("${f.field}", ${Number(f.value) || f.value})`;
        else if (f.op === 'gte') code += `\n  .gte("${f.field}", ${Number(f.value) || f.value})`;
        else if (f.op === 'lt') code += `\n  .lt("${f.field}", ${Number(f.value) || f.value})`;
        else if (f.op === 'lte') code += `\n  .lte("${f.field}", ${Number(f.value) || f.value})`;
        else if (f.op === 'like') code += `\n  .like("${f.field}", "${f.value}")`;
        else if (f.op === 'ilike') code += `\n  .ilike("${f.field}", "${f.value}")`;
        else if (f.op === 'is') code += `\n  .is("${f.field}", ${f.value})`;
        else if (f.op === 'between') code += `\n  .between("${f.field}", ${f.value.split(',')[0]}, ${f.value.split(',')[1]})`;
        else if (f.op === 'contains') code += `\n  .contains("${f.field}", "${f.value}")`;
        else if (f.op === 'in') code += `\n  .in("${f.field}", ${JSON.stringify(f.value.split(','))})`;
        else if (f.op === 'not_in') code += `\n  .notIn("${f.field}", ${JSON.stringify(f.value.split(','))})`;
      }
    }

    if (orderCol) {
      code += `\n  .order("${orderCol}", { ascending: ${orderDir === 'asc'} })`;
    }

    if (limit) {
      code += `\n  .limit(${limit})`;
    }

    if (offset > 0) {
      code += `\n  .offset(${offset})`;
    }

    if (expand.trim()) {
      code += `\n  .expand("${expand.trim()}")`;
    }

    code += `;\n`;
    return code;
  }, [currentTable, selectedColumns, filters, orderCol, orderDir, limit, offset, expand]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedSdkCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success('Código SDK copiado para a área de transferência!');
  };

  const handleCopyJson = () => {
    if (!results) return;
    navigator.clipboard.writeText(JSON.stringify(results, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
    toast.success('JSON dos resultados copiado!');
  };

  const resultColumns = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 1. Header do Query Builder */}
      <div className="bg-card/40 border border-border/70 rounded-xl p-4 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Visual Query Builder (Zero-SQL)
                <Badge variant="outline" className="text-[10px] font-mono text-orange-400 border-orange-500/20">
                  SDK-First
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                Construa consultas declarativas seguras através da API oficial do Edgekit Platform.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleExecute}
              disabled={queryMutation.isPending || !currentTable}
              className="h-8 cursor-pointer gap-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white shadow-xs"
            >
              <Play className="size-3.5 fill-current" />
              <span>{queryMutation.isPending ? 'Executando...' : 'Executar Consulta'}</span>
            </Button>
          </div>
        </div>

        {/* 2. Seletores Principais: Tabela, Colunas, Ordenação, Paginação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Tabela */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Layers className="size-3" />
              Tabela
            </div>
            <select
              value={currentTable}
              onChange={(e) => handleTableChange(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg bg-muted/50 border border-border/80 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="">Selecione uma tabela...</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Colunas */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <TableIcon className="size-3" />
              Colunas (separadas por vírgula)
            </div>
            <Input
              value={selectedColumns}
              onChange={(e) => setSelectedColumns(e.target.value)}
              placeholder="* ou id, name, email"
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Ordenação */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <ArrowUpDown className="size-3" />
              Ordenar por
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={orderCol}
                onChange={(e) => setOrderCol(e.target.value)}
                placeholder="coluna (ex: created_at)"
                className="h-8 text-xs font-mono flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOrderDir(orderDir === 'asc' ? 'desc' : 'asc')}
                className="h-8 px-2 text-[10px] font-mono cursor-pointer uppercase shrink-0"
                title="Alternar ASC / DESC"
              >
                {orderDir}
              </Button>
            </div>
          </div>

          {/* Limite & Offset */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              Limite & Offset
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 20)}
                placeholder="Limite"
                className="h-8 text-xs font-mono w-1/2"
              />
              <Input
                type="number"
                min={0}
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value) || 0)}
                placeholder="Offset"
                className="h-8 text-xs font-mono w-1/2"
              />
            </div>
          </div>
        </div>

        {/* 3. Expansão de Relações */}
        <div className="space-y-1 pt-1">
          <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Code2 className="size-3" />
            Expansão de Relacionamentos (Foreign Keys)
          </div>
          <Input
            value={expand}
            onChange={(e) => setExpand(e.target.value)}
            placeholder="Ex: author_id:users ou user_id"
            className="h-8 text-xs font-mono"
          />
        </div>

        {/* 4. Construtor de Filtros Dinâmicos */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Filter className="size-3.5 text-orange-400" />
              Filtros da Consulta ({filters.length})
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFilter}
              className="h-7 text-[11px] cursor-pointer gap-1"
            >
              <Plus className="size-3" />
              <span>Adicionar Filtro</span>
            </Button>
          </div>

          {filters.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-1">
              Nenhum filtro aplicado. A consulta retornará todos os registros permitidos pela Policy Engine.
            </p>
          ) : (
            <div className="space-y-2">
              {filters.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2 bg-muted/30 p-2 rounded-lg border border-border/50">
                  <Input
                    value={f.field}
                    onChange={(e) => updateFilter(f.id, { field: e.target.value })}
                    placeholder="Coluna (ex: status)"
                    className="h-7 text-xs font-mono w-40"
                  />

                  <select
                    value={f.op}
                    onChange={(e) => updateFilter(f.id, { op: e.target.value })}
                    className="h-7 px-2 rounded-md bg-muted/60 border border-border/80 text-xs text-foreground focus:outline-hidden"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  <Input
                    value={f.value}
                    onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                    placeholder="Valor (ex: active ou 10,100)"
                    className="h-7 text-xs font-mono flex-1 min-w-[120px]"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFilter(f.id)}
                    className="size-7 text-destructive hover:bg-destructive/10 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Pré-visualização do Código SDK TypeScript Correspondente */}
      <div className="bg-card/40 border border-border/70 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Code2 className="size-3.5 text-primary" />
            Snippet do SDK Client (@edgekit/platform-client)
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyCode}
            className="h-7 px-2 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            {copiedCode ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span>{copiedCode ? 'Copiado!' : 'Copiar SDK'}</span>
          </Button>
        </div>
        <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-36 select-all">
          {generatedSdkCode}
        </pre>
      </div>

      {/* 6. Painel de Resultados */}
      <div className="flex-1 bg-card/40 border border-border/70 rounded-xl flex flex-col overflow-hidden min-h-[300px]">
        {/* Header do Resultado */}
        <div className="p-3 border-b border-border/70 flex items-center justify-between bg-card/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Resultados da Consulta</span>
            {results && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {results.length} {meta?.total !== undefined ? `/ ${meta.total} total` : 'registros'}
              </Badge>
            )}
            {executionTime !== null && (
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 border-emerald-500/20 gap-1">
                <Clock className="size-2.5" />
                {executionTime}ms
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {results && results.length > 0 && (
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/70">
                <Button
                  variant={activeView === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveView('table')}
                  className="h-6.5 px-2 text-xs cursor-pointer gap-1"
                >
                  <TableIcon className="size-3" />
                  <span>Tabela</span>
                </Button>
                <Button
                  variant={activeView === 'json' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveView('json')}
                  className="h-6.5 px-2 text-xs cursor-pointer gap-1"
                >
                  <FileJson className="size-3" />
                  <span>JSON</span>
                </Button>
              </div>
            )}

            {results && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyJson}
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                {copiedJson ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                <span>Copiar JSON</span>
              </Button>
            )}
          </div>
        </div>

        {/* Corpo do Resultado */}
        <div className="flex-1 p-3 overflow-auto">
          {results === null ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
              <Sparkles className="size-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium">Nenhuma consulta executada ainda.</p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                Configure os parâmetros acima e clique em &quot;Executar Consulta&quot;.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
              <p className="text-xs font-medium">Nenhum registro encontrado para os critérios informados.</p>
            </div>
          ) : activeView === 'table' ? (
            <div className="border border-border/70 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border/70">
                  <tr>
                    {resultColumns.map((c) => (
                      <th key={c} className="p-2.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {results.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      {resultColumns.map((col) => {
                        const val = row[col];
                        const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—');
                        return (
                          <td key={col} className="p-2.5 truncate max-w-xs text-foreground">
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 overflow-x-auto max-h-[400px]">
              {JSON.stringify(results, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
