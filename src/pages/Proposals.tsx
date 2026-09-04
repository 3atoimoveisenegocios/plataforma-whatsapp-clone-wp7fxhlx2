import { useState } from 'react'
import {
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  UserCheck,
  Building,
  User,
  PartyPopper,
  Info,
  ArrowRightLeft,
  XCircle,
  FileCheck,
  PenTool,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ContactSelector } from '@/components/inbox/ContactSelector'
import { normalizePhoneNumber } from '@/services/proposals'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'

export type ProposalCardCategory =
  | 'proposta_enviada'
  | 'contraproposta'
  | 'aceite'
  | 'recusa'
  | 'contrato_preparacao'
  | 'contrato_conferencia'
  | 'assinatura'
  | 'finalizacao'

export interface CategoryVisual {
  label: string
  icon: LucideIcon
  bannerGradient: string
  iconBg: string
  iconColor: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
  accentBorder: string
}

export const CATEGORY_VISUALS: Record<ProposalCardCategory, CategoryVisual> = {
  proposta_enviada: {
    label: 'Envio de Proposta',
    icon: Send,
    bannerGradient: 'from-blue-600 via-indigo-600 to-blue-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-blue-50/90',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200/60',
    accentBorder: 'group-hover:border-blue-400/60',
  },
  contraproposta: {
    label: 'Contraproposta',
    icon: ArrowRightLeft,
    bannerGradient: 'from-amber-500 via-orange-500 to-amber-600',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-amber-50/90',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200/60',
    accentBorder: 'group-hover:border-amber-400/60',
  },
  aceite: {
    label: 'Proposta Aceita',
    icon: CheckCircle2,
    bannerGradient: 'from-emerald-600 via-teal-600 to-emerald-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-emerald-50/90',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200/60',
    accentBorder: 'group-hover:border-emerald-400/60',
  },
  recusa: {
    label: 'Proposta Recusada',
    icon: XCircle,
    bannerGradient: 'from-rose-600 via-red-600 to-rose-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-rose-50/90',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200/60',
    accentBorder: 'group-hover:border-rose-400/60',
  },
  contrato_preparacao: {
    label: 'Contrato em Preparação',
    icon: FileText,
    bannerGradient: 'from-sky-600 via-cyan-600 to-blue-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-sky-50/90',
    badgeText: 'text-sky-700',
    badgeBorder: 'border-sky-200/60',
    accentBorder: 'group-hover:border-sky-400/60',
  },
  contrato_conferencia: {
    label: 'Pronto p/ Conferência',
    icon: FileCheck,
    bannerGradient: 'from-teal-600 via-emerald-600 to-cyan-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-teal-50/90',
    badgeText: 'text-teal-700',
    badgeBorder: 'border-teal-200/60',
    accentBorder: 'group-hover:border-teal-400/60',
  },
  assinatura: {
    label: 'Pronto p/ Assinatura',
    icon: PenTool,
    bannerGradient: 'from-violet-600 via-purple-600 to-indigo-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-purple-50/90',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200/60',
    accentBorder: 'group-hover:border-purple-400/60',
  },
  finalizacao: {
    label: 'Finalização',
    icon: Trophy,
    bannerGradient: 'from-fuchsia-600 via-pink-600 to-purple-700',
    iconBg: 'bg-white/20 backdrop-blur-xs text-white border border-white/30',
    iconColor: 'text-white',
    badgeBg: 'bg-fuchsia-50/90',
    badgeText: 'text-fuchsia-700',
    badgeBorder: 'border-fuchsia-200/60',
    accentBorder: 'group-hover:border-fuchsia-400/60',
  },
}

export const WHATSAPP_FOOTER = `LINK DO PORTAL: https://portaldocliente.3atoimoveis.com.br/

Para dúvidas fale com a gente nos canais abaixo:

(11) 4422-7729 ( Tel e Whatsapp )
Email: atendimento@3atoimoveis.com.br / 3atoimoveis@gmail.com`

