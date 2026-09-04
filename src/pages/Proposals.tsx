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
} from 'lucide-react'
import { ContactSelector } from '@/components/inbox/ContactSelector'
import { normalizePhoneNumber } from '@/services/proposals'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'

interface ProposalMessageCard {
  id: string
  title: string
  text: string
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
    subtitle: 'Comunicações enviadas ao cliente/comprador referente às etapas de negociação',
    icon: User,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    cards: [
      {
        id: 'cn-1',
        title: 'Proposta enviada',
        text: 'Olá! Sua proposta foi encaminhada ao proprietário. Por gentileza, aguarde. Em breve retornaremos com novidades sobre a negociação.',
      },
      {
        id: 'cn-2',
        title: 'Proprietário fez uma contraproposta',
        text: `Olá! Temos novidades sobre sua proposta. O proprietário analisou sua proposta e enviou uma contraproposta.

Por gentileza, acesse nosso portal, vá até Negociações e verifique a movimentação.`,
      },
      {
        id: 'cn-3',
        title: 'Cliente fez uma contraproposta',
        text: `Olá! Temos novidades sobre sua contraproposta. O cliente analisou sua proposta e enviou uma nova contraproposta.

Por gentileza, acesse nosso portal, vá até Negociações e verifique a movimentação.`,
      },
      {
        id: 'cn-4',
        title: 'Contraproposta recusada pelo cliente',
        text: `Olá! Infelizmente, o cliente analisou sua contraproposta e não a aceitou.

Para mais informações, entre em contato conosco pelo telefone (11) 4422-7729 ou envie uma mensagem por aqui.`,
      },
      {
        id: 'cn-5',
        title: 'Contraproposta recusada pelo proprietário',
        text: `Olá! Infelizmente, o proprietário analisou sua contraproposta e não a aceitou.

Para mais informações, entre em contato conosco pelo telefone (11) 4422-7729 ou envie uma mensagem por aqui.`,
      },
      {
        id: 'cn-6',
        title: 'Cliente aceitou a contraproposta',
        text: `Olá! Temos ótimas novidades! O cliente aceitou sua contraproposta.

Por gentileza, acesse nosso portal, vá até Negociações e verifique a movimentação.`,
      },
      {
        id: 'cn-7',
        title: 'Proprietário aceitou a contraproposta',
        text: `Olá! Temos ótimas novidades! O proprietário aceitou sua contraproposta.

Por gentileza, acesse nosso portal, vá até Negociações e verifique a movimentação.`,
      },
      {
        id: 'cn-8',
        title: 'Contrato em preparação',
        text: `Olá! Temos novidades! Estamos preparando seu contrato para assinatura.

Por gentileza, acesse nosso portal, vá até Negociações e acompanhe a movimentação.`,
      },
      {
        id: 'cn-9',
        title: 'Contrato pronto para conferência',
        text: `Olá! Temos novidades! Seu contrato está pronto para conferência.

Por gentileza, acesse Negociações, entre em Contrato Finalizado, identificado pela cor verde, e clique em Visualizar PDF do Contrato para realizar a conferência.

Estando tudo correto, avançaremos para a assinatura.`,
      },
      {
        id: 'cn-10',
        title: 'Contrato pronto para assinatura',
        text: `Olá! Temos novidades! Seu contrato está pronto para assinatura.

Por gentileza, acesse Negociações e clique em Assinar na D4Sign, identificado pela cor laranja. Você será redirecionado para realizar a assinatura do contrato.`,
      },
    ],
  },
  {
    id: 'proprietario_minhas_propostas',
    title: 'PROPRIETÁRIO — MINHAS PROPOSTAS',
    subtitle: 'Comunicações enviadas ao proprietário referente às etapas da negociação no portal',
    icon: Building,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cards: [
      {
        id: 'pmp-1',
        title: 'Proposta enviada',
        text: 'Olá! Sua proposta foi encaminhada ao cliente. Por gentileza, aguarde. Em breve retornaremos com novidades sobre a negociação.',
      },
      {
        id: 'pmp-2',
        title: 'Cliente fez uma contraproposta',
        text: `Olá! Temos novidades sobre sua proposta. O cliente analisou sua proposta e enviou uma contraproposta.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e verifique a movimentação.`,
      },
      {
        id: 'pmp-3',
        title: 'Proprietário fez uma contraproposta',
        text: `Olá! Temos novidades sobre sua contraproposta. O proprietário analisou a negociação e enviou uma nova contraproposta.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e verifique a movimentação.`,
      },
      {
        id: 'pmp-4',
        title: 'Contraproposta recusada pelo cliente',
        text: `Olá! Infelizmente, o cliente analisou sua contraproposta e não a aceitou.

Para mais informações, entre em contato conosco pelo telefone (11) 4422-7729 ou envie uma mensagem por aqui.`,
      },
      {
        id: 'pmp-5',
        title: 'Contraproposta recusada pelo proprietário',
        text: `Olá! Infelizmente, o proprietário analisou a contraproposta e não a aceitou.

Para mais informações, entre em contato conosco pelo telefone (11) 4422-7729 ou envie uma mensagem por aqui.`,
      },
      {
        id: 'pmp-6',
        title: 'Cliente aceitou a contraproposta',
        text: `Olá! Temos ótimas novidades! O cliente aceitou sua contraproposta.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e verifique a movimentação.`,
      },
      {
        id: 'pmp-7',
        title: 'Proprietário aceitou a contraproposta',
        text: `Olá! Temos ótimas novidades! O proprietário aceitou sua contraproposta.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e verifique a movimentação.`,
      },
      {
        id: 'pmp-8',
        title: 'Contrato em preparação',
        text: `Olá! Temos novidades! Estamos preparando seu contrato para assinatura.

Por gentileza, acesse nosso portal, vá até Minhas Propostas e acompanhe a movimentação.`,
      },
      {
        id: 'pmp-9',
        title: 'Contrato pronto para conferência',
        text: `Olá! Temos novidades! Seu contrato está pronto para conferência.

Por gentileza, acesse Minhas Propostas, entre em Contrato Finalizado, identificado pela cor verde, e clique em Visualizar Contrato PDF para realizar a conferência.

Estando tudo correto, avançaremos para a assinatura.`,
      },
      {
        id: 'pmp-10',
        title: 'Contrato pronto para assinatura',
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
        text: `🎉 Contrato assinado com sucesso! Parabéns!

Agradecemos pela confiança. Sua negociação avançou com sucesso para a próxima etapa.`,
      },
      {
        id: 'fin-2',
        title: 'Contrato finalizado',
        text: `🎉 Contrato finalizado com sucesso!

Parabéns! Todo o processo foi concluído. Agradecemos pela confiança.`,
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

  const handleCopyText = async (cardId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCardId(cardId)
      toast({
        title: 'Texto copiado!',
        description: 'Mensagem copiada para a área de transferência.',
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
      const response = await pb.send<{ ok?: boolean; messageId?: string; error?: string }>(
        '/backend/v1/whatsapp/send',
        {
          method: 'POST',
          body: {
            to: normalizedPhone,
            text: card.text,
          },
        },
      )

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

                  return (
                    <Card
                      key={card.id}
                      className="border-zinc-200/80 bg-white hover:border-violet-300 transition-all duration-200 shadow-xs flex flex-col justify-between"
                    >
                      <CardHeader className="pb-3 pt-4 px-4 border-b border-zinc-100 flex flex-row items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-bold text-violet-700">
                            {index + 1}
                          </span>
                          <CardTitle className="text-sm font-semibold text-zinc-900 truncate">
                            {card.title}
                          </CardTitle>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-400 hover:text-zinc-700 shrink-0"
                          onClick={() => handleCopyText(card.id, card.text)}
                          title="Copiar texto"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </CardHeader>

                      <CardContent className="pt-3.5 px-4 pb-3 flex-1">
                        <div className="bg-zinc-50/90 rounded-lg p-3 border border-zinc-100/90 text-[13px] text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed">
                          {card.text}
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
                          className="w-full text-xs font-medium h-9 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 transition-colors"
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
