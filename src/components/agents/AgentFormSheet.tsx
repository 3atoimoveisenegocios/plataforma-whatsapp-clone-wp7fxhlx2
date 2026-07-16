import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { useAuth } from '@/hooks/use-auth'
import { createAiAgent, updateAiAgent } from '@/services/ai_agents'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const DAYS_OF_WEEK = [
  { value: 'domingo', label: 'Domingo' },
  { value: 'segunda', label: 'Segunda' },
  { value: 'terca', label: 'Terça' },
  { value: 'quarta', label: 'Quarta' },
  { value: 'quinta', label: 'Quinta' },
  { value: 'sexta', label: 'Sexta' },
  { value: 'sabado', label: 'Sábado' },
]

const formSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  provider: z.enum(['gemini', 'openai'], { required_error: 'Provedor é obrigatório' }),
  api_key: z.string().min(1, 'Chave da API é obrigatória'),
  system_prompt: z.string().min(1, 'Prompt do sistema é obrigatório'),
  active: z.boolean().default(true),
  business_hours_enabled: z.boolean().default(false),
  operating_days: z.array(z.string()).default([]),
  start_time: z.string().default('09:00'),
  end_time: z.string().default('18:00'),
  out_of_hours_message: z.string().default(''),
})

type AgentFormValues = z.infer<typeof formSchema>

interface AgentFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: any
}

export function AgentFormSheet({ open, onOpenChange, agent }: AgentFormSheetProps) {
  const { user } = useAuth()
  const [instances, setInstances] = useState<any[]>([])

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      provider: 'openai',
      api_key: '',
      system_prompt: '',
      active: true,
      business_hours_enabled: false,
      operating_days: [],
      start_time: '09:00',
      end_time: '18:00',
      out_of_hours_message: '',
    },
  })

  useEffect(() => {
    const loadInstances = async () => {
      try {
        const data = await pb.collection('whatsapp_instances').getFullList()
        setInstances(data)
      } catch (e) {
        console.error(e)
      }
    }
    if (open) loadInstances()
  }, [open])

  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name,
        description: agent.description || '',
        provider: agent.provider || 'openai',
        api_key: agent.api_key || '',
        system_prompt: agent.system_prompt,
        active: agent.active,
        business_hours_enabled: agent.business_hours_enabled || false,
        operating_days: agent.operating_days || [],
        start_time: agent.start_time || '09:00',
        end_time: agent.end_time || '18:00',
        out_of_hours_message: agent.out_of_hours_message || '',
      })
    } else {
      form.reset({
        name: '',
        description: '',
        provider: 'openai',
        api_key: '',
        system_prompt: '',
        active: true,
        business_hours_enabled: false,
        operating_days: [],
        start_time: '09:00',
        end_time: '18:00',
        out_of_hours_message: '',
      })
    }
  }, [agent, form, open])

  const toggleDay = (day: string) => {
    const current = form.getValues('operating_days') || []
    const updated = current.includes(day)
      ? current.filter((d: string) => d !== day)
      : [...current, day]
    form.setValue('operating_days', updated)
  }

  const onSubmit = async (values: AgentFormValues) => {
    if (!user) return
    try {
      const instanceId = agent?.instance_id || (instances.length > 0 ? instances[0].id : null)

      if (!instanceId) {
        toast.error('Nenhuma instância conectada. Conecte o WhatsApp primeiro.')
        return
      }

      const data = { ...values, user_id: user.id, instance_id: instanceId }

      if (agent) {
        await updateAiAgent(agent.id, data)
        toast.success('Agente atualizado com sucesso!')
      } else {
        await createAiAgent(data)
        toast.success('Agente criado com sucesso!')
      }
      onOpenChange(false)
    } catch (error) {
      const errors = extractFieldErrors(error)
      if (Object.keys(errors).length > 0) {
        Object.entries(errors).forEach(([field, msg]) =>
          form.setError(field as any, { message: msg }),
        )
      } else {
        toast.error('Ocorreu um erro ao salvar o agente.')
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto bg-white">
        <SheetHeader className="space-y-1 pb-2">
          <SheetTitle className="text-[18px] font-semibold tracking-tight text-zinc-900">
            {agent ? 'Editar Agente' : 'Novo Agente'}
          </SheetTitle>
          <SheetDescription className="text-[13.5px] text-zinc-500">
            Configure as instruções de IA para automação de conversas.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Agente</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Assistente de Vendas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Propósito deste agente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provedor de IA</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um provedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chave da API</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="system_prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Prompt (Instruções)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Você é um assistente virtual de vendas..."
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl bg-zinc-50/60 ring-1 ring-zinc-200/70 p-4 mt-2">
                  <div className="space-y-0.5">
                    <FormLabel className="text-[14px] font-medium text-zinc-900">
                      Agente Ativo
                    </FormLabel>
                    <p className="text-[12.5px] text-zinc-500">
                      Quando ligado, o agente responde automaticamente.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="data-[state=checked]:bg-violet-600"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="business_hours_enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl bg-zinc-50/60 ring-1 ring-zinc-200/70 p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-[14px] font-medium text-zinc-900">
                      Horário de Funcionamento
                    </FormLabel>
                    <p className="text-[12.5px] text-zinc-500">
                      Responde com mensagem automática fora do horário.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="data-[state=checked]:bg-violet-600"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {form.watch('business_hours_enabled') && (
              <div className="space-y-4 rounded-xl bg-zinc-50/60 ring-1 ring-zinc-200/70 p-4">
                <div>
                  <FormLabel className="text-[14px] font-medium text-zinc-900 mb-3 block">
                    Dias de Atendimento
                  </FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const checked = (form.watch('operating_days') || []).includes(day.value)
                      return (
                        <label
                          key={day.value}
                          className="flex items-center gap-2 cursor-pointer text-[13px] text-zinc-700"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleDay(day.value)}
                          />
                          {day.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Início</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fim</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="out_of_hours_message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem fora do horário</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Olá! No momento estamos fora do horário de atendimento..."
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-600/20 h-9 px-4 text-[13px] font-medium"
              >
                {form.formState.isSubmitting ? 'Salvando...' : 'Salvar Agente'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
