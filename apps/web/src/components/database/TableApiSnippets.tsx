import React, { useState, useMemo } from 'react';
import { Copy, Check, Code2, Radio, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TableApiSnippetsProps {
  tableName: string;
  anonKey?: string;
  originUrl?: string;
}

type SnippetType = 'select' | 'insert' | 'update' | 'delete' | 'realtime' | 'sdk';

export const TableApiSnippets: React.FC<TableApiSnippetsProps> = ({
  tableName,
  anonKey = 'ek_anon_key_here',
  originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com',
}) => {
  const [activeSnippet, setActiveSnippet] = useState<SnippetType>('sdk');
  const [copied, setCopied] = useState(false);

  const snippets = useMemo(() => {
    const wsUrl = originUrl.replace(/^http/, 'ws');

    return {
      sdk: `// Instale o cliente: npm i @edgekit/client
import { createClient } from '@edgekit/client';

const edgekit = createClient({
  baseUrl: '${originUrl}',
  apiKey: '${anonKey}',
});

// 1. Consultar com filtros avançados
const { data, count, error } = await edgekit
  .from('${tableName}')
  .select('*')
  .filter('status', 'in', ['active', 'pending'])
  .order('created_at', { ascending: false })
  .limit(20);

// 2. Inserir registro (user_id é associado automaticamente pelo RLS)
const { data: created } = await edgekit
  .from('${tableName}')
  .insert({ title: 'Exemplo' });`,

      select: `// Consultar registros com filtros e ordenação via Fetch
const res = await fetch('${originUrl}/api/v1/db/${tableName}?limit=20&order=created_at.desc', {
  headers: {
    'apikey': '${anonKey}',
    // Se a tabela exigir autenticação ou RLS de Dono:
    // 'Authorization': 'Bearer ' + userSessionToken,
  }
});

const { data, meta } = await res.json();
console.log('Registros retornados:', data);`,

      insert: `// Criar novo registro
const res = await fetch('${originUrl}/api/v1/db/${tableName}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': '${anonKey}',
    'Authorization': 'Bearer ' + userSessionToken, // Token do usuário
  },
  body: JSON.stringify({
    title: 'Meu Novo Item',
    // O owner_id / user_id é injetado pelo motor de autorização
  })
});

const { data } = await res.json();
console.log('Registro criado:', data);`,

      update: `// Atualizar registro por ID
const res = await fetch('${originUrl}/api/v1/db/${tableName}/RECORD_ID', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'apikey': '${anonKey}',
    'Authorization': 'Bearer ' + userSessionToken,
  },
  body: JSON.stringify({
    title: 'Título Modificado'
  })
});

const { data } = await res.json();
console.log('Registro atualizado:', data);`,

      delete: `// Excluir registro por ID
const res = await fetch('${originUrl}/api/v1/db/${tableName}/RECORD_ID', {
  method: 'DELETE',
  headers: {
    'apikey': '${anonKey}',
    'Authorization': 'Bearer ' + userSessionToken,
  }
});

const result = await res.json();
console.log('Registro removido com sucesso!');`,

      realtime: `// Escutar eventos CDC em tempo real via WebSocket nativo
const ws = new WebSocket(
  '${wsUrl}/api/v1/realtime/db:${tableName}/ws?apikey=${anonKey}'
);

ws.onopen = () => {
  console.log('⚡ Conectado ao canal em tempo real de ${tableName}');
};

ws.onmessage = (event) => {
  const { event: action, payload } = JSON.parse(event.data);
  // action pode ser 'INSERT', 'UPDATE' ou 'DELETE'
  console.log('Evento CDC recebido:', action, payload);
};`,
    };
  }, [tableName, anonKey, originUrl]);

  const copyCode = () => {
    navigator.clipboard.writeText(snippets[activeSnippet]);
    setCopied(true);
    toast.success('Snippet copiado com sucesso!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-card/40 border border-border/70 p-2.5 rounded-xl">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={activeSnippet === 'sdk' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSnippet('sdk')}
            className="h-7 text-xs px-2.5 cursor-pointer gap-1.5"
          >
            <Code2 className="size-3.5" />
            <span>Edgekit Client (SDK)</span>
          </Button>

          <Button
            variant={activeSnippet === 'select' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSnippet('select')}
            className="h-7 text-xs px-2.5 cursor-pointer gap-1.5"
          >
            <Globe className="size-3.5" />
            <span>GET (Query)</span>
          </Button>

          <Button
            variant={activeSnippet === 'insert' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSnippet('insert')}
            className="h-7 text-xs px-2.5 cursor-pointer gap-1.5"
          >
            <span className="text-emerald-500 font-bold font-mono text-[10px]">POST</span>
            <span>Insert</span>
          </Button>

          <Button
            variant={activeSnippet === 'update' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSnippet('update')}
            className="h-7 text-xs px-2.5 cursor-pointer gap-1.5"
          >
            <span className="text-amber-500 font-bold font-mono text-[10px]">PATCH</span>
            <span>Update</span>
          </Button>

          <Button
            variant={activeSnippet === 'delete' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSnippet('delete')}
            className="h-7 text-xs px-2.5 cursor-pointer gap-1.5"
          >
            <span className="text-rose-500 font-bold font-mono text-[10px]">DEL</span>
            <span>Delete</span>
          </Button>

          <Button
            variant={activeSnippet === 'realtime' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSnippet('realtime')}
            className="h-7 text-xs px-2.5 cursor-pointer gap-1.5"
          >
            <Radio className="size-3.5 text-orange-500" />
            <span>CDC Realtime (WS)</span>
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={copyCode}
          className="h-7 text-xs px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
        </Button>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-border/70 bg-zinc-950 p-4 font-mono text-xs text-zinc-200">
        <pre className="overflow-x-auto whitespace-pre leading-relaxed">
          <code>{snippets[activeSnippet]}</code>
        </pre>
      </div>
    </div>
  );
};