// Mapeamento de imagens públicas estáveis por categoria do card
export const CATEGORY_COVER_IMAGES: Record<ProposalCardCategory, string> = {
  proposta_enviada:
    'https://img.usecurling.com/p/800/400?q=envelope%20letter%20proposal&color=blue',
  contraproposta:
    'https://img.usecurling.com/p/800/400?q=handshake%20negotiation%20agreement&color=amber',
  aceite: 'https://img.usecurling.com/p/800/400?q=handshake%20approved%20success&color=green',
  recusa: 'https://img.usecurling.com/p/800/400?q=contract%20declined%20review&color=red',
  contrato_preparacao:
    'https://img.usecurling.com/p/800/400?q=contract%20document%20desk&color=cyan',
  contrato_conferencia:
    'https://img.usecurling.com/p/800/400?q=document%20checklist%20inspection&color=teal',
  assinatura: 'https://img.usecurling.com/p/800/400?q=signature%20fountain%20pen&color=purple',
  finalizacao: 'https://img.usecurling.com/p/800/400?q=celebration%20trophy%20keys&color=magenta',
}

export function formatWhatsAppMessage(cardText: string, cardTitle?: string): string {
  const trimmed = cardText.trimEnd()
  const header = cardTitle ? `*${cardTitle.trim()}*\n\n` : ''
  return `${header}${trimmed}\n\n${WHATSAPP_FOOTER}`
}

interface ProposalMessageCard {
  id: string
  title: string
  text: string
  category: ProposalCardCategory
}

interface ProposalSection {
  id: string
  title: string
  subtitle: string
  icon: typeof User | typeof Building | typeof PartyPopper
  badgeColor: string
  cards: ProposalMessageCard[]
}

