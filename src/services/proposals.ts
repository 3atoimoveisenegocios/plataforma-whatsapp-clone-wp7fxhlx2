import pb from '@/lib/pocketbase/client'

export type NegotiationStatus =
  | 'em_negociacao'
  | 'proposta_enviada'
  | 'contra_proposta'
  | 'proposta_recusada'
  | 'proposta_aprovada'
  | 'proposta_fechada'
  | 'documentos_pendentes'
  | 'preparando_contrato'
  | 'contrato_pronto'
  | 'aguardando_assinatura'
  | 'contrato_assinado'
  | 'negociacao_finalizada'
  | 'cancelada'

export interface CounterProposal {
  id?: string
  from_role?: 'client' | 'owner' | 'broker' | string
  to_role?: string
  value?: number
  message?: string
  status?: 'pending' | 'accepted' | 'refused' | 'countered' | string
  parent_id?: string
  created?: string
}

export interface OwnerProposal {
  id?: string
  proposal_value?: number
  counter_offer_value?: number
  status?: 'pending' | 'accepted' | 'rejected' | 'counter_proposal' | string
  owner_response_date?: string
  created?: string
}

export interface NegotiationTimelineEvent {
  id?: string
  status_step?: string
  title?: string
  description?: string
  author?: string
  author_role?: string
  event_date?: string
}

export interface NegotiationProperty {
  id?: string
  code?: string
  codigo?: string
  title?: string
  name?: string
  price?: number
  valor?: number
}

export interface NegotiationClient {
  id?: string
  name?: string
  nome?: string
  phone?: string
  telefone?: string
  whatsapp?: string
  whatsapp_number?: string
}

export interface NegotiationBroker {
  id?: string
  name?: string
  nome?: string
}

export interface Negotiation {
  id: string
  status: NegotiationStatus | string
  status_step?: string
  property_value?: number
  proposal_value?: number
  down_payment?: number
  financing_amount?: number
  fgts_amount?: number
  payment_method?: string
  commercial_notes?: string
  proposal_file_name?: string
  d4sign_link?: string
  created?: string
  updated?: string

  property?: NegotiationProperty | null
  client?: NegotiationClient | null
  corretor?: NegotiationBroker | null
  broker?: NegotiationBroker | null

  counter_proposals?: CounterProposal[]
  owner_proposals?: OwnerProposal[]
  negotiation_timeline?: NegotiationTimelineEvent[]
}

export interface NegotiationsFeedResponse {
  ok: boolean
  generatedAt?: string
  count?: number
  negotiations: Negotiation[]
  error?: string
}

/**
 * Normaliza número de telefone do CRM:
 * - Remove tudo que não é dígito
 * - Se tiver todos os dígitos iguais (ex: "000000000", "11111111111"), é inválido
 * - Se tiver menos de 10 dígitos ou mais de 13 dígitos, é inválido
 * - Se tiver 10 ou 11 dígitos (formato BR com DDD), prefixa '55'
 * - Se tiver 12 ou 13 dígitos e começar com 55, mantém
 * Retorna null se for inválido / número de teste
 */
export function normalizePhoneNumber(rawPhone?: string | null): string | null {
  if (!rawPhone) return null
  const digits = rawPhone.replace(/\D/g, '')
  if (!digits) return null

  // Verifica se são todos os mesmos dígitos (ex: 000000000, 999999999)
  if (/^(\d)\1+$/.test(digits)) {
    return null
  }

  // DDDs válidos no Brasil são de 11 a 99
  if (digits.length === 10 || digits.length === 11) {
    const ddd = parseInt(digits.substring(0, 2), 10)
    if (ddd < 11 || ddd > 99) return null
    return `55${digits}`
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    const ddd = parseInt(digits.substring(2, 4), 10)
    if (ddd < 11 || ddd > 99) return null
    return digits
  }

  return null
}

export interface StatusBadgeConfig {
  label: string
  bg: string
  text: string
  border: string
  dotColor: string
}

export const STATUS_CONFIG: Record<NegotiationStatus | string, StatusBadgeConfig> = {
  em_negociacao: {
    label: 'Em Negociação',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dotColor: 'bg-blue-500',
  },
  proposta_enviada: {
    label: 'Proposta Enviada',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  contra_proposta: {
    label: 'Contraproposta',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dotColor: 'bg-purple-500',
  },
  proposta_recusada: {
    label: 'Proposta Recusada',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    dotColor: 'bg-red-500',
  },
  proposta_aprovada: {
    label: 'Proposta Aprovada',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  proposta_fechada: {
    label: 'Proposta Fechada',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    dotColor: 'bg-teal-500',
  },
  documentos_pendentes: {
    label: 'Docs Pendentes',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    dotColor: 'bg-orange-500',
  },
  preparando_contrato: {
    label: 'Preparando Contrato',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dotColor: 'bg-indigo-500',
  },
  contrato_pronto: {
    label: 'Contrato Pronto',
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    dotColor: 'bg-cyan-500',
  },
  aguardando_assinatura: {
    label: 'Aguardando Assinatura',
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    dotColor: 'bg-yellow-500',
  },
  contrato_assinado: {
    label: 'Contrato Assinado',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    dotColor: 'bg-green-500',
  },
  negociacao_finalizada: {
    label: 'Negociação Finalizada',
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-300',
    dotColor: 'bg-zinc-500',
  },
  cancelada: {
    label: 'Cancelada',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dotColor: 'bg-rose-500',
  },
}

export function getStatusConfig(status?: string | null): StatusBadgeConfig {
  if (!status) {
    return {
      label: 'Desconhecido',
      bg: 'bg-zinc-50',
      text: 'text-zinc-600',
      border: 'border-zinc-200',
      dotColor: 'bg-zinc-400',
    }
  }
  const normalized = status.toLowerCase().trim()
  return (
    STATUS_CONFIG[normalized] || {
      label: status.replace(/_/g, ' '),
      bg: 'bg-zinc-50',
      text: 'text-zinc-600',
      border: 'border-zinc-200',
      dotColor: 'bg-zinc-400',
    }
  )
}

/**
 * Busca as propostas via backend PocketBase.
 * Aceita filtro de corretor e timestamp 'since' para busca incremental.
 */
export async function getNegotiationsFeed(params?: {
  broker?: string
  since?: string
}): Promise<NegotiationsFeedResponse> {
  const queryParts: string[] = []
  if (params?.broker) {
    queryParts.push(`broker=${encodeURIComponent(params.broker)}`)
  }
  if (params?.since) {
    queryParts.push(`since=${encodeURIComponent(params.since)}`)
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  const endpoint = `/backend/v1/negotiations/feed${queryString}`

  const data = await pb.send<NegotiationsFeedResponse>(endpoint, {
    method: 'GET',
  })

  return data
}
