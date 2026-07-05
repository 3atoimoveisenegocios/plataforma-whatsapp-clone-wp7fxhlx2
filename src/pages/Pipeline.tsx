import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getContacts } from '@/services/contacts'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

export default function Pipeline() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    if (!user) return
    try {
      const data = await getContacts(user.id)
      setContacts(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  useRealtime(
    'whatsapp_contacts',
    () => {
      loadData()
    },
    !!user,
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50/50">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
      </div>
    )
  }

  const columns = [
    { id: 'in_conversation', title: 'Em Conversa' },
    { id: 'waiting', title: 'Aguardando' },
    { id: 'resolved', title: 'Resolvido' },
    { id: 'lost', title: 'Perdido' },
  ]

  const getStatus = (c: any) => c.status || 'in_conversation'

  return (
    <div className="h-full flex flex-col bg-zinc-50/30">
      <PageHeader
        title="Pipeline"
        description="Acompanhe o fluxo e o status dos seus contatos em um ambiente organizado."
      />

      <div className="flex-1 overflow-x-auto px-10 pb-10">
        <div className="flex h-full min-w-max gap-6 items-start">
          {columns.map((col) => {
            const colContacts = contacts.filter((c) => getStatus(c) === col.id)

            return (
              <div
                key={col.id}
                className="flex flex-col w-[320px] max-h-full shrink-0 rounded-[16px] bg-zinc-100/40 border border-zinc-200/50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                  <h3 className="font-medium text-[14px] text-zinc-700">{col.title}</h3>
                  <div className="flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-white border border-zinc-200 shadow-sm text-[11px] font-medium text-zinc-500">
                    {colContacts.length}
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="flex flex-col gap-3 px-4 pb-6">
                    {colContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="animate-in fade-in slide-in-from-bottom-2 duration-300 group flex flex-col p-4 bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] border border-zinc-100 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] hover:border-zinc-200 transition-all cursor-default"
                      >
                        <div className="flex justify-between items-start mb-2.5 gap-2">
                          <span className="font-medium text-[14px] text-zinc-800 line-clamp-1 tracking-tight mt-0.5">
                            {contact.name || 'Contato sem nome'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 rounded-full transition-colors shrink-0 -mr-1 -mt-1"
                            onClick={() => navigate('/inbox', { state: { contactId: contact.id } })}
                            title="Abrir no Inbox"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between mt-auto">
                          <span className="text-[13px] text-zinc-400 font-light">
                            {contact.phone || contact.remote_jid?.split('@')[0]}
                          </span>

                          <span className="text-[11px] text-zinc-400 font-medium">
                            {contact.last_message_at
                              ? formatDistanceToNow(
                                  parseISO(contact.last_message_at.replace(' ', 'T')),
                                  { addSuffix: true, locale: ptBR },
                                )
                              : 'Novo'}
                          </span>
                        </div>
                      </div>
                    ))}

                    {colContacts.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10">
                        <span className="text-[13px] font-light text-zinc-400">Nenhum contato</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
