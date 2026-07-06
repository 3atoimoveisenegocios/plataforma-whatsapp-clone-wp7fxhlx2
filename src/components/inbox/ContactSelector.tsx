import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronsUpDown, UserRound } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'

interface ContactSelectorProps {
  selectedContact: any | null
  onSelect: (contact: any | null) => void
}

export function ContactSelector({ selectedContact, onSelect }: ContactSelectorProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<any[]>([])

  const loadContacts = useCallback(async () => {
    if (!user) return
    try {
      const data = await pb.collection('whatsapp_contacts').getFullList({
        filter: `user_id = "${user.id}"`,
        sort: '-updated',
      })
      setContacts(data)
    } catch (e) {
      console.error(e)
    }
  }, [user])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 text-[13.5px] font-medium border-zinc-200/70 hover:bg-zinc-50"
        >
          {selectedContact ? (
            <span className="flex items-center gap-2 truncate">
              <UserRound className="h-3.5 w-3.5 text-violet-500 shrink-0" />
              <span className="truncate">
                {selectedContact.name || selectedContact.phone || 'Contato'}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-zinc-400">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              Selecione o Contato
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar contato..." />
          <CommandList>
            <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
            <CommandGroup>
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.name || ''} ${contact.phone || ''} ${contact.remote_jid || ''}`}
                  onSelect={() => {
                    onSelect(contact.id === selectedContact?.id ? null : contact)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5',
                      selectedContact?.id === contact.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium">{contact.name || 'Sem nome'}</span>
                    {contact.phone && (
                      <span className="text-[11px] text-zinc-400">{contact.phone}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
