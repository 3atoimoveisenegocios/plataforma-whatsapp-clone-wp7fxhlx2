import { useEffect, useState } from 'react'
import { Plus, Bot, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentFormSheet } from '@/components/agents/AgentFormSheet'
import { DeleteAgentDialog } from '@/components/agents/DeleteAgentDialog'
import { getAiAgents, updateAiAgent } from '@/services/ai_agents'
import { getInstances } from '@/services/whatsapp'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function Agents() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<any[]>([])
  const [instances, setInstances] = useState<any[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)
  const [agentToDelete, setAgentToDelete] = useState<any>(null)

  const loadData = async () => {
    try {
      const [agentsData, instancesData] = await Promise.all([getAiAgents(), getInstances()])
      setAgents(agentsData)
      setInstances(instancesData)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (user) loadData()
  }, [user])

  useRealtime('ai_agents', () => loadData(), !!user)
  useRealtime('whatsapp_instances', () => loadData(), !!user)

  const handleToggleActive = async (agent: any, newStatus: boolean) => {
    try {
      // Optimistic update
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, active: newStatus } : a)))
      await updateAiAgent(agent.id, { active: newStatus })
      toast.success(`Agente ${newStatus ? 'ativado' : 'desativado'} com sucesso.`)
    } catch (error) {
      // Revert on error
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, active: !newStatus } : a)))
      toast.error('Erro ao atualizar status do agente.')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/60 p-4 md:p-8 flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Agentes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Configure assistentes que respondem automaticamente as conversas.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-block">
              <Button
                disabled={instances.length === 0}
                onClick={() => {
                  setSelectedAgent(null)
                  setIsFormOpen(true)
                }}
                className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-600/20 h-9 px-3.5 text-[13px] font-medium"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Novo Agente
              </Button>
            </div>
          </TooltipTrigger>
          {instances.length === 0 && (
            <TooltipContent>Conecte uma instância do WhatsApp primeiro.</TooltipContent>
          )}
        </Tooltip>
      </div>

      <div className="pb-10">
        {agents.length === 0 ? (
          <div className="rounded-xl bg-white ring-1 ring-zinc-200/70 shadow-sm p-16 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <Bot className="h-5 w-5 text-violet-500" />
            </div>
            <p className="text-[14px] font-medium text-zinc-900">Nenhum agente configurado</p>
            <p className="text-[13px] text-zinc-500 mt-1 max-w-sm">
              {instances.length === 0
                ? 'Conecte uma instância do WhatsApp na aba Conexões para poder criar seu primeiro agente.'
                : 'Crie seu primeiro agente para automatizar conversas.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white rounded-xl ring-1 ring-zinc-200/70 shadow-sm p-5 flex flex-col hover:bg-zinc-50/50 transition-colors"
              >
                <div className="flex justify-between items-start mb-3 gap-3">
                  <h3
                    className="font-semibold text-zinc-900 truncate text-[15px]"
                    title={agent.name}
                  >
                    {agent.name}
                  </h3>
                  {agent.provider === 'openai' ? (
                    <span className="shrink-0 inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                      OpenAI
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                      Gemini
                    </span>
                  )}
                </div>

                <div className="text-[13px] text-zinc-500 line-clamp-3 mb-4 flex-1">
                  {agent.description || agent.system_prompt}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-100 mt-auto">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={agent.active}
                      onCheckedChange={(checked) => handleToggleActive(agent, checked)}
                      className="data-[state=checked]:bg-violet-600"
                    />
                    <span
                      className={cn(
                        'text-[12px] font-medium',
                        agent.active ? 'text-violet-700' : 'text-zinc-500',
                      )}
                    >
                      {agent.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedAgent(agent)
                        setIsFormOpen(true)
                      }}
                      className="h-8 w-8 p-0 text-zinc-500 hover:text-violet-700 hover:bg-violet-50"
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Editar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAgentToDelete(agent)}
                      className="h-8 w-8 p-0 text-zinc-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Excluir</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AgentFormSheet open={isFormOpen} onOpenChange={setIsFormOpen} agent={selectedAgent} />
      <DeleteAgentDialog agent={agentToDelete} onClose={() => setAgentToDelete(null)} />
    </div>
  )
}
