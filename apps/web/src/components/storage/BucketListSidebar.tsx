import React, { useState } from 'react';
import {
  HardDrive,
  Plus,
  Lock,
  Globe,
  Sliders,
  Shield,
  Search,
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

interface BucketListSidebarProps {
  buckets: any[];
  selectedBucket: string;
  onSelectBucket: (name: string) => void;
  onCreateBucket: (data: any) => Promise<void>;
  onUpdateBucket: (name: string, data: any) => Promise<void>;
}

export const BucketListSidebar: React.FC<BucketListSidebarProps> = ({
  buckets,
  selectedBucket,
  onSelectBucket,
  onCreateBucket,
  onUpdateBucket,
}) => {
  const [filterText, setFilterText] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(false);
  const [newMaxSizeMb, setNewMaxSizeMb] = useState(10);
  const [newMimeTypes, setNewMimeTypes] = useState('*');

  // Policy Edit State
  const [editingBucket, setEditingBucket] = useState<any | null>(null);
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editMaxSizeMb, setEditMaxSizeMb] = useState(10);
  const [editReadRule, setEditReadRule] = useState('public');
  const [editWriteRule, setEditWriteRule] = useState('authenticated');

  const filteredBuckets = buckets.filter((b) =>
    (b.name || '').toLowerCase().includes(filterText.toLowerCase()),
  );

  const handleOpenEdit = (bucket: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBucket(bucket);
    setEditIsPublic(Boolean(bucket.isPublic));
    setEditMaxSizeMb(Math.round((bucket.maxSizeBytes || 10485760) / (1024 * 1024)));
    setEditReadRule(bucket.readRule || 'public');
    setEditWriteRule(bucket.writeRule || 'authenticated');
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newBucketName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!cleanName) {
      toast.error('Informe um nome válido para o bucket.');
      return;
    }

    try {
      await onCreateBucket({
        name: cleanName,
        isPublic: newIsPublic,
        maxSizeBytes: newMaxSizeMb * 1024 * 1024,
        allowedMimeTypes: newMimeTypes.split(',').map((s) => s.trim()),
        readRule: newIsPublic ? 'public' : 'authenticated',
        writeRule: 'authenticated',
      });
      toast.success(`Bucket "${cleanName}" criado com sucesso!`);
      setIsCreateOpen(false);
      setNewBucketName('');
      onSelectBucket(cleanName);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar bucket.');
    }
  };

  const submitUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBucket) return;

    try {
      await onUpdateBucket(editingBucket.name, {
        isPublic: editIsPublic,
        maxSizeBytes: editMaxSizeMb * 1024 * 1024,
        readRule: editReadRule,
        writeRule: editWriteRule,
      });
      toast.success(`Políticas do bucket "${editingBucket.name}" atualizadas!`);
      setEditingBucket(null);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar políticas.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-card/40 border border-border/70 rounded-xl overflow-hidden shadow-xs">
      {/* Top Header */}
      <div className="p-3 border-b border-border/70 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <HardDrive className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Buckets R2</h3>
              <p className="text-[10px] text-muted-foreground">{buckets.length} bucket(s)</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-7 text-xs px-2.5 gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-3.5" />
            <span>Novo</span>
          </Button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar buckets..."
            className="w-full h-7.5 pl-8 pr-2.5 rounded-lg bg-muted/50 border border-border/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Lista de Buckets */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredBuckets.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhum bucket encontrado.
          </div>
        ) : (
          filteredBuckets.map((b) => {
            const isSelected = selectedBucket === b.name;
            const isPub = Boolean(b.isPublic);

            return (
              <div
                key={b.name}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  isSelected
                    ? 'bg-purple-500/10 text-purple-500 font-medium border border-purple-500/20'
                    : 'text-foreground hover:bg-muted/60 border border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectBucket(b.name)}
                  className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer py-0.5"
                >
                  {isPub ? (
                    <Globe className="size-3.5 shrink-0 text-blue-500" />
                  ) : (
                    <Lock className="size-3.5 shrink-0 text-amber-500" />
                  )}
                  <span className="truncate">{b.name}</span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-4 border-border/70 text-muted-foreground uppercase"
                  >
                    {isPub ? 'Público' : 'Privado'}
                  </Badge>

                  <button
                    type="button"
                    aria-label={`Configurar políticas do bucket ${b.name}`}
                    onClick={(e) => handleOpenEdit(b, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity cursor-pointer rounded-sm hover:bg-muted"
                  >
                    <Sliders className="size-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Criar Bucket */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Novo Bucket R2</DialogTitle>
            <DialogDescription>
              Configure o nome e os limites de armazenamento para este bucket no Cloudflare R2.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3.5 py-2">
            <div className="space-y-1">
              <label htmlFor="create-bucket-name" className="text-xs font-semibold text-foreground">Nome do Bucket</label>
              <input
                id="create-bucket-name"
                type="text"
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder="ex: avatars, documentos, notas-fiscais"
                required
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-bucket-max-size" className="text-xs font-semibold text-foreground">Tamanho Máximo por Arquivo (MB)</label>
              <input
                id="create-bucket-max-size"
                type="number"
                min={1}
                max={500}
                value={newMaxSizeMb}
                onChange={(e) => setNewMaxSizeMb(Number(e.target.value))}
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-bucket-mimes" className="text-xs font-semibold text-foreground">MIME Types Permitidos (separados por vírgula)</label>
              <input
                id="create-bucket-mimes"
                type="text"
                value={newMimeTypes}
                onChange={(e) => setNewMimeTypes(e.target.value)}
                placeholder="* ou image/*, application/pdf"
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="create-bucket-public"
                type="checkbox"
                checked={newIsPublic}
                onChange={(e) => setNewIsPublic(e.target.checked)}
                className="rounded-sm accent-primary cursor-pointer"
              />
              <label htmlFor="create-bucket-public" className="text-xs text-foreground cursor-pointer select-none">
                Bucket Público (arquivos acessíveis por qualquer visitante sem assinatura)
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar Bucket</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Políticas do Bucket */}
      <Dialog open={Boolean(editingBucket)} onOpenChange={(open) => !open && setEditingBucket(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-purple-500" />
              <DialogTitle>Políticas do Bucket "{editingBucket?.name}"</DialogTitle>
            </div>
            <DialogDescription>
              Ajuste regras de acesso, tamanho e segurança para este bucket.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitUpdatePolicy} className="space-y-3.5 py-2">
            <div className="flex items-center gap-2">
              <input
                id="edit-bucket-public"
                type="checkbox"
                checked={editIsPublic}
                onChange={(e) => setEditIsPublic(e.target.checked)}
                className="rounded-sm accent-primary cursor-pointer"
              />
              <label htmlFor="edit-bucket-public" className="text-xs text-foreground cursor-pointer select-none">
                Visibilidade Pública (Permite acesso sem autenticação)
              </label>
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-bucket-max-size" className="text-xs font-semibold text-foreground">Limite por Arquivo (MB)</label>
              <input
                id="edit-bucket-max-size"
                type="number"
                min={1}
                max={500}
                value={editMaxSizeMb}
                onChange={(e) => setEditMaxSizeMb(Number(e.target.value))}
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-bucket-read-rule" className="text-xs font-semibold text-foreground">Regra de Leitura</label>
              <select
                id="edit-bucket-read-rule"
                value={editReadRule}
                onChange={(e) => setEditReadRule(e.target.value)}
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="public">Público (Qualquer visitante ou app)</option>
                <option value="authenticated">Autenticado (Apenas usuários logados)</option>
                <option value="service_only">Apenas Service Role / Admin</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-bucket-write-rule" className="text-xs font-semibold text-foreground">Regra de Escrita (Upload)</label>
              <select
                id="edit-bucket-write-rule"
                value={editWriteRule}
                onChange={(e) => setEditWriteRule(e.target.value)}
                className="w-full h-8.5 rounded-lg bg-muted/40 border border-border/70 px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="authenticated">Autenticado (Usuários logados)</option>
                <option value="service_only">Apenas Service Role / Admin</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingBucket(null)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar Políticas</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
