import { toast } from 'sonner'
import { deleteAiAgent } from '@/services/ai_agents'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DeleteAgentDialogProps {
  agent: any
  onClose: () => void
}

export function DeleteAgentDialog({ agent, onClose }: DeleteAgentDialogProps) {
  const handleDelete = async () => {
    if (!agent) return
    try {
      await deleteAiAgent(agent.id)
      toast.success('Agente removido com sucesso!')
      onClose()
    } catch (e) {
      toast.error('Erro ao excluir o agente.')
    }
  }

  return (
    <AlertDialog open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir agente</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o agente <strong>{agent?.name}</strong>? Esta ação não
            pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
