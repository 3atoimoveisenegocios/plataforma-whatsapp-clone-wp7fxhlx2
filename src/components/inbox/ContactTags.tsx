import { useState, useCallback } from 'react'
import { Tag, ChevronDown, ChevronUp } from 'lucide-react'
import { TagsInput } from '@/components/inbox/TagsInput'
import { updateContactTags } from '@/services/whatsapp'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

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
    <div className="border-t border-zinc-200/70 bg-zinc-50/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[12.5px] font-medium text-zinc-700">Tags</span>
          {tags.length > 0 && (
            <div className="flex gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20"
                >
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-[10px] text-zinc-400">+{tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        )}
      </button>
      {expanded && (
        <div className={cn('px-5 pb-3 transition-opacity', updating && 'opacity-50')}>
          <TagsInput tags={tags} onChange={handleSave} />
        </div>
      )}
    </div>
  )
}
