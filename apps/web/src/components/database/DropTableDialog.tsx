import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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

interface DropTableDialogProps {
  tableName: string | null;
  onClose: () => void;
  onConfirmDrop: (tableName: string) => Promise<void>;
}

export const DropTableDialog: React.FC<DropTableDialogProps> = ({
  tableName,
  onClose,
  onConfirmDrop,
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isDropping, setIsDropping] = useState(false);

  const isConfirmed = tableName !== null && confirmationInput.trim() === tableName;

  const handleDrop = async () => {
    if (!tableName || !isConfirmed) return;
    setIsDropping(true);
    try {
      await onConfirmDrop(tableName);
      toast.success(`Tabela "${tableName}" excluída com sucesso.`);
      setConfirmationInput('');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir tabela.');
    } finally {
      setIsDropping(false);
    }
  };

  return (
    <Dialog open={Boolean(tableName)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            <DialogTitle>Excluir Tabela?</DialogTitle>
          </div>
          <DialogDescription>
            Esta ação é irreversível. A tabela <strong className="font-mono text-foreground">{tableName}</strong> e todos os seus registros serão permanentemente destruídos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Para confirmar, digite o nome exato da tabela abaixo:
          </p>
          <input
            type="text"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            placeholder={tableName || ''}
            className="w-full h-8.5 rounded-lg bg-muted/40 border border-destructive/40 px-3 text-xs text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-destructive"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDropping}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDrop}
            disabled={!isConfirmed || isDropping}
            className="cursor-pointer"
          >
            {isDropping ? 'Excluindo...' : 'Excluir Tabela Permanentemente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