const SECTIONS: ProposalSection[] = [
  {
    id: 'cliente_negociacoes',
    title: 'CLIENTE — NEGOCIAÇÕES',
    subtitle: 'Comunicações enviadas ao cliente/comprador referentes às etapas da negociação',
    icon: User,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    cards: [
      {
        id: 'cn-1',
        title: 'Proposta enviada ao proprietário',
        category: 'proposta_enviada',
        text: 'Olá! Sua proposta foi encaminhada ao proprietário. Por gentileza, aguarde. Em breve retornaremos com novidades sobre a negociação.',
      },
      {
        id: 'cn-aceita',
        title: 'Proposta aceita pelo proprietário',
        category: 'aceite',
        text: 'Olá Temos novidades sobre sua Proposta! O proprietário analisou sua proposta e aceitou as condições, por favor no Portal , vá em Negociações e veja a movimentação, logo encaminharemos as próximas etapas.',
      },
      {
        id: 'cn-recusada',
        title: 'Proposta recusada pelo proprietário',
        category: 'recusa',
        text: 'Olá Temos novidades sobre sua Proposta! O proprietário analisou sua proposta e recusou as condições, por favor no Portal , vá em Negociações e veja a movimentação, para mais informações entre em contato com a gente no telefone (11) 4422-7729, ou pelo Whatsapp neste mesmo número.',
      },
      {
        id: 'cn-2',
        title: 'Proprietário fez uma contraproposta',
        category: 'contraproposta',
        text: `Olá! Temos novidades sobre sua proposta. O proprietário analisou sua proposta e enviou uma contraproposta.

Por gentileza, acesse nosso portal, vá até Negociações e verifique a movimentação.`,
      },
      {
        id: 'cn-4',
        title: 'Contraproposta do cliente recusada pelo proprietário',
        category: 'recusa',
        text: `Olá! Infelizmente, o proprietário analisou sua contraproposta e não a aceitou.

Para mais informações, entre em contato conosco pelo telefone (11) 4422-7729 ou envie uma mensagem por aqui.`,
      },
      {
        id: 'cn-6',
        title: 'Sua contraproposta foi aceita pelo proprietário',
        category: 'aceite',
        text: `Olá! Sua contraproposta foi aceita pelo proprietário. A negociação avançou para a próxima etapa.

Por gentileza, acesse Negociações para acompanhar a movimentação.`,
      },
      {
        id: 'cn-7',
        title: 'Proprietário aceitou a contraproposta do cliente',
        category: 'aceite',
        text: `Olá! Temos ótimas novidades! O proprietário aceitou sua contraproposta.

Por gentileza, acesse nosso portal, vá até Negociações e verifique a movimentação.`,
      },
      {
        id: 'cn-8',
        title: 'Contrato em preparação',
        category: 'contrato_preparacao',
        text: `Olá! Temos novidades! Estamos preparando seu contrato para assinatura.

Por gentileza, acesse nosso portal, vá até Negociações e acompanhe a movimentação.`,
      },
      {
        id: 'cn-9',
        title: 'Contrato pronto para conferência',
        category: 'contrato_conferencia',
        text: `Olá! Temos novidades! Seu contrato está pronto para conferência.

Por gentileza, acesse Negociações, entre em Contrato Finalizado, identificado pela cor verde, e clique em Visualizar PDF do Contrato para realizar a conferência.

Estando tudo correto, avançaremos para a assinatura.`,
      },
      {
        id: 'cn-10',
        title: 'Contrato pronto para assinatura',
        category: 'assinatura',
        text: `Olá! Temos novidades! Seu contrato está pronto para assinatura.

Por gentileza, acesse Negociações e clique em Assinar na D4Sign, identificado pela cor laranja. Você será redirecionado para realizar a assinatura do contrato.`,
      },
    ],
  },
  {
    id: 'proprietario_minhas_propostas',
    title: 'PROPRIETÁRIO — MINHAS PROPOSTAS',
    subtitle: 'Comunicações enviadas ao proprietário referentes às etapas da negociação no portal',
    icon: Building,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cards: [
      {
        id: 'pmp-1',
        title: 'Proposta enviada ao cliente',
        category: 'proposta_enviada',
        text: 'Olá! Sua proposta foi encaminhada ao cliente. Por gentileza, aguarde. Em breve retornaremos com novidades sobre a negociação.',
      },
      {
        id: 'pmp-aceita',
        title: 'Proposta aceita pelo cliente',
        category: 'aceite',
        text: 'Olá Temos novidades sobre sua Proposta! O cliente analisou sua proposta e aceitou as condições, por favor no Portal vá em Minhas Propostas e veja a movimentação, logo encaminharemos as próximas etapas.',
      },
      {
        id: 'pmp-recusada',
        title: 'Proposta recusada pelo cliente',
        category: 'recusa',
        text: 'Olá Temos novidades sobre sua Proposta! O cliente analisou sua proposta e recusou as condições, por favor no Portal , vá em Minhas Propostas e veja a movimentação, para mais informações entre em contato com a gente no telefone (11) 4422-7729, ou pelo Whatsapp neste mesmo número.',
      },
      {
        id: 'pmp-2',
        title: 'Cliente fez uma contraproposta',
        category: 'contraproposta',
        text: `Olá! Temos novidades sobre sua proposta. O cliente analisou sua proposta e enviou uma contraproposta.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e verifique a movimentação.`,
      },
      {
        id: 'pmp-4',
        title: 'Contraproposta do proprietário recusada pelo cliente',
        category: 'recusa',
        text: `Olá! Infelizmente, o cliente analisou sua contraproposta e não a aceitou.

Para mais informações, entre em contato conosco pelo telefone (11) 4422-7729 ou envie uma mensagem por aqui.`,
      },
      {
        id: 'pmp-6',
        title: 'Cliente aceitou a contraproposta',
        category: 'aceite',
        text: `Olá! Temos ótimas novidades! O cliente aceitou sua contraproposta.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e verifique a movimentação.`,
      },
      {
        id: 'pmp-7',
        title: 'Sua contraproposta foi aceita pelo cliente',
        category: 'aceite',
        text: `Olá! Sua contraproposta foi aceita pelo cliente. A negociação avançou para a próxima etapa.

Por gentileza, acesse Minhas Propostas para acompanhar a movimentação.`,
      },
      {
        id: 'pmp-8',
        title: 'Contrato em preparação',
        category: 'contrato_preparacao',
        text: `Olá! Temos novidades! Estamos preparando seu contrato para assinatura.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e acompanhe a movimentação.`,
      },
      {
        id: 'pmp-9',
        title: 'Contrato pronto para conferência',
        category: 'contrato_conferencia',
        text: `Olá! Temos novidades! Seu contrato está pronto para conferência.

Por gentileza, acesse Minhas Propostas, entre em Contrato Finalizado, identificado pela cor verde, e clique em Visualizar Contrato PDF para realizar a conferência.

Estando tudo correto, avançaremos para a assinatura.`,
      },
      {
        id: 'pmp-10',
        title: 'Contrato pronto para assinatura',
        category: 'assinatura',
        text: `Olá! Temos novidades! Seu contrato está pronto para assinatura.

Por gentileza, acesse Minhas Propostas e clique em Assinar na D4Sign, identificado pela cor laranja. Você será redirecionado para realizar a assinatura do contrato.`,
      },
    ],
  },
  {
    id: 'finalizacao',
    title: 'FINALIZAÇÃO',
    subtitle: 'Mensagens comemorativas e de encerramento da negociação',
    icon: PartyPopper,
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    cards: [
      {
        id: 'fin-1',
        title: 'Contrato assinado',
        category: 'finalizacao',
        text: `🎉 Contrato assinado com sucesso! Parabéns!

Agradecemos pela confiança. O contrato foi assinado por todas as partes e a negociação avançou para a etapa final.`,
      },
      {
        id: 'fin-2',
        title: 'Contrato finalizado',
        category: 'finalizacao',
        text: `🎉 Contrato finalizado com sucesso!

Parabéns! Todo o processo foi concluído com sucesso. Agradecemos pela confiança!`,
      },
    ],
  },
]

