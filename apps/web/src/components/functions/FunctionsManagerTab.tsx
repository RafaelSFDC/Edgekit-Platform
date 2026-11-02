import React, { useState, useEffect, useCallback } from 'react';
import {
  Code2,
  Play,
  Copy,
  Check,
  Clock,
  Sparkles,
  RefreshCw,
  FileCode,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fetchFunctionsList, invokeFunctionTest } from '../../services/api';

interface FunctionItem {
  name: string;
  description: string;
  methods: string[];
  endpoint: string;
}

export const FunctionsManagerTab: React.FC = () => {
  const [functions, setFunctions] = useState<FunctionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFunction, setSelectedFunction] = useState<FunctionItem | null>(null);

  const [testMethod, setTestMethod] = useState<string>('GET');
  const [testBody, setTestBody] = useState<string>('{\n  "name": "Edgekit Tester"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const loadFunctions = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await fetchFunctionsList();
      setFunctions(list);
      if (list.length > 0 && !selectedFunction) {
        setSelectedFunction(list[0]);
        setTestMethod(list[0].methods[0] || 'GET');
      }
    } catch {
      toast.error('Falha ao listar funções locais.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedFunction]);

  useEffect(() => {
    void loadFunctions();
  }, [loadFunctions]);

  const handleSelectFn = (fn: FunctionItem) => {
    setSelectedFunction(fn);
    setTestMethod(fn.methods[0] || 'GET');
    setExecutionResult(null);
  };

  const handleExecuteTest = async () => {
    if (!selectedFunction) return;

    setIsExecuting(true);
    setExecutionResult(null);
    const start = performance.now();

    try {
      let parsedBody: any = undefined;
      if (testMethod !== 'GET' && testBody.trim()) {
        try {
          parsedBody = JSON.parse(testBody);
        } catch {
          parsedBody = testBody;
        }
      }

      const res = await invokeFunctionTest(selectedFunction.name, testMethod, parsedBody);
      const elapsed = Math.round(performance.now() - start);
      setExecutionTime(elapsed);
      setExecutionResult(res);

      if (res.ok) {
        toast.success(`Função executada com sucesso em ${elapsed}ms!`);
      } else {
        toast.error(`Função respondeu com status ${res.status}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao invocar função.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyUrl = (endpoint: string) => {
    const fullUrl = `${window.location.origin}${endpoint}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
    toast.success('URL do endpoint copiada!');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-[calc(100vh-210px)] min-h-[550px]">
      {/* 1. Lista Lateral de Funções Locais */}
      <div className="md:col-span-1 bg-card/40 border border-border/70 rounded-xl flex flex-col overflow-hidden shadow-xs">
        <div className="p-3.5 border-b border-border/70 flex items-center justify-between bg-card/60">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-orange-500" />
            <span className="text-xs font-semibold text-foreground">
              Edge Functions Locais ({functions.length})
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadFunctions}
            disabled={isLoading}
            className="size-7 cursor-pointer"
            title="Recarregar Funções"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Carregando funções locais...
            </div>
          ) : functions.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma função local encontrada em <code className="font-mono">functions/</code>.
            </div>
          ) : (
            functions.map((fn) => {
              const isSelected = selectedFunction?.name === fn.name;
              return (
                <button
                  type="button"
                  key={fn.name}
                  onClick={() => handleSelectFn(fn)}
                  className={`w-full p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-orange-500/10 border-orange-500/30 text-foreground'
                      : 'bg-card/30 border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold font-mono flex items-center gap-1.5 text-foreground">
                      <FileCode className="size-3.5 text-orange-400" />
                      {fn.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {fn.methods.map((m) => (
                        <Badge key={m} variant="outline" className="text-[9px] px-1.5 py-0 font-mono uppercase">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                    {fn.description}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-border/70 bg-muted/20 text-[11px] text-muted-foreground">
          Declaradas em <code className="font-mono text-foreground">functions/&lt;name&gt;/index.ts</code>
        </div>
      </div>

      {/* 2. Painel de Detalhes, Teste e Invocação da Função Selecionada */}
      <div className="md:col-span-2 bg-card/40 border border-border/70 rounded-xl flex flex-col overflow-hidden shadow-xs">
        {!selectedFunction ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
            <Sparkles className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium">Selecione uma função à esquerda para inspecionar e testar.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header da Função */}
            <div className="p-4 border-b border-border/70 bg-card/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold font-mono text-foreground">
                    {selectedFunction.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                    Local Worker
                  </Badge>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyUrl(selectedFunction.endpoint)}
                  className="h-7 text-xs gap-1.5 cursor-pointer font-mono"
                >
                  {copiedEndpoint ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  <span>{copiedEndpoint ? 'Copiado!' : selectedFunction.endpoint}</span>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {selectedFunction.description}
              </p>
            </div>

            {/* Testador Interativo */}
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-3 bg-muted/30 p-3.5 rounded-xl border border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Terminal className="size-3.5 text-primary" />
                    Console de Teste da Função
                  </span>

                  <div className="flex items-center gap-2">
                    <select
                      value={testMethod}
                      onChange={(e) => setTestMethod(e.target.value)}
                      className="h-7 px-2 rounded-md bg-muted/70 border border-border/80 text-xs font-mono font-semibold text-foreground"
                    >
                      {selectedFunction.methods.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <Button
                      onClick={handleExecuteTest}
                      disabled={isExecuting}
                      className="h-7 px-3 text-xs gap-1.5 cursor-pointer bg-orange-600 hover:bg-orange-500 text-white"
                    >
                      <Play className="size-3 fill-current" />
                      <span>{isExecuting ? 'Invocando...' : 'Invocar Função'}</span>
                    </Button>
                  </div>
                </div>

                {testMethod !== 'GET' && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Corpo da Requisição (JSON / Texto)
                    </div>
                    <textarea
                      value={testBody}
                      onChange={(e) => setTestBody(e.target.value)}
                      rows={4}
                      className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Resultado da Invocação */}
              {executionResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        Resposta da Execução
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          executionResult.ok
                            ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 font-mono text-[10px]'
                            : 'text-destructive bg-destructive/10 border-destructive/20 font-mono text-[10px]'
                        }
                      >
                        Status: {executionResult.status}
                      </Badge>
                      {executionTime !== null && (
                        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground gap-1">
                          <Clock className="size-2.5" />
                          {executionTime}ms
                        </Badge>
                      )}
                    </div>
                  </div>

                  <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 overflow-x-auto max-h-64 select-all">
                    {typeof executionResult.data === 'object'
                      ? JSON.stringify(executionResult.data, null, 2)
                      : String(executionResult.data)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
