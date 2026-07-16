import { useState, useRef, KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TagsInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
}

const SUGGESTED_TAGS = ['Quente', 'Frio', 'Agendado', 'Visita', 'Negociando']

export function TagsInput({ tags, onChange, placeholder = 'Adicionar tag...' }: TagsInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed) return
    if (tags.includes(trimmed)) return
    onChange([...tags, trimmed])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const availableSuggestions = SUGGESTED_TAGS.filter((s) => !tags.includes(s))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-violet-400 hover:text-violet-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-7 w-32 text-[12px] border-zinc-200/70 bg-transparent px-2 focus-visible:ring-violet-500/30"
          />
          {input.trim() && (
            <button
              onClick={() => addTag(input)}
              className="h-7 w-7 flex items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-700 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {availableSuggestions.length > 0 && tags.length === 0 && (
        <div className="flex flex-wrap gap-1">
          {availableSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => addTag(s)}
              className={cn(
                'rounded-md bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-500',
                'ring-1 ring-inset ring-zinc-200 hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200',
                'transition-colors',
              )}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