export default function Proposals() {
  const [selectedContact, setSelectedContact] = useState<any | null>(null)
  const [sendingCardId, setSendingCardId] = useState<string | null>(null)
  const [statusMap, setStatusMap] = useState<
    Record<
      string,
      {
        state: 'idle' | 'success' | 'error'
        message?: string
      }
    >
  >({})
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null)

  // Extrair e normalizar telefone do contato selecionado
  const rawPhone =
    selectedContact?.phone ||
    (selectedContact?.remote_jid ? selectedContact.remote_jid.replace(/@.*$/, '') : '')
  const normalizedPhone = normalizePhoneNumber(rawPhone) || rawPhone?.replace(/\D/g, '')

  const handleCopyText = async (cardId: string, text: string, title: string) => {
    try {
      const fullMessage = formatWhatsAppMessage(text, title)
      await navigator.clipboard.writeText(fullMessage)
      setCopiedCardId(cardId)
      toast({
        title: 'Texto copiado!',
        description: 'Mensagem completa com título em negrito e rodapé copiada.',
      })
      setTimeout(() => {
        setCopiedCardId(null)
      }, 2000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendMessage = async (card: ProposalMessageCard) => {
    if (!selectedContact) {
      toast({
        variant: 'destructive',
        title: 'Selecione um contato primeiro',
        description: 'Escolha um contato no seletor acima para poder enviar a mensagem.',
      })
      return
    }

    if (!normalizedPhone) {
      toast({
        variant: 'destructive',
        title: 'Telefone inválido',
        description: 'O contato selecionado não possui um número de WhatsApp válido.',
      })
      return
    }

    setSendingCardId(card.id)
    setStatusMap((prev) => ({
      ...prev,
      [card.id]: { state: 'idle' },
    }))

    try {
      const fullMessage = formatWhatsAppMessage(card.text, card.title)
      const coverImage =
        CATEGORY_COVER_IMAGES[card.category] || CATEGORY_COVER_IMAGES.proposta_enviada

      const response = await pb.send<{
        ok?: boolean
        messageId?: string
        error?: string
        mode?: 'media' | 'text'
      }>('/backend/v1/whatsapp/send', {
        method: 'POST',
        body: {
          to: normalizedPhone,
          text: fullMessage,
          caption: fullMessage,
          media_url: coverImage,
          media_type: 'image',
          mime_type: 'image/jpeg',
          file_name: `${card.category}.jpg`,
          event: card.category,
        },
      })

      if (response && response.ok === false) {
        throw new Error(response.error || 'Erro desconhecido ao enviar mensagem')
      }

      setStatusMap((prev) => ({
        ...prev,
        [card.id]: {
          state: 'success',
          message: 'Enviado ✓',
        },
      }))

      toast({
        title: 'Mensagem enviada com sucesso!',
        description: `"${card.title}" foi enviada para ${selectedContact.name || normalizedPhone}.`,
      })

      // Retorna ao estado normal após 5 segundos
      setTimeout(() => {
        setStatusMap((prev) => {
          if (prev[card.id]?.state === 'success') {
            const next = { ...prev }
            delete next[card.id]
            return next
          }
          return prev
        })
      }, 5000)
    } catch (err: any) {
      console.error('Erro ao enviar mensagem via WhatsApp:', err)
      const httpStatus = err?.status || err?.response?.status || err?.data?.status
      const errorDetail = err?.data?.error || err?.message || 'Tente novamente.'
      const displayMsg = httpStatus
        ? `Erro (${httpStatus}): ${errorDetail}`
        : `Erro ao enviar. ${errorDetail}`

      setStatusMap((prev) => ({
        ...prev,
        [card.id]: {
          state: 'error',
          message: displayMsg,
        },
      }))

      toast({
        variant: 'destructive',
        title: 'Falha no envio da mensagem',
        description: displayMsg,
      })
    } finally {
      setSendingCardId(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top Header & Sticky Contact Selector Bar */}
      <div className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 backdrop-blur-sm shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm shadow-violet-500/20">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-zinc-900">Propostas</h1>
                  <p className="text-xs text-zinc-500">
                    Mensagens padronizadas e prontas para envio aos participantes das negociações
                  </p>
                </div>
              </div>
            </div>

            {/* Contact Selector */}
            <div className="w-full md:w-96 flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-violet-600" />
                Contato de destino
              </span>
              <ContactSelector
                selectedContact={selectedContact}
                onSelect={(contact) => {
                  setSelectedContact(contact)
                  // Limpa status anteriores ao trocar de contato
                  setStatusMap({})
                }}
              />
              {selectedContact && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-0.5">
                  <span className="truncate">
                    Selecionado:{' '}
                    <strong className="text-zinc-800">
                      {selectedContact.name || selectedContact.phone || 'Sem nome'}
                    </strong>
                  </span>
                  {normalizedPhone ? (
                    <span className="font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60 shrink-0">
                      +{normalizedPhone}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium shrink-0">Número ausente</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: 3 Sections */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {!selectedContact && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-violet-200 bg-violet-50/70 text-violet-900 shadow-xs">
            <Info className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
            <div className="text-[13px] leading-relaxed">
              <strong className="font-semibold block text-violet-950">
                Dica: Selecione um contato no topo
              </strong>
              Para disparar qualquer mensagem diretamente via WhatsApp, selecione o contato desejado
              no seletor no topo da página. O botão de envio será habilitado automaticamente para
              cada mensagem.
            </div>
          </div>
        )}

        {SECTIONS.map((section) => {
          const SectionIcon = section.icon
          return (
            <section key={section.id} className="space-y-4">
              {/* Section Header */}
              <div className="border-b border-zinc-200/80 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                    <SectionIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold tracking-tight text-zinc-900">
                        {section.title}
                      </h2>
                      <Badge variant="outline" className={section.badgeColor}>
                        {section.cards.length} mensagens
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{section.subtitle}</p>
                  </div>
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {section.cards.map((card, index) => {
                  const isSending = sendingCardId === card.id
                  const cardStatus = statusMap[card.id]
                  const hasContact = Boolean(selectedContact && normalizedPhone)
                  const isCopied = copiedCardId === card.id

                  const visual =
                    CATEGORY_VISUALS[card.category] || CATEGORY_VISUALS.proposta_enviada
                  const VisualIcon = visual.icon

                  return (
                    <Card
                      key={card.id}
                      className="group border-zinc-200/80 bg-white hover:border-violet-300 hover:shadow-md transition-all duration-200 shadow-xs flex flex-col justify-between overflow-hidden"
                    >
                      {/* Top Visual Header / Cover Image */}
                      <div
                        className={`relative h-24 w-full bg-gradient-to-r ${visual.bannerGradient} p-3.5 flex items-end justify-between overflow-hidden select-none`}
                      >
                        {/* Decorative pattern overlays */}
                        <div
                          className="absolute inset-0 opacity-15 mix-blend-overlay pointer-events-none"
                          style={{
                            backgroundImage:
                              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                            backgroundSize: '12px 12px',
                          }}
                        />
                        <div className="absolute -right-6 -bottom-8 opacity-20 pointer-events-none text-white transform rotate-12">
                          <VisualIcon className="h-32 w-32" />
                        </div>

                        {/* Top-left category badge */}
                        <div className="relative z-10 flex items-center gap-2">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${visual.iconBg} shadow-sm transition-transform duration-200 group-hover:scale-105`}
                          >
                            <VisualIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide uppercase bg-black/25 text-white/95 backdrop-blur-xs border border-white/20">
                              {visual.label}
                            </span>
                            <div className="text-[11px] text-white/80 font-medium mt-0.5">
                              Etapa #{index + 1}
                            </div>
                          </div>
                        </div>

                        {/* Top-right subtle card index badge */}
                        <div className="relative z-10 flex items-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-bold text-white border border-white/30">
                            {index + 1}
                          </span>
                        </div>
                      </div>

                      <CardHeader className="pb-2.5 pt-3.5 px-4 border-b border-zinc-100 flex flex-row items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">
                            {card.title}
                          </CardTitle>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-zinc-700 shrink-0"
                          onClick={() => handleCopyText(card.id, card.text, card.title)}
                          title="Copiar texto com rodapé"
                        >
                          {isCopied ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </CardHeader>

                      <CardContent className="pt-3 px-4 pb-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="bg-zinc-50/90 rounded-lg p-3 border border-zinc-100/90 text-[13px] text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed">
                            {card.text}
                          </div>

                          {/* Subtle hint that footer is appended on send/copy */}
                          <div className="mt-2 text-[11px] text-zinc-400 flex items-center gap-1.5 px-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80 inline-block" />
                            <span>Rodapé com links e canais de atendimento anexado no envio</span>
                          </div>
                        </div>

                        {/* Status feedback message */}
                        {cardStatus?.state === 'success' && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-md border border-emerald-200/70 animate-in fade-in duration-200">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>{cardStatus.message || 'Enviado ✓'}</span>
                          </div>
                        )}

                        {cardStatus?.state === 'error' && (
                          <div className="mt-2.5 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 p-2 rounded-md border border-red-200/70 animate-in fade-in duration-200">
                            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                            <span className="flex-1 break-words">
                              {cardStatus.message || 'Erro ao enviar. Tente novamente.'}
                            </span>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="pt-2 px-4 pb-3 border-t border-zinc-100 bg-zinc-50/40">
                        <Button
                          size="sm"
                          className="w-full text-xs font-medium h-9 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 transition-colors shadow-xs"
                          onClick={() => handleSendMessage(card)}
                          disabled={!hasContact || isSending}
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {isSending
                            ? 'Disparando...'
                            : hasContact
                              ? 'Enviar no WhatsApp'
                              : 'Selecione um contato primeiro'}
                        </Button>
                      </CardFooter>
                    </Card>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
