import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { format } from 'date-fns'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Sparkles, AlertCircle, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

type AiLogMessage = {
  id: string
  contact_id: string
  remote_jid: string
  direction: string
  body: string
  automation_type: string
  ai_status?: string
  ai_reason?: string
  ai_session_id?: string
  ai_turn_id?: string
  ai_source_ids?: string
  ai_trigger_body?: string
  sent_at?: string
  created?: string
}

type AiContact = { id: string; name?: string; phone?: string; remote_jid?: string }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  enviada: {
    label: 'Enviada',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  falhou: {
    label: 'Falhou',
    className: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  descartada: {
    label: 'Descartada (obsoleta)',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
}

function statusFor(msg: AiLogMessage) {
  if (msg.ai_status && STATUS_CONFIG[msg.ai_status]) return STATUS_CONFIG[msg.ai_status]
  if (msg.automation_type === 'ai_response') return STATUS_CONFIG.enviada
  if (msg.automation_type === 'ai_error')
    return { label: 'Falhou', className: STATUS_CONFIG.falhou.className }
  if (msg.automation_type === 'ai_log') return STATUS_CONFIG.descartada
  return {
    label: msg.automation_type || '—',
    className: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
  }
}

function firstLines(text: string | undefined, maxChars = 220) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > maxChars ? clean.slice(0, maxChars) + '…' : clean
}

function roundTime(msg: AiLogMessage) {
  const raw = msg.sent_at || msg.created
  if (!raw) return '—'
  try {
    return format(new Date(raw.replace(' ', 'T')), "dd/MM/yyyy 'às' HH:mm:ss")
  } catch {
    return raw
  }
}

function parseSourceIds(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string' && x) : []
  } catch {
    return []
  }
}

export function AiLogsPanel({ contacts }: { contacts: AiContact[] }) {
  const [logs, setLogs] = useState<AiLogMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const contactMap = new Map<string, AiContact>()
  for (const c of contacts) contactMap.set(c.id, c)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const list = await pb.collection('whatsapp_messages').getFullList({
        filter: "automation_type ~ 'ai'",
        sort: '-created',
      })
      setLogs(list as unknown as AiLogMessage[])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const contactName = (msg: AiLogMessage) => {
    const c = contactMap.get(msg.contact_id)
    return c?.name || c?.phone || msg.remote_jid || 'Contato'
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-zinc-200/70 bg-white flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold tracking-tight text-zinc-900">Logs da IA</p>
          <p className="text-[12px] text-zinc-500">
            Rodadas da assistente Iris — desfecho de cada resposta automática
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-500 hover:text-zinc-900 shrink-0"
          onClick={loadLogs}
          disabled={loading}
          title="Atualizar logs"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <p className="text-sm font-medium text-zinc-700">Falha ao carregar os logs</p>
            <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={loadLogs}>
              Tentar novamente
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
              <Bot className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-700">Nenhuma rodada da IA ainda</p>
            <p className="text-xs text-zinc-500 mt-1">
              Cada resposta automática aparece aqui com o desfecho
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {logs.map((msg) => {
              const status = statusFor(msg)
              const sourceIds = parseSourceIds(msg.ai_source_ids)
              const isSent = (msg.ai_status || 'enviada') === 'enviada'
              return (
                <div
                  key={msg.id}
                  className="rounded-lg border border-zinc-200/70 bg-white p-3 hover:bg-zinc-50/60 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset whitespace-nowrap',
                        status.className,
                      )}
                    >
                      {status.label}
                    </span>
                    <span className="text-[12px] font-medium text-zinc-800 truncate min-w-0">
                      {contactName(msg)}
                    </span>
                    <span className="text-[11px] text-zinc-400 ml-auto whitespace-nowrap">
                      {roundTime(msg)}
                    </span>
                  </div>

                  {!isSent && msg.ai_reason && (
                    <p className="mt-2 text-[12px] text-red-600 bg-red-50/60 rounded px-2 py-1 break-words">
                      Motivo: {firstLines(msg.ai_reason, 300)}
                    </p>
                  )}

                  {msg.ai_trigger_body && (
                    <p className="mt-2 text-[12px] text-zinc-600 break-words">
                      <span className="text-zinc-400 font-medium">Recebido: </span>
                      {firstLines(msg.ai_trigger_body)}
                    </p>
                  )}

                  {isSent && (
                    <p className="mt-1.5 text-[12px] text-zinc-600 break-words">
                      <span className="text-zinc-400 font-medium">Resposta: </span>
                      {firstLines(msg.body)}
                    </p>
                  )}

                  {(msg.ai_session_id || msg.ai_turn_id) && (
                    <p
                      className="mt-1.5 text-[11px] text-zinc-400 truncate"
                      title="Origem na OpenAI"
                    >
                      Sessão: {msg.ai_session_id || '—'}
                      {msg.ai_turn_id ? ` · Turno: ${msg.ai_turn_id}` : ''}
                    </p>
                  )}

                  {sourceIds.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-zinc-400 truncate">
                      Mensagens-fonte: {sourceIds.join(', ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
