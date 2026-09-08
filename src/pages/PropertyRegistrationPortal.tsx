import { useState, useMemo } from 'react'
import {
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  UserCheck,
  Search,
  X,
  Pencil,
  Info,
  Clock,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ContactSelector } from '@/components/inbox/ContactSelector'
import { normalizePhoneNumber } from '@/services/proposals'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

export const PORTAL_CADASTRO_FOOTER = `Site: www.3atoimoveis.com.br
Tel e Whatsapp: (11) 4422-7729
Email: atendimento@3atoimoveis.com.br | 3atoimoveis@gmail.com`

export function getGoogleDriveMediaUrl(driveId: string): string {
  return `https://drive.google.com/uc?export=download&id=${driveId}`
}

export function getGoogleDriveThumbnailUrl(driveId: string): string {
  return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`
}

export function formatPortalWhatsAppMessage(cardText: string, cardTitle?: string): string {
  const trimmed = cardText.trimEnd()
  const header = cardTitle ? `*${cardTitle.trim()}*` : ''
  if (trimmed) {
    return header
      ? `${header}\n\n${trimmed}\n\n${PORTAL_CADASTRO_FOOTER}`
      : `${trimmed}\n\n${PORTAL_CADASTRO_FOOTER}`
  }
  return header ? `${header}\n\n${PORTAL_CADASTRO_FOOTER}` : PORTAL_CADASTRO_FOOTER
}

export interface PortalRegistrationCard {
  id: string
  /** Título com emoji para exibição no card do painel */
  displayTitle: string
  /** Título limpo SEM emojis para envio no WhatsApp entre asteriscos */
  whatsappTitle: string
  text: string
  driveId: string
  mediaUrl: string
  displayUrl: string
  badgeLabel: string
  icon: LucideIcon
  iconBg: string
}

export const PORTAL_CARDS: PortalRegistrationCard[] = [
  {
    id: 'portal-recebida',
    displayTitle: '📩 Solicitação de Cadastro Recebida',
    whatsappTitle: 'Solicitação de Cadastro Recebida',
    driveId: '1cLAPcfw7Ke-1UGgFv1w0E-79hA1tueli',
    mediaUrl: getGoogleDriveMediaUrl('1cLAPcfw7Ke-1UGgFv1w0E-79hA1tueli'),
    displayUrl: getGoogleDriveThumbnailUrl('1cLAPcfw7Ke-1UGgFv1w0E-79hA1tueli'),
    badgeLabel: 'Recebida',
    icon: FileText,
    iconBg: 'bg-blue-600/90 text-white',
    text: `Olá! Sua solicitação de cadastro de imóvel foi recebida com sucesso.

Nossa equipe realizará a análise das informações e documentos enviados. Aguarde a conclusão da avaliação e, caso seja necessário, entraremos em contato para solicitar informações adicionais.

Agradecemos por escolher a 3º Ato Imóveis e Negócios.`,
  },
  {
    id: 'portal-aprovado',
    displayTitle: '✅ Cadastro de Imóvel Aprovado',
    whatsappTitle: 'Cadastro de Imóvel Aprovado',
    driveId: '1SpvwSOtgUHDI8JEphb1w6YF1zGUvJnwp',
    mediaUrl: getGoogleDriveMediaUrl('1SpvwSOtgUHDI8JEphb1w6YF1zGUvJnwp'),
    displayUrl: getGoogleDriveThumbnailUrl('1SpvwSOtgUHDI8JEphb1w6YF1zGUvJnwp'),
    badgeLabel: 'Aprovado',
    icon: CheckCircle2,
    iconBg: 'bg-emerald-600/90 text-white',
    text: `Olá! Temos uma ótima notícia! 🎉

Após a análise realizada por nossa equipe, o cadastro do seu imóvel foi aprovado com sucesso.

Seu imóvel estará disponível em nosso site para divulgação. Para visualizá-lo, acesse:
www.3atoimoveis.com.br

Em seguida, selecione a categoria correspondente ao tipo de imóvel cadastrado.

Agradecemos pela confiança na 3º Ato Imóveis e Negócios!`,
  },
  {
    id: 'portal-reprovado',
    displayTitle: '❌ Cadastro de Imóvel Reprovado',
    whatsappTitle: 'Cadastro de Imóvel Reprovado',
    driveId: '1cN0n7P6CLmdSZwruAzFGEdK7h0rMTfqt',
    mediaUrl: getGoogleDriveMediaUrl('1cN0n7P6CLmdSZwruAzFGEdK7h0rMTfqt'),
    displayUrl: getGoogleDriveThumbnailUrl('1cN0n7P6CLmdSZwruAzFGEdK7h0rMTfqt'),
    badgeLabel: 'Reprovado',
    icon: XCircle,
    iconBg: 'bg-rose-600/90 text-white',
    text: `Olá! Após a análise realizada por nossa equipe, informamos que o cadastro do seu imóvel não foi aprovado neste momento.

Para obter mais informações sobre o motivo da reprovação e verificar a possibilidade de adequação, entre em contato conosco pelo telefone ou WhatsApp:

📞 (11) 4422-7729

Ao entrar em contato, tenha em mãos o número do seu protocolo, para que possamos localizar sua solicitação e orientá-lo da melhor forma.

A 3º Ato Imóveis e Negócios está à disposição para ajudá-lo.`,
  },
  {
    id: 'portal-revisao',
    displayTitle: '🔎 Cadastro de Imóvel em Revisão',
    whatsappTitle: 'Cadastro de Imóvel em Revisão',
    driveId: '15UZfmQ0bJUl8ZH22LBY7HLlug26D-3dW',
    mediaUrl: getGoogleDriveMediaUrl('15UZfmQ0bJUl8ZH22LBY7HLlug26D-3dW'),
    displayUrl: getGoogleDriveThumbnailUrl('15UZfmQ0bJUl8ZH22LBY7HLlug26D-3dW'),
    badgeLabel: 'Em Revisão',
    icon: Clock,
    iconBg: 'bg-amber-600/90 text-white',
    text: `Olá! Após a análise realizada por nossa equipe, identificamos a necessidade de revisar algumas informações do cadastro do seu imóvel antes de sua liberação.

Seu cadastro encontra-se temporariamente em revisão. Nossa equipe entrará em contato para confirmar ou complementar algumas informações.

Por favor, aguarde nosso contato. Assim que a revisão for concluída, você será informado sobre a liberação do cadastro.

Agradecemos pela compreensão e pela confiança na 3º Ato Imóveis e Negócios.`,
  },
]

export default function PropertyRegistrationPortal() {
  const [selectedContact, setSelectedContact] = useState<any | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
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

  // Estado efêmero de edição de mensagem por card (apenas para aquele envio)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({})
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({})

  const handleStartEdit = (cardId: string, currentText: string) => {
    setEditingCardId(cardId)
    setDraftTexts((prev) => ({
      ...prev,
      [cardId]: customTexts[cardId] ?? currentText,
    }))
  }

  const handleSaveEdit = (cardId: string) => {
    const draft = draftTexts[cardId]
    if (draft !== undefined) {
      setCustomTexts((prev) => ({
        ...prev,
        [cardId]: draft,
      }))
    }
    setEditingCardId(null)
  }

  const handleCancelEdit = (cardId: string) => {
    setEditingCardId(null)
    setDraftTexts((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
  }

  const handleResetCardText = (cardId: string) => {
    setCustomTexts((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
    setDraftTexts((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
    if (editingCardId === cardId) {
      setEditingCardId(null)
    }
  }

  // Extrair e normalizar telefone do contato selecionado
  const rawPhone =
    selectedContact?.phone ||
    (selectedContact?.remote_jid ? selectedContact.remote_jid.replace(/@.*$/, '') : '')
  const normalizedPhone = normalizePhoneNumber(rawPhone) || rawPhone?.replace(/\D/g, '')

  // Filtragem dos cards em tempo real por título ou texto da mensagem
  const filteredCards = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return PORTAL_CARDS

    return PORTAL_CARDS.filter((card) => {
      const titleMatch =
        card.displayTitle.toLowerCase().includes(term) ||
        card.whatsappTitle.toLowerCase().includes(term)
      const custom = customTexts[card.id] || ''
      const textMatch =
        card.text.toLowerCase().includes(term) || custom.toLowerCase().includes(term)
      return titleMatch || textMatch
    })
  }, [searchTerm, customTexts])

  const handleCopyText = async (card: PortalRegistrationCard, text: string) => {
    try {
      const fullMessage = formatPortalWhatsAppMessage(text, card.whatsappTitle)
      await navigator.clipboard.writeText(fullMessage)
      setCopiedCardId(card.id)
      toast({
        title: 'Texto copiado!',
        description:
          'Mensagem com título em negrito e rodapé oficial copiada para a área de transferência.',
      })
      setTimeout(() => {
        setCopiedCardId(null)
      }, 2000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendMessage = async (card: PortalRegistrationCard) => {
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

    // Se estiver em modo de edição ao disparar, utiliza o rascunho atual
    const effectiveText =
      editingCardId === card.id
        ? (draftTexts[card.id] ?? customTexts[card.id] ?? card.text)
        : (customTexts[card.id] ?? card.text)

    setSendingCardId(card.id)
    setStatusMap((prev) => ({
      ...prev,
      [card.id]: { state: 'idle' },
    }))

    try {
      // O título enviado ao WhatsApp fica em negrito SEM os emojis (*Cadastro de Imóvel Aprovado*)
      const fullMessage = formatPortalWhatsAppMessage(effectiveText, card.whatsappTitle)

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
          media_url: card.mediaUrl,
          media_type: 'image',
          mime_type: 'image/jpeg',
          file_name: `${card.id}.jpg`,
          event: `portal_${card.id}`,
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

      // Fecha modo de edição e reseta texto personalizado deste card após o envio (edição efêmera apenas para este envio)
      if (editingCardId === card.id) {
        setEditingCardId(null)
      }
      setDraftTexts((prev) => {
        const next = { ...prev }
        delete next[card.id]
        return next
      })
      setCustomTexts((prev) => {
        const next = { ...prev }
        delete next[card.id]
        return next
      })

      toast({
        title: 'Mensagem enviada com sucesso!',
        description: `"${card.whatsappTitle}" foi enviada para ${selectedContact.name || normalizedPhone}.`,
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
                  <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                    Portal de Cadastro de Imóveis dos Clientes
                  </h1>
                  <p className="text-xs text-zinc-500">
                    Notificações e etapas do processo de cadastro de imóveis dos proprietários
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

          {/* Search / Filter Input */}
          <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Buscar por título ou mensagem (ex: aprovado, reprovado, revisão, recebida)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9 h-9.5 bg-zinc-50/80 border-zinc-200 text-sm focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-400 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 transition-colors"
                  title="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-500 self-end sm:self-auto shrink-0">
              {searchTerm ? (
                <span className="font-medium text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-200/60">
                  {filteredCards.length}{' '}
                  {filteredCards.length === 1 ? 'card encontrado' : 'cards encontrados'}
                </span>
              ) : (
                <span className="text-zinc-400">
                  Total de {PORTAL_CARDS.length} mensagens disponíveis
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {!selectedContact && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-violet-200 bg-violet-50/70 text-violet-900 shadow-xs">
            <Info className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
            <div className="text-[13px] leading-relaxed">
              <strong className="font-semibold block text-violet-950">
                Dica: Selecione um contato no topo
              </strong>
              Para disparar qualquer mensagem diretamente via WhatsApp com imagem e rodapé oficial,
              selecione o contato no seletor acima. O botão de envio será habilitado
              automaticamente.
            </div>
          </div>
        )}

        {filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-zinc-200 bg-white">
            <div className="h-12 w-12 rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <Search className="h-5 w-5 text-violet-500" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900">Nenhuma mensagem encontrada</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Não encontramos nenhum card com o termo &ldquo;{searchTerm}&rdquo; no título ou no
              texto da mensagem.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 text-xs font-medium border-violet-200 text-violet-700 hover:bg-violet-50"
              onClick={() => setSearchTerm('')}
            >
              Limpar filtro de busca
            </Button>
          </div>
        ) : (
          <section className="space-y-4">
            <div className="border-b border-zinc-200/80 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight text-zinc-900">
                    Etapas do Cadastro de Imóveis
                  </h2>
                  <Badge
                    variant="outline"
                    className="bg-violet-50 text-violet-700 border-violet-200"
                  >
                    {filteredCards.length} {filteredCards.length === 1 ? 'mensagem' : 'mensagens'}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Mensagens oficiais com arte visual anexada e rodapé de contato padronizado
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
              {filteredCards.map((card, index) => {
                const isSending = sendingCardId === card.id
                const cardStatus = statusMap[card.id]
                const hasContact = Boolean(selectedContact && normalizedPhone)
                const isCopied = copiedCardId === card.id
                const CardIcon = card.icon

                return (
                  <Card
                    key={card.id}
                    className="group border-zinc-200/80 bg-white hover:border-violet-300 hover:shadow-md transition-all duration-200 shadow-xs flex flex-col justify-between overflow-hidden"
                  >
                    {/* Top Cover Image from Google Drive */}
                    <div className="relative h-44 w-full bg-zinc-100 overflow-hidden select-none border-b border-zinc-100">
                      <img
                        src={card.displayUrl}
                        alt={card.whatsappTitle}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          const target = e.currentTarget
                          target.style.display = 'none'
                        }}
                      />

                      {/* Overlay gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30 pointer-events-none" />

                      {/* Top-left category badge */}
                      <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-2">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg} shadow-sm backdrop-blur-md`}
                        >
                          <CardIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide uppercase bg-black/65 text-white backdrop-blur-md border border-white/20">
                            {card.badgeLabel}
                          </span>
                        </div>
                      </div>

                      {/* Top-right card index */}
                      <div className="absolute top-2.5 right-3 z-10 flex items-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 backdrop-blur-md text-[10.5px] font-bold text-white border border-white/30">
                          {index + 1}
                        </span>
                      </div>
                    </div>

                    <CardHeader className="pb-2.5 pt-3.5 px-4 border-b border-zinc-100 flex flex-row items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm font-semibold text-zinc-900 leading-snug">
                          {card.displayTitle}
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-zinc-700 shrink-0"
                        onClick={() => {
                          const activeText =
                            editingCardId === card.id
                              ? (draftTexts[card.id] ?? customTexts[card.id] ?? card.text)
                              : (customTexts[card.id] ?? card.text)
                          handleCopyText(card, activeText)
                        }}
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
                        {editingCardId === card.id ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-violet-700">
                              <span className="flex items-center gap-1">
                                <Pencil className="h-3 w-3" />
                                Editando para este envio
                              </span>
                              <span className="text-[10.5px] font-normal text-zinc-400">
                                Padrão preservado
                              </span>
                            </div>
                            <Textarea
                              value={draftTexts[card.id] ?? ''}
                              onChange={(e) =>
                                setDraftTexts((prev) => ({
                                  ...prev,
                                  [card.id]: e.target.value,
                                }))
                              }
                              rows={6}
                              className="text-[13px] leading-relaxed bg-white border-violet-300 focus-visible:ring-violet-500/30 focus-visible:border-violet-500 resize-y min-h-[140px]"
                              placeholder="Escreva a mensagem personalizada para este envio..."
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2.5 text-xs text-zinc-600 hover:text-zinc-900"
                                onClick={() => handleCancelEdit(card.id)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-xs"
                                onClick={() => handleSaveEdit(card.id)}
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative group/msg">
                            <div
                              className={`rounded-lg p-3 border text-[13px] whitespace-pre-wrap font-sans leading-relaxed transition-colors ${
                                customTexts[card.id] !== undefined
                                  ? 'bg-amber-50/60 border-amber-200/80 text-zinc-800'
                                  : 'bg-zinc-50/90 border-zinc-100/90 text-zinc-700'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">{customTexts[card.id] ?? card.text}</div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-[11px] text-violet-600 hover:text-violet-800 hover:bg-violet-100/70 -mr-1 -mt-1 shrink-0 font-medium flex items-center gap-1"
                                  onClick={() => handleStartEdit(card.id, card.text)}
                                  title="Editar texto para este envio"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Editar
                                </Button>
                              </div>
                            </div>
                            {customTexts[card.id] !== undefined && (
                              <div className="mt-1 flex items-center justify-between text-[11px] text-amber-700 px-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
                                  Texto editado (válido apenas para este envio)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleResetCardText(card.id)}
                                  className="text-zinc-400 hover:text-zinc-600 underline text-[10.5px]"
                                >
                                  Restaurar original
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Rodapé fixo informativo */}
                        <div className="mt-3 p-2.5 rounded-md bg-zinc-100/80 border border-zinc-200/60 text-[11px] text-zinc-600 leading-tight space-y-0.5">
                          <span className="font-semibold text-zinc-700 block text-[10px] uppercase tracking-wider mb-0.5">
                            Rodapé anexado automaticamente:
                          </span>
                          <p>Site: www.3atoimoveis.com.br</p>
                          <p>Tel e Whatsapp: (11) 4422-7729</p>
                          <p>Email: atendimento@3atoimoveis.com.br | 3atoimoveis@gmail.com</p>
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
        )}
      </div>
    </div>
  )
}
