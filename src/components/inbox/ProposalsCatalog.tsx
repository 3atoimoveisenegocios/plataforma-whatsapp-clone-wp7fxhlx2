import { useEffect, useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  getNegotiationsFeed,
  getStatusConfig,
  normalizePhoneNumber,
  type Negotiation,
  type CounterProposal,
  type OwnerProposal,
  type NegotiationTimelineEvent,
} from '@/services/proposals'
import { ContactSelector } from '@/components/inbox/ContactSelector'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Search,
  RotateCw,
  FileText,
  User,
  Home,
  DollarSign,
  ArrowRightLeft,
  Clock,
  ExternalLink,
  ChevronRight,
  Send,
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { sendMessage } from '@/services/whatsapp'

interface ProposalsCatalogProps {
  onSelectContactForChat?: (contact: any) => void
  hasSelectedContact?: boolean
  currentSelectedContact?: any | null
}

const PAGE_SIZE = 20

const formatCurrency = (value?: number | null): string => {
  if (value == null || isNaN(value)) return 'R$ 0,00'
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

const formatDateSafely = (dateStr?: string | null): string => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function ProposalsCatalog({
  onSelectContactForChat,
  hasSelectedContact = false,
  currentSelectedContact = null,
}: ProposalsCatalogProps) {
  const [proposals, setProposals] = useState<Negotiation[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSuccessTime, setLastSuccessTime] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedContact, setSelectedContact] = useState<any | null>(currentSelectedContact)
  const [sendingId, setSendingId] = useState<string | null>(null)

  // Keep internal selectedContact synced if parent passes one
  useEffect(() => {
    if (currentSelectedContact) {
      setSelectedContact(currentSelectedContact)
    }
  }, [currentSelectedContact])

  // Initial full fetch
  const loadInitialProposals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getNegotiationsFeed()
      if (res && res.negotiations) {
        setProposals(res.negotiations)
        const timestamp = res.generatedAt || new Date().toISOString()
        setLastSuccessTime(timestamp)
      } else {
        setProposals([])
      }
    } catch (err: any) {
      console.error('Failed to fetch initial proposals:', err)
      toast.error('Não foi possível carregar as propostas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialProposals()
  }, [loadInitialProposals])

  // Incremental refresh with ?since=
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const params = lastSuccessTime ? { since: lastSuccessTime } : undefined
      const res = await getNegotiationsFeed(params)
      const newItems = res?.negotiations || []
      const newGeneratedAt = res?.generatedAt || new Date().toISOString()

      if (lastSuccessTime && newItems.length > 0) {
        // Merge incremental updates by id
        setProposals((prev) => {
          const map = new Map<string, Negotiation>()
          // Put new items first in map
          newItems.forEach((item) => map.set(item.id, item))
          // Add previous items that weren't updated
          prev.forEach((item) => {
            if (!map.has(item.id)) {
              map.set(item.id, item)
            }
          })
          return Array.from(map.values())
        })
        toast.success(`${newItems.length} proposta(s) atualizada(s)!`)
      } else if (lastSuccessTime && newItems.length === 0) {
        toast.info('Todas as propostas já estão atualizadas.')
      } else {
        // If there was no previous time, set full list
        setProposals(newItems)
        toast.success(`Lista atualizada (${newItems.length} propostas).`)
      }

      setLastSuccessTime(newGeneratedAt)
    } catch (err) {
      console.error('Failed to refresh proposals:', err)
      toast.error('Erro ao atualizar propostas. Tente novamente.')
    } finally {
      setRefreshing(false)
    }
  }

  // Filter proposals by search (client name, property title, status, ID) and statusFilter
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) {
        return false
      }
      if (!search.trim()) return true
      const term = search.toLowerCase().trim()
      const clientName = (p.client?.name || p.client?.nome || '').toLowerCase()
      const clientPhone = p.client?.phone || p.client?.telefone || p.client?.whatsapp || ''
      const propTitle = (p.property?.title || p.property?.name || '').toLowerCase()
      const propCode = (p.property?.code || p.property?.codigo || '').toLowerCase()
      const idMatch = (p.id || '').toLowerCase()
      const statusText = (p.status || '').toLowerCase()

      return (
        clientName.includes(term) ||
        clientPhone.includes(term) ||
        propTitle.includes(term) ||
        propCode.includes(term) ||
        idMatch.includes(term) ||
        statusText.includes(term)
      )
    })
  }, [proposals, search, statusFilter])

  const visibleProposals = useMemo(() => {
    return filteredProposals.slice(0, visibleCount)
  }, [filteredProposals, visibleCount])

  // Format message to send proposal summary in chat
  const handleSendProposalSummary = async (proposal: Negotiation) => {
    const contact = selectedContact || currentSelectedContact
    if (!contact) {
      toast.error('Selecione um contato antes de enviar o resumo da proposta.')
      return
    }

    setSendingId(proposal.id)
    try {
      const clientName = proposal.client?.name || proposal.client?.nome || 'Cliente'
      const propTitle = proposal.property?.title || proposal.property?.name || 'Imóvel'
      const statusCfg = getStatusConfig(proposal.status)

      const lines: string[] = [
        `📋 *Proposta Comercial #${proposal.id.slice(0, 8)}*`,
        ``,
        `🏠 *Imóvel:* ${propTitle}`,
        `👤 *Cliente:* ${clientName}`,
        `🏷️ *Status:* ${statusCfg.label}`,
      ]

      if (proposal.property_value) {
        lines.push(`💰 *Valor do Imóvel:* ${formatCurrency(proposal.property_value)}`)
      }
      if (proposal.proposal_value) {
        lines.push(`🤝 *Valor da Proposta:* ${formatCurrency(proposal.proposal_value)}`)
      }
      if (proposal.down_payment) {
        lines.push(`💵 *Entrada:* ${formatCurrency(proposal.down_payment)}`)
      }
      if (proposal.financing_amount) {
        lines.push(`🏦 *Financiamento:* ${formatCurrency(proposal.financing_amount)}`)
      }
      if (proposal.fgts_amount) {
        lines.push(`📑 *FGTS:* ${formatCurrency(proposal.fgts_amount)}`)
      }
      if (proposal.payment_method) {
        lines.push(`💳 *Forma de Pagamento:* ${proposal.payment_method}`)
      }
      if (proposal.commercial_notes) {
        lines.push(``, `📝 *Observações:* ${proposal.commercial_notes}`)
      }
      if (proposal.d4sign_link) {
        lines.push(``, `✍️ *Assinatura Digital (D4Sign):* ${proposal.d4sign_link}`)
      }

      const summaryText = lines.join('\n')

      await sendMessage(contact.id, {
        text: summaryText,
        type: 'text',
        instance_id: contact.instance_id,
        remote_jid: contact.remote_jid,
      })

      toast.success('Resumo da proposta enviado no chat!')
    } catch (err) {
      console.error('Failed to send proposal summary:', err)
      toast.error('Erro ao enviar proposta no chat. Tente novamente.')
    } finally {
      setTimeout(() => setSendingId(null), 1500)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-zinc-200/70 bg-white space-y-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3 shadow-sm"
              >
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Top Filter and Actions */}
      <div className="px-5 py-3 border-b border-zinc-200/70 bg-white shrink-0 space-y-2">
        {/* Contact Selector */}
        <div>
          <ContactSelector selectedContact={selectedContact} onSelect={setSelectedContact} />
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Buscar por cliente, imóvel, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-zinc-50/80 border-zinc-200/70 text-[13px] placeholder:text-zinc-400 focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-300"
          />
        </div>

        {/* Refresh button & status count */}
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 text-[12.5px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-700"
            onClick={handleRefresh}
            disabled={refreshing}
            title={
              lastSuccessTime ? `Última sincronização: ${formatDateSafely(lastSuccessTime)}` : ''
            }
          >
            <RotateCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Atualizando...' : 'Atualizar propostas'}
          </Button>

          <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap shrink-0">
            {filteredProposals.length} {filteredProposals.length === 1 ? 'proposta' : 'propostas'}
          </span>
        </div>
      </div>

      {/* Proposals list */}
      <ScrollArea className="flex-1">
        {filteredProposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
            <div className="h-12 w-12 rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 text-violet-500" />
            </div>
            <p className="text-sm font-semibold text-zinc-800">Nenhuma proposta encontrada</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              {search
                ? 'Tente ajustar sua busca por outros termos.'
                : 'As propostas negociadas aparecerão aqui quando forem registradas no CRM.'}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {visibleProposals.map((proposal) => {
              const statusCfg = getStatusConfig(proposal.status)
              const clientName =
                proposal.client?.name || proposal.client?.nome || 'Cliente não informado'
              const rawClientPhone =
                proposal.client?.phone ||
                proposal.client?.telefone ||
                proposal.client?.whatsapp ||
                proposal.client?.whatsapp_number
              const normalizedPhone = normalizePhoneNumber(rawClientPhone)
              const hasValidPhone = Boolean(normalizedPhone)

              const propTitle =
                proposal.property?.title ||
                proposal.property?.name ||
                (proposal.property?.code
                  ? `Imóvel #${proposal.property.code}`
                  : 'Imóvel sem título')
              const propCode = proposal.property?.code || proposal.property?.codigo

              const counterProposals = proposal.counter_proposals || []
              const ownerProposals = proposal.owner_proposals || []
              const timeline = proposal.negotiation_timeline || []

              const isSending = sendingId === proposal.id

              return (
                <div
                  key={proposal.id}
                  className="rounded-xl border border-zinc-200/80 bg-white hover:border-violet-300 transition-all duration-200 shadow-sm overflow-hidden flex flex-col"
                >
                  {/* Card Header: status badge + dates */}
                  <div className="p-3.5 pb-2.5 border-b border-zinc-100 flex items-start justify-between gap-2 bg-gradient-to-r from-zinc-50/50 to-white">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                            statusCfg.bg,
                            statusCfg.text,
                            statusCfg.border,
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dotColor)} />
                          {statusCfg.label}
                        </span>

                        {proposal.status_step && (
                          <span className="text-[10.5px] text-zinc-500 font-medium bg-zinc-100 px-2 py-0.5 rounded-md">
                            Etapa: {proposal.status_step}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-1.5">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Criada em {formatDateSafely(proposal.created)}</span>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded shrink-0">
                      #{proposal.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Client & Property Details */}
                  <div className="p-3.5 space-y-2.5 text-[13px]">
                    {/* Imóvel */}
                    <div className="flex items-start gap-2">
                      <div className="h-7 w-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Home className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-zinc-900 truncate">{propTitle}</p>
                          {propCode && (
                            <span className="text-[10.5px] font-medium text-violet-700 bg-violet-50 px-1.5 py-0.2 rounded shrink-0">
                              Cód: {propCode}
                            </span>
                          )}
                        </div>
                        {proposal.property_value != null && (
                          <p className="text-[11.5px] text-zinc-500">
                            Valor anunciado: {formatCurrency(proposal.property_value)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Cliente & Telefone Normalizado */}
                    <div className="flex items-start gap-2 pt-1 border-t border-zinc-100">
                      <div className="h-7 w-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-900 truncate">{clientName}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {hasValidPhone ? (
                            <span
                              className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 inline-flex items-center gap-1"
                              title={`Normalizado com sucesso: +${normalizedPhone}`}
                            >
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />+
                              {normalizedPhone}
                            </span>
                          ) : (
                            <span
                              className="text-[10.5px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-flex items-center gap-1"
                              title={
                                rawClientPhone
                                  ? `Telefone recebido: "${rawClientPhone}" (inválido ou de teste)`
                                  : 'Sem telefone informado no CRM'
                              }
                            >
                              <AlertCircle className="h-3 w-3 text-amber-600" />
                              Sem contato vinculado
                            </span>
                          )}

                          {rawClientPhone && rawClientPhone !== normalizedPhone && (
                            <span className="text-[10.5px] text-zinc-400">
                              (CRM: {rawClientPhone})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Corretor responsável se houver */}
                    {(proposal.corretor?.name || proposal.broker?.name) && (
                      <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500 pl-9">
                        <span className="text-zinc-400">Corretor:</span>
                        <span className="font-medium text-zinc-700">
                          {proposal.corretor?.name || proposal.broker?.name}
                        </span>
                      </div>
                    )}

                    {/* Grid de Valores Financeiros */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="bg-zinc-50/90 rounded-lg p-2.5 border border-zinc-100">
                        <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block">
                          Valor da Proposta
                        </span>
                        <p className="text-[14px] font-bold text-violet-700 mt-0.5">
                          {formatCurrency(proposal.proposal_value)}
                        </p>
                      </div>

                      <div className="bg-zinc-50/90 rounded-lg p-2.5 border border-zinc-100">
                        <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block">
                          Entrada Oferecida
                        </span>
                        <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                          {formatCurrency(proposal.down_payment)}
                        </p>
                      </div>

                      {proposal.financing_amount != null && proposal.financing_amount > 0 && (
                        <div className="bg-zinc-50/90 rounded-lg p-2 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 block">Financiamento</span>
                          <p className="text-[12px] font-medium text-zinc-700">
                            {formatCurrency(proposal.financing_amount)}
                          </p>
                        </div>
                      )}

                      {proposal.fgts_amount != null && proposal.fgts_amount > 0 && (
                        <div className="bg-zinc-50/90 rounded-lg p-2 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 block">FGTS</span>
                          <p className="text-[12px] font-medium text-zinc-700">
                            {formatCurrency(proposal.fgts_amount)}
                          </p>
                        </div>
                      )}
                    </div>

                    {proposal.payment_method && (
                      <div className="text-[11.5px] text-zinc-600 bg-zinc-50 px-2.5 py-1.5 rounded-md border border-zinc-100">
                        <span className="font-medium text-zinc-500">Condições: </span>
                        {proposal.payment_method}
                      </div>
                    )}

                    {proposal.commercial_notes && (
                      <div className="text-[11.5px] text-zinc-600 bg-amber-50/50 p-2 rounded-md border border-amber-100/70">
                        <span className="font-semibold text-amber-900 block mb-0.5">
                          Notas comerciais:
                        </span>
                        <p className="whitespace-pre-wrap">{proposal.commercial_notes}</p>
                      </div>
                    )}

                    {/* D4Sign or Proposal file link */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {proposal.d4sign_link && (
                        <a
                          href={proposal.d4sign_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-violet-700 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-md transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Assinatura D4Sign
                        </a>
                      )}
                      {proposal.proposal_file_name && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">
                          <FileText className="h-3 w-3 text-zinc-400" />
                          {proposal.proposal_file_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sub-lists: Accordions for Counter Proposals, Owner Proposals, Timeline */}
                  <div className="border-t border-zinc-100 px-3.5 py-1 bg-zinc-50/40">
                    <Accordion type="multiple" className="w-full">
                      {/* 1. Contrapropostas do Comprador */}
                      <AccordionItem value="counter_proposals" className="border-none">
                        <AccordionTrigger className="py-2 text-[12px] font-semibold text-zinc-700 hover:text-violet-700 hover:no-underline">
                          <span className="flex items-center gap-2">
                            <ArrowRightLeft className="h-3.5 w-3.5 text-purple-500" />
                            Contrapropostas ({counterProposals.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3 pt-1 space-y-2">
                          {counterProposals.length === 0 ? (
                            <p className="text-[11.5px] text-zinc-400 italic">
                              Nenhuma contraproposta registrada.
                            </p>
                          ) : (
                            counterProposals.map((cp, idx) => {
                              const roleLabel =
                                cp.from_role === 'client'
                                  ? 'Comprador'
                                  : cp.from_role === 'owner'
                                    ? 'Proprietário'
                                    : cp.from_role === 'broker'
                                      ? 'Corretor'
                                      : cp.from_role || 'Participante'

                              return (
                                <div
                                  key={cp.id || idx}
                                  className="p-2.5 bg-white rounded-lg border border-purple-100/80 shadow-2xs space-y-1 text-[12px]"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-purple-900">
                                      De: {roleLabel}
                                    </span>
                                    {cp.status && (
                                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                                        {cp.status}
                                      </span>
                                    )}
                                  </div>
                                  {cp.value != null && (
                                    <p className="font-bold text-zinc-900">
                                      Valor: {formatCurrency(cp.value)}
                                    </p>
                                  )}
                                  {cp.message && (
                                    <p className="text-[11.5px] text-zinc-600 bg-zinc-50 p-1.5 rounded">
                                      "{cp.message}"
                                    </p>
                                  )}
                                  {cp.created && (
                                    <span className="text-[10px] text-zinc-400 block pt-0.5">
                                      {formatDateSafely(cp.created)}
                                    </span>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      {/* 2. Propostas do Proprietário */}
                      <AccordionItem value="owner_proposals" className="border-none">
                        <AccordionTrigger className="py-2 text-[12px] font-semibold text-zinc-700 hover:text-violet-700 hover:no-underline">
                          <span className="flex items-center gap-2">
                            <Building className="h-3.5 w-3.5 text-blue-500" />
                            Propostas do Proprietário ({ownerProposals.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3 pt-1 space-y-2">
                          {ownerProposals.length === 0 ? (
                            <p className="text-[11.5px] text-zinc-400 italic">
                              Nenhuma resposta do proprietário registrada.
                            </p>
                          ) : (
                            ownerProposals.map((op, idx) => (
                              <div
                                key={op.id || idx}
                                className="p-2.5 bg-white rounded-lg border border-blue-100/80 shadow-2xs space-y-1 text-[12px]"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-blue-900">
                                    Resposta do Proprietário
                                  </span>
                                  {op.status && (
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                                      {op.status}
                                    </span>
                                  )}
                                </div>
                                {op.proposal_value != null && (
                                  <p className="text-zinc-700">
                                    Valor avaliado: {formatCurrency(op.proposal_value)}
                                  </p>
                                )}
                                {op.counter_offer_value != null && (
                                  <p className="font-bold text-blue-700">
                                    Contraproposta proprietário:{' '}
                                    {formatCurrency(op.counter_offer_value)}
                                  </p>
                                )}
                                {op.owner_response_date && (
                                  <span className="text-[10px] text-zinc-400 block pt-0.5">
                                    Respondido em: {formatDateSafely(op.owner_response_date)}
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      {/* 3. Timeline Completa */}
                      <AccordionItem value="timeline" className="border-none">
                        <AccordionTrigger className="py-2 text-[12px] font-semibold text-zinc-700 hover:text-violet-700 hover:no-underline">
                          <span className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            Timeline da Negociação ({timeline.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3 pt-1">
                          {timeline.length === 0 ? (
                            <p className="text-[11.5px] text-zinc-400 italic">
                              Sem eventos de timeline registrados.
                            </p>
                          ) : (
                            <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-zinc-200">
                              {timeline.map((event, idx) => (
                                <div key={event.id || idx} className="relative text-[12px]">
                                  <div className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full bg-violet-600 ring-2 ring-white" />
                                  <div className="bg-white p-2 rounded-lg border border-zinc-200/70 shadow-2xs space-y-0.5">
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="font-semibold text-zinc-900">
                                        {event.title || event.status_step || 'Atualização'}
                                      </p>
                                      {event.event_date && (
                                        <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                                          {formatDateSafely(event.event_date)}
                                        </span>
                                      )}
                                    </div>
                                    {event.description && (
                                      <p className="text-[11px] text-zinc-600">
                                        {event.description}
                                      </p>
                                    )}
                                    {(event.author || event.author_role) && (
                                      <p className="text-[10px] text-zinc-400 pt-0.5">
                                        Por {event.author}{' '}
                                        {event.author_role ? `(${event.author_role})` : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>

                  {/* Card Action Button */}
                  <div className="p-3 border-t border-zinc-100 bg-white">
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs font-medium bg-violet-600 hover:bg-violet-700"
                      onClick={() => handleSendProposalSummary(proposal)}
                      disabled={(!hasSelectedContact && !selectedContact) || isSending}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {isSending ? 'Enviando resumo...' : 'Enviar resumo da proposta no chat'}
                    </Button>
                  </div>
                </div>
              )
            })}

            {/* Pagination / Load more */}
            {visibleCount < filteredProposals.length && (
              <div className="pt-2 pb-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-[12.5px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-700"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                >
                  Carregar mais propostas
                  <span className="text-[11px] text-zinc-400 ml-1.5">
                    ({visibleCount} de {filteredProposals.length})
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
