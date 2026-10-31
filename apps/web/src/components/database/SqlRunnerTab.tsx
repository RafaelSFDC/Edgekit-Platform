import React, { useState } from 'react';
import { Play, Terminal, AlertTriangle, CheckCircle, Clock, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { SqlQueryResult } from '../../types';

interface SqlRunnerTabProps {
  onRunSql: (query: string) => Promise<SqlQueryResult>;
}

export const SqlRunnerTab: React.FC<SqlRunnerTabProps> = ({ onRunSql }) => {
  const [query, setQuery] = useState('SELECT * FROM users LIMIT 10;');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<SqlQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!query.trim()) {
      toast.error('Informe uma consulta SQL para executar.');
      return;
    }
    setError(null);
    setResults(null);
    setIsRunning(true);
    const start = performance.now();

    try {
      const res = await onRunSql(query);
      const elapsed = Math.round(performance.now() - start);
      setExecutionTime(elapsed);

      if (res.success) {
        setResults(res);
        toast.success(`Consulta executada em ${elapsed}ms!`);
      } else {
        setError(res.error?.message || 'Erro desconhecido ao executar SQL.');
        toast.error(res.error?.message || 'Falha ao executar consulta.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar consulta SQL.');
      toast.error(err.message || 'Falha ao executar consulta.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleCopyCell = (val: any, cellKey: string) => {
    const text = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
    navigator.clipboard.writeText(text);
    setCopiedCell(cellKey);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const rows = results?.rows || [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Editor Box */}
      <div className="bg-card/40 border border-border/70 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">SQL Console (Cloudflare D1)</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQuery("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%';")}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted/50 border border-border/60 hover:bg-muted/80 cursor-pointer transition-colors"
            >
              Listar Tabelas
            </button>
            <button
              type="button"
              onClick={() => setQuery('SELECT * FROM users LIMIT 10;')}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted/50 border border-border/60 hover:bg-muted/80 cursor-pointer transition-colors"
            >
              Consultar Users
            </button>
            <button
              type="button"
              onClick={() => setQuery('SELECT * FROM _ek_audit_logs ORDER BY created_at DESC LIMIT 10;')}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted/50 border border-border/60 hover:bg-muted/80 cursor-pointer transition-colors"
            >
              Logs de Auditoria
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            placeholder="Digite sua query SQL (ex: SELECT * FROM ...)..."
            className="w-full font-mono text-xs rounded-lg bg-zinc-950 text-zinc-100 p-3 border border-border/70 focus:outline-hidden focus:ring-1 focus:ring-primary leading-relaxed resize-y"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            Pressione <kbd className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] font-mono border border-border">Ctrl + Enter</kbd> para executar
          </span>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isRunning}
            className="h-8 text-xs px-3 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
          >
            <Play className={`size-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Executando...' : 'Executar SQL'}</span>
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-start gap-2.5">
          <AlertTriangle className="size-4 shrink-0 text-rose-500 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">Erro na Execução da Query:</span>
            <pre className="font-mono text-[11px] whitespace-pre-wrap">{error}</pre>
          </div>
        </div>
      )}

      {/* Results View */}
      {results && (
        <div className="flex-1 min-h-[250px] border border-border/70 rounded-xl overflow-hidden bg-card/40 flex flex-col">
          <div className="px-3.5 py-2.5 border-b border-border/70 bg-card/70 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="size-4 text-emerald-500" />
              <span className="font-medium text-foreground">
                {results.rowCount ?? rows.length} linha(s) afetada(s) / retornada(s)
              </span>
            </div>
            {executionTime !== null && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                <Clock className="size-3" />
                {executionTime}ms
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-muted-foreground">
              A consulta foi executada com sucesso e não retornou linhas de resultado (ex: DDL, INSERT ou UPDATE).
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-muted/40 transition-colors">
                      {columns.map((col) => {
                        const val = row[col];
                        const cellKey = `sql_${rIdx}_${col}`;
                        const displayVal =
                          val === null ? (
                            <span className="text-muted-foreground italic font-mono text-[10px]">
                              NULL
                            </span>
                          ) : typeof val === 'object' ? (
                            <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px] block">
                              {JSON.stringify(val)}
                            </span>
                          ) : (
                            <span className="truncate max-w-[300px] block text-foreground font-mono text-[11px]">
                              {String(val)}
                            </span>
                          );

                        return (
                          <td
                            key={col}
                            onClick={() => handleCopyCell(val, cellKey)}
                            title="Clique para copiar"
                            className="px-3 py-2 cursor-pointer group/cell"
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
