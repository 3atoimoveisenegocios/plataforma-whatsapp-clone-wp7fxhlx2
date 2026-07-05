import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  className?: string
  children?: ReactNode
}

export function PageHeader({ title, description, className, children }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'px-6 md:px-10 pt-8 md:pt-12 pb-6 md:pb-8 shrink-0 flex flex-col md:flex-row md:items-start justify-between gap-4',
        className,
      )}
    >
      <div>
        <h1 className="text-[26px] font-medium tracking-tight text-zinc-900 flex items-center gap-3">
          {title}
        </h1>
        {description && (
          <p className="text-[14px] text-zinc-500 mt-1.5 font-light">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0 flex items-center">{children}</div>}
    </div>
  )
}
