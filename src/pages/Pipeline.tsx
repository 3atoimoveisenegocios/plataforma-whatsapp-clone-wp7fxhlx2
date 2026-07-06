import { useEffect, useState, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getContacts, updateContactStatus } from '@/services/contacts'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, MessageSquare, MoveHorizontal, Check } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const COLUMNS = [
  { id: 'em_conversa', title: 'Em Conversa' },
  { id: 'aguardando', title: 'Aguardando' },
  { id: 'resolvido', title: 'Resolvido' },
  { id: 'perdido', title: 'Perdido' },
]

const getStatus = (c: any) => c.status || 'em_conversa'

export default function Pipeline() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const data = await getContacts(user.id)
      setContacts(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtime(
    'whatsapp_contacts',
    () => {
      loadData()
    },
    !!user,
  )

  const handleStatusChange = async (contactId: string, newStatus: string) => {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, status: newStatus } : c)))
    try {
      await updateContactStatus(contactId, newStatus)
    } catch (e) {
      loadData()
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50/50">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50/30">
      <PageHeader
        title="Pipeline"
        description="Acompanhe o fluxo e o status dos seus contatos em um ambiente organizado."
      />
      <div className="flex-1 overflow-x-auto px-10 pb-10">
        <div className="flex h-full min-w-max gap-6 items-start">
          {COLUMNS.map((col) => {
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
                        className="animate-in fade-in slide-in-from-bottom-2 duration-300 group flex flex-col p-4 bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] border border-zinc-100 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] hover:border-zinc-200 transition-all"
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
                        <div className="flex items-center justify-between mt-auto mb-2">
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-full text-[11px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-600"
                            >
                              <MoveHorizontal className="h-3 w-3 mr-1.5" />
                              Mover
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[260px]">
                            <DropdownMenuLabel className="text-[12px]">
                              Mudar status
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {COLUMNS.map((c) => (
                              <DropdownMenuItem
                                key={c.id}
                                onClick={() => handleStatusChange(contact.id, c.id)}
                                disabled={getStatus(contact) === c.id}
                                className="text-[13px] cursor-pointer"
                              >
                                {c.title}
                                {getStatus(contact) === c.id && (
                                  <Check className="h-3 w-3 ml-auto" />
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
