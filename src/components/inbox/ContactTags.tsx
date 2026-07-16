import { useState, useCallback } from 'react'
import { Tag } from 'lucide-react'
import { TagsInput } from '@/components/inbox/TagsInput'
import { updateContactTags } from '@/services/whatsapp'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

interface ContactTagsProps {
  contact: any
  onUpdate?: (tags: string[]) => void
}

export function ContactTags({ contact, onUpdate }: ContactTagsProps) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const { toast } = useToast()

  const tags: string[] = Array.isArray(contact.tags) ? contact.tags : []

  const handleSave = useCallback(
    async (newTags: string[]) => {
      setUpdating(true)
      try {
        await updateContactTags(contact.id, newTags)
        onUpdate?.(newTags)
      } catch (e) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar tags' })
      } finally {
        setUpdating(false)
      }
    },
    [contact.id, onUpdate, toast],
  )

  return (
    <Popover open={expanded} onOpenChange={setExpanded}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 shrink-0" title="Tags">
          <Tag className="h-4 w-4 text-zinc-500" />
          <span className="hidden sm:inline text-zinc-600 font-medium text-xs">Tags</span>
          {tags.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
              {tags.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-zinc-900">Tags do Contato</h4>
          <div className={cn('transition-opacity', updating && 'opacity-50')}>
            <TagsInput tags={tags} onChange={handleSave} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
