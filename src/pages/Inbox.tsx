import { useEffect, useState, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  getContacts,
  getMessages,
  sendMessage,
  getInstances,
  logoutInstance,
  toggleContactAgent,
} from '@/services/whatsapp'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
  Search,
  Send,
  User,
  Loader2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Image as ImageIcon,
  FileAudio,
  FileText,
  Download,
  X,
  Mic,
  Trash2,
  Square,
  Bot,
  BotOff,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PropertyCatalog } from '@/components/inbox/PropertyCatalog'
import type { Property } from '@/services/properties'

export default function Inbox() {
  const [contacts, setContacts] = useState<any[]>([])
  const [filteredContacts, setFilteredContacts] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [instance, setInstance] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('conversas')

  // File states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [fileType, setFileType] = useState<'image' | 'audio' | 'document' | 'video'>('image')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileToken, setFileToken] = useState<string>('')

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const isFirstLoadRef = useRef(true)
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const sortMessagesList = (msgs: any[]) => {
    return [...msgs].sort((a, b) => {
      const timeA = new Date(a.created || a.sent_at || 0).getTime()
      const timeB = new Date(b.created || b.sent_at || 0).getTime()
      if (timeA === timeB) {
        if (a.direction === 'in' && b.direction === 'out') return -1
        if (a.direction === 'out' && b.direction === 'in') return 1
        return (a.id || '').localeCompare(b.id || '')
      }
      return timeA - timeB
    })
  }

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    }
  }, [audioPreviewUrl])

  useEffect(() => {
    const init = async () => {
      const insts = await getInstances()
      if (insts.length > 0) {
        setInstance(insts[0])
      }

      try {
        const data = await getContacts()
        setContacts(data)
        setFilteredContacts(data)

        if (location.state?.contactId) {
          const contact = data.find((c) => c.id === location.state.contactId)
          if (contact) setSelectedContact(contact)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingContacts(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchToken = async () => {
      try {
        const t = await pb.files.getToken()
        if (!cancelled) setFileToken(t)
      } catch (e) {
        console.error('Failed to fetch file token', e)
      }
    }
    fetchToken()
    const interval = setInterval(fetchToken, 4 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useRealtime('whatsapp_instances', async () => {
    const insts = await getInstances()
    if (insts.length > 0) {
      setInstance(insts[0])
    }
  })

  useRealtime('whatsapp_contacts', (e) => {
    setContacts((prev) => {
      if (e.action === 'create') {
        if (prev.find((c) => c.id === e.record.id)) return prev
        return [e.record, ...prev]
      } else if (e.action === 'update') {
        return prev.map((c) => (c.id === e.record.id ? e.record : c))
      } else if (e.action === 'delete') {
        return prev.filter((c) => c.id !== e.record.id)
      }
      return prev
    })
    setSelectedContact((prev: any) => {
      if (prev && prev.id === e.record.id) {
        return e.action === 'delete' ? null : { ...prev, ...e.record }
      }
      return prev
    })
  })

  const selectedContactId = selectedContact?.id

  useRealtime('whatsapp_messages', (e) => {
    if (selectedContactId && e.record.contact_id === selectedContactId) {
      if (e.action === 'create') {
        setMessages((prev) => {
          if (prev.find((m) => m.id === e.record.id)) return prev
          return sortMessagesList([...prev, e.record])
        })
      } else if (e.action === 'update') {
        setMessages((prev) =>
          sortMessagesList(prev.map((m) => (m.id === e.record.id ? e.record : m))),
        )
      } else if (e.action === 'delete') {
        setMessages((prev) => prev.filter((m) => m.id !== e.record.id))
      }
    }
  })

  useEffect(() => {
    if (selectedContactId) {
      setMessages([])
      isFirstLoadRef.current = true
      loadMessages(selectedContactId)
      clearFile()
    } else {
      setMessages([])
    }
  }, [selectedContactId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isFirstLoadRef.current ? 'auto' : 'smooth',
      })
      isFirstLoadRef.current = false
    }
  }, [messages])

  useEffect(() => {
    const filtered = contacts.filter(
      (c) => c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search),
    )
    filtered.sort(
      (a, b) =>
        new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime(),
    )
    setFilteredContacts(filtered)
  }, [search, contacts])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioPreviewUrl(url)

        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Error accessing microphone', err)
      toast({
        variant: 'destructive',
        title: 'Microfone bloqueado',
        description: 'Permita o acesso ao microfone no seu navegador para gravar áudios.',
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }

  const cancelRecording = () => {
    if (isRecording) {
      stopRecording()
    }
    setAudioBlob(null)
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl)
      setAudioPreviewUrl(null)
    }
    setRecordingTime(0)
    audioChunksRef.current = []
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const loadMessages = async (contactId: string) => {
    setLoadingMessages(true)
    try {
      const msgs = await getMessages(contactId)
      setMessages(sortMessagesList(msgs))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if ((!text.trim() && !selectedFile && !audioBlob) || !selectedContact) return

    let sendType = selectedFile ? fileType : 'text'
    let fileToSend: File | undefined = selectedFile || undefined

    if (audioBlob) {
      fileToSend = new File([audioBlob], 'audio.ogg', { type: 'audio/ogg' })
      sendType = 'audio'
    }

    const textToSend = text.trim()
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    let localUrl: string | undefined

    if (fileToSend) {
      localUrl = URL.createObjectURL(fileToSend)
    }

    const nowIso = new Date().toISOString()
    const optimisticMsg = {
      id: tempId,
      body: textToSend,
      direction: 'out',
      type: sendType,
      sent_at: nowIso,
      created: nowIso,
      contact_id: selectedContact.id,
      status: 'sending',
      localUrl,
      file_name: fileToSend?.name,
      mime_type: fileToSend?.type,
      caption: sendType !== 'text' ? textToSend : '',
    }

    setMessages((prev) => sortMessagesList([...prev, optimisticMsg]))

    let lastMsgPreview = textToSend
    if (sendType === 'image') lastMsgPreview = '📷 Foto'
    else if (sendType === 'video') lastMsgPreview = '🎥 Vídeo'
    else if (sendType === 'audio') lastMsgPreview = '🎵 Áudio'
    else if (sendType === 'document') lastMsgPreview = '📄 Documento'

    setContacts((prev) => {
      const updated = prev.map((c) => {
        if (c.id === selectedContact.id) {
          return {
            ...c,
            last_message: lastMsgPreview,
            last_message_at: optimisticMsg.sent_at,
          }
        }
        return c
      })
      return updated.sort(
        (a, b) =>
          new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime(),
      )
    })

    setText('')
    clearFile()
    cancelRecording()

    try {
      let base64: string | undefined
      if (fileToSend) {
        base64 = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result.split(',')[1])
          }
          reader.readAsDataURL(fileToSend!)
        })
      }

      const res = await sendMessage(selectedContact.id, {
        text: textToSend,
        file: fileToSend,
        type: sendType,
        base64,
        instance_id: selectedContact.instance_id,
        remote_jid: selectedContact.remote_jid,
      })

      const createdMsg = res?.message || res
      if (createdMsg && createdMsg.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === createdMsg.id)) {
            return prev.filter((m) => m.id !== tempId)
          }
          return sortMessagesList(prev.map((m) => (m.id === tempId ? createdMsg : m)))
        })
      } else {
        setMessages((prev) =>
          sortMessagesList(prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))),
        )
      }
    } catch (error) {
      console.error(error)
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleToggleAgent = async () => {
    if (!selectedContact) return
    const newStatus = !selectedContact.agent_paused
    try {
      setSelectedContact((prev: any) => ({ ...prev, agent_paused: newStatus }))
      setContacts((prev) =>
        prev.map((c) => (c.id === selectedContact.id ? { ...c, agent_paused: newStatus } : c)),
      )
      await toggleContactAgent(selectedContact.id, newStatus)
      toast({
        title: newStatus ? 'IA pausada para este contato' : 'IA reativada para este contato',
      })
    } catch (err) {
      setSelectedContact((prev: any) => ({ ...prev, agent_paused: !newStatus }))
      setContacts((prev) =>
        prev.map((c) => (c.id === selectedContact.id ? { ...c, agent_paused: !newStatus } : c)),
      )
      toast({ variant: 'destructive', title: 'Erro ao atualizar status da IA' })
    }
  }

  const handleSendProperty = async (property: Property) => {
    if (!selectedContact) {
      toast({ variant: 'destructive', title: 'Selecione uma conversa primeiro' })
      setActiveTab('conversas')
      return
    }

    const lines: string[] = [
      `*${property.title}*`,
      `Quartos: ${property.bedrooms ?? 0} | Banheiros: ${property.bathrooms ?? 0} | Suítes: ${property.suites ?? 0} | Vagas: ${property.parking_spots ?? 0}`,
      '',
      property.description || 'Não informado',
    ]
    const messageText = lines.join('\n')

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const nowIso = new Date().toISOString()
    const optimisticMsg = {
      id: tempId,
      body: messageText,
      direction: 'out',
      type: 'text',
      sent_at: nowIso,
      created: nowIso,
      contact_id: selectedContact.id,
      status: 'sending',
    }

    setMessages((prev) => sortMessagesList([...prev, optimisticMsg]))

    setContacts((prev) => {
      const updated = prev.map((c) =>
        c.id === selectedContact.id
          ? { ...c, last_message: '🏠 Imóvel enviado', last_message_at: nowIso }
          : c,
      )
      return updated.sort(
        (a, b) =>
          new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime(),
      )
    })

    try {
      const res = await sendMessage(selectedContact.id, {
        text: messageText,
        type: 'text',
        instance_id: selectedContact.instance_id,
        remote_jid: selectedContact.remote_jid,
      })

      const createdMsg = res?.message || res
      if (createdMsg && createdMsg.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === createdMsg.id)) {
            return prev.filter((m) => m.id !== tempId)
          }
          return sortMessagesList(prev.map((m) => (m.id === tempId ? createdMsg : m)))
        })
      } else {
        setMessages((prev) =>
          sortMessagesList(prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))),
        )
      }

      toast({ title: 'Imóvel enviado com sucesso!' })
      setActiveTab('conversas')
    } catch (error) {
      console.error(error)
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)))
      toast({ variant: 'destructive', title: 'Erro ao enviar imóvel' })
    }
  }

  const handleDisconnect = async () => {
    try {
      await logoutInstance()
      toast({ title: 'WhatsApp desconectado com sucesso' })
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao desconectar WhatsApp' })
    }
  }

  const triggerFileInput = (accept: string, type: 'image' | 'audio' | 'document') => {
    setFileType(type)
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept
      fileInputRef.current.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande (máx 50MB)' })
      return
    }

    if (file.type.startsWith('image/')) {
      setFileType('image')
      setFilePreview(URL.createObjectURL(file))
    } else if (file.type.startsWith('video/')) {
      setFileType('video')
      setFilePreview(null)
    } else if (file.type.startsWith('audio/')) {
      setFileType('audio')
      setFilePreview(null)
    } else {
      setFileType('document')
      setFilePreview(null)
    }

    setSelectedFile(file)
  }

  const clearFile = () => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const renderMessageBody = (msg: any) => {
    const isOut = msg.direction === 'out'
    const fileUrl =
      msg.localUrl ||
      (msg.media_file
        ? pb.files.getURL(
            {
              id: msg.id,
              collectionId: msg.collectionId || 'whatsapp_messages',
              collectionName: 'whatsapp_messages',
            },
            msg.media_file,
            fileToken ? { token: fileToken } : undefined,
          )
        : null)

    if (msg.type === 'image' || msg.type === 'video') {
      return (
        <div className="flex flex-col gap-2">
          {fileUrl ? (
            msg.type === 'video' ? (
              <video
                src={fileUrl}
                controls
                className="rounded-lg max-w-full h-auto max-h-64 object-cover"
              />
            ) : (
              <img
                src={fileUrl}
                alt="Media"
                className="rounded-lg max-w-full h-auto max-h-64 object-cover"
              />
            )
          ) : (
            <div className="w-48 h-32 bg-slate-200/50 animate-pulse rounded-lg flex items-center justify-center text-slate-400 text-xs">
              Mídia não encontrada
            </div>
          )}
          {(msg.caption || msg.body) && (
            <p className="text-[15px] whitespace-pre-wrap">{msg.caption || msg.body}</p>
          )}
        </div>
      )
    }

    if (msg.type === 'audio') {
      return (
        <div className="flex flex-col gap-1 w-full md:w-64">
          {fileUrl ? (
            <audio controls className="w-full h-10" preload="metadata">
              <source src={fileUrl} type={msg.mime_type || 'audio/ogg'} />
            </audio>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <FileAudio className="h-4 w-4" /> Áudio indisponível
            </div>
          )}
        </div>
      )
    }

    if (msg.type === 'document') {
      return (
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border',
              isOut ? 'bg-emerald-100/50 border-emerald-200' : 'bg-slate-100 border-slate-200',
            )}
          >
            <FileText className="h-8 w-8 text-emerald-600 shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate text-slate-700">
                {msg.file_name || 'Documento'}
              </p>
              <p className="text-xs text-slate-500 uppercase">
                {msg.mime_type?.split('/')[1] || 'FILE'}
              </p>
            </div>
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-50 transition-colors"
                title="Baixar documento"
              >
                <Download className="h-4 w-4 text-emerald-600" />
              </a>
            )}
          </div>
          {(msg.caption || msg.body) && (
            <p className="text-[15px] whitespace-pre-wrap">{msg.caption || msg.body}</p>
          )}
        </div>
      )
    }

    return <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.body}</p>
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen w-full overflow-hidden bg-zinc-50/60">
      {/* Sidebar Contacts */}
      <div
        className={cn(
          'w-full md:w-80 lg:w-96 flex flex-col border-r border-zinc-200/70 bg-white shrink-0 transition-transform duration-300',
          selectedContact ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-200/70 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
                Caixa de Entrada
              </h2>
              {instance?.status === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  Desconectado
                </span>
              )}
            </div>

            {instance?.status === 'connected' ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-red-600 hover:bg-red-50 h-8 px-2.5 text-xs font-medium shrink-0"
                  >
                    Desconectar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza de que deseja desconectar seu WhatsApp? Você deixará de receber
                      mensagens até se reconectar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDisconnect}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate('/connection-setup')}
                className="h-8 px-3 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-600/20 shrink-0"
              >
                Conectar WhatsApp
              </Button>
            )}
          </div>
        </div>

        <div className="px-3 py-2 border-b border-zinc-200/70 bg-white">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="conversas" className="flex-1 text-xs">
                Conversas
              </TabsTrigger>
              <TabsTrigger value="imoveis" className="flex-1 text-xs">
                Imóveis
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeTab === 'conversas' ? (
          <>
            <div className="px-5 py-3 border-b border-zinc-200/70 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-zinc-400 pointer-events-none" />
                <Input
                  placeholder="Buscar contatos..."
                  className="pl-9 h-9 bg-zinc-50/80 border-zinc-200/70 text-[13.5px] placeholder:text-zinc-400 focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-300"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {loadingContacts ? (
                <div className="flex items-center justify-center p-10">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 text-center">
                  <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
                    <User className="h-5 w-5 text-zinc-400" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700">Nenhum contato encontrado</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    As conversas aparecerão aqui ao receber mensagens
                  </p>
                </div>
              ) : (
                <div className="w-full">
                  <div className="p-2 space-y-px">
                    {filteredContacts.map((contact) => {
                      const isActive = selectedContact?.id === contact.id
                      return (
                        <button
                          key={contact.id}
                          onClick={() => setSelectedContact(contact)}
                          className={cn(
                            'w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all',
                            isActive
                              ? 'bg-violet-50 ring-1 ring-violet-100'
                              : 'hover:bg-zinc-50 ring-1 ring-transparent',
                          )}
                        >
                          <span
                            className={cn(
                              'relative flex overflow-hidden rounded-full h-11 w-11 shrink-0 ring-2 transition-colors',
                              isActive ? 'ring-violet-200' : 'ring-zinc-100',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-full w-full items-center justify-center rounded-full text-[13px] font-semibold',
                                isActive
                                  ? 'bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700'
                                  : 'bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-600',
                              )}
                            >
                              {contact.name?.substring(0, 2).toUpperCase() ||
                                contact.phone?.substring(0, 2)}
                            </span>
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5 gap-2">
                              <span
                                className={cn(
                                  'text-[14px] font-semibold truncate flex-1 min-w-0 tracking-tight',
                                  isActive ? 'text-violet-900' : 'text-zinc-900',
                                )}
                              >
                                {contact.name || contact.phone}
                              </span>
                              {contact.last_message_at && (
                                <span
                                  className={cn(
                                    'text-[11px] shrink-0 whitespace-nowrap font-medium',
                                    isActive ? 'text-violet-600' : 'text-zinc-400',
                                  )}
                                >
                                  {format(new Date(contact.last_message_at), 'HH:mm')}
                                </span>
                              )}
                            </div>
                            <p
                              className={cn(
                                'text-[12.5px] truncate leading-snug',
                                isActive ? 'text-violet-700/80' : 'text-zinc-500',
                              )}
                            >
                              {contact.last_message || 'Nenhuma mensagem ainda'}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <PropertyCatalog
            onSendProperty={handleSendProperty}
            hasSelectedContact={!!selectedContact}
          />
        )}
      </div>

      {/* Chat Area */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-white',
          !selectedContact ? 'hidden md:flex' : 'flex',
        )}
      >
        {!selectedContact ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50/40">
            <div className="h-20 w-20 bg-white rounded-2xl flex items-center justify-center mb-5 ring-1 ring-zinc-200/70 shadow-sm">
              <MessageSquare className="h-8 w-8 text-violet-500" strokeWidth={1.75} />
            </div>
            <h2 className="text-[17px] font-semibold tracking-tight text-zinc-900">
              Selecione uma conversa
            </h2>
            <p className="text-sm text-zinc-500 mt-1.5">
              Escolha um contato da lista para começar a enviar mensagens
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-200/70 bg-white/80 backdrop-blur-sm shrink-0 z-10">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden -ml-1 h-9 w-9 text-zinc-600 hover:text-zinc-900"
                onClick={() => setSelectedContact(null)}
              >
                <AlertCircle className="h-5 w-5 rotate-90" />
              </Button>
              <Avatar className="h-10 w-10 ring-2 ring-zinc-100">
                <AvatarFallback className="bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 text-[13px] font-semibold">
                  {selectedContact.name?.substring(0, 2).toUpperCase() ||
                    selectedContact.phone?.substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 truncate">
                    {selectedContact.name || selectedContact.phone}
                  </h3>
                  {selectedContact.agent_paused && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 whitespace-nowrap shrink-0">
                      <BotOff className="h-2.5 w-2.5" />
                      IA Pausada
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-zinc-500 truncate mt-0.5">{selectedContact.phone}</p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleAgent}
                className={cn(
                  'ml-auto h-8 text-xs font-medium transition-colors shrink-0 px-2.5',
                  selectedContact.agent_paused
                    ? 'text-violet-600 hover:bg-violet-50 hover:text-violet-700'
                    : 'text-zinc-500 hover:text-amber-600 hover:bg-amber-50',
                )}
                title={
                  selectedContact.agent_paused
                    ? 'Reativar resposta automática'
                    : 'Pausar respostas automáticas'
                }
              >
                {selectedContact.agent_paused ? (
                  <>
                    <Bot className="h-4 w-4 mr-1.5" />
                    Reativar IA
                  </>
                ) : (
                  <>
                    <BotOff className="h-4 w-4 mr-1.5" />
                    Pausar IA
                  </>
                )}
              </Button>
            </div>

            {/* Messages Area */}
            <div
              ref={scrollRef}
              className="flex-1 px-4 py-5 md:px-8 overflow-y-auto bg-zinc-50/40 space-y-3"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.04) 1px, transparent 0)',
                backgroundSize: '20px 20px',
              }}
            >
              {loadingMessages ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center p-4">
                  <div className="bg-white rounded-full px-4 py-1.5 text-[12.5px] text-zinc-600 ring-1 ring-zinc-200/70 shadow-sm">
                    Nenhuma mensagem aqui ainda. Diga oi! 👋
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOut = msg.direction === 'out'
                  const msgTime = msg.created || msg.sent_at || 0
                  const prevMsgTime =
                    idx > 0 ? messages[idx - 1].created || messages[idx - 1].sent_at || 0 : 0

                  const showDate =
                    idx === 0 ||
                    new Date(prevMsgTime).toDateString() !== new Date(msgTime).toDateString()

                  return (
                    <div key={msg.id} className="flex flex-col">
                      {showDate && (
                        <div className="flex justify-center my-4">
                          <span className="bg-white rounded-full px-3 py-1 text-[11px] text-zinc-600 ring-1 ring-zinc-200/70 shadow-sm font-medium">
                            {format(new Date(msgTime), 'dd/MM/yyyy')}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[85%] md:max-w-[68%] rounded-2xl px-3.5 py-2 relative animate-fade-in-up transition-opacity duration-300',
                          isOut
                            ? 'bg-[#d9fdd3] text-zinc-900 self-end rounded-tr-md shadow-[0_1px_1px_rgb(0_0_0_/_0.05)]'
                            : 'bg-white text-zinc-900 self-start rounded-tl-md ring-1 ring-zinc-200/60 shadow-[0_1px_2px_rgb(0_0_0_/_0.04)]',
                          msg.status === 'sending' && 'opacity-70',
                        )}
                      >
                        {renderMessageBody(msg)}
                        <div className="flex justify-end mt-1 items-center gap-1">
                          <span className="text-[10px] text-zinc-500 opacity-80">
                            {format(new Date(msgTime), 'HH:mm')}
                          </span>
                          {msg.status === 'sending' && (
                            <Loader2 className="h-3 w-3 text-zinc-400 animate-spin" />
                          )}
                          {msg.status === 'failed' && (
                            <AlertCircle className="h-3 w-3 text-red-500" title="Falha ao enviar" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-zinc-200/70 shrink-0">
              {/* File Preview Bar */}
              {selectedFile && (
                <div className="px-4 py-3 border-b border-zinc-200/70 bg-zinc-50/60 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {filePreview ? (
                      <div className="h-11 w-11 rounded-lg ring-1 ring-zinc-200 overflow-hidden shrink-0">
                        <img
                          src={filePreview}
                          className="w-full h-full object-cover"
                          alt="Preview"
                        />
                      </div>
                    ) : (
                      <div className="h-11 w-11 rounded-lg ring-1 ring-zinc-200 bg-white flex items-center justify-center shrink-0 text-violet-500">
                        {fileType === 'audio' ? (
                          <FileAudio className="h-5 w-5" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium truncate text-zinc-900">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11.5px] text-zinc-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="px-4 py-3">
                <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto items-end">
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />

                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-3 bg-red-50 text-red-600 rounded-2xl px-4 h-11 ring-1 ring-red-100">
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="font-mono text-[13px] font-medium">
                        {formatTime(recordingTime)}
                      </span>
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full"
                        onClick={cancelRecording}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : audioBlob ? (
                    <div className="flex-1 flex items-center gap-2 bg-zinc-50 rounded-2xl pl-2 pr-3 h-11 ring-1 ring-zinc-200">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-zinc-500 hover:text-red-600 hover:bg-white rounded-full"
                        onClick={cancelRecording}
                        title="Excluir áudio"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <audio src={audioPreviewUrl!} controls className="h-8 flex-1 min-w-[200px]" />
                    </div>
                  ) : (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-zinc-500 hover:text-violet-600 hover:bg-violet-50 rounded-full"
                            disabled={instance?.status !== 'connected'}
                          >
                            <Paperclip className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          side="top"
                          className="w-52 p-1.5 rounded-xl shadow-lg ring-1 ring-zinc-200/70"
                        >
                          <DropdownMenuItem
                            onClick={() => triggerFileInput('image/*,video/*', 'image')}
                            className="gap-3 cursor-pointer py-2 px-2.5 rounded-lg text-[13px] font-medium"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50">
                              <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                            <span>Foto e Vídeo</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              triggerFileInput(
                                'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain',
                                'document',
                              )
                            }
                            className="gap-3 cursor-pointer py-2 px-2.5 rounded-lg text-[13px] font-medium"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50">
                              <FileText className="h-3.5 w-3.5 text-violet-600" />
                            </div>
                            <span>Documento</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => triggerFileInput('audio/*', 'audio')}
                            className="gap-3 cursor-pointer py-2 px-2.5 rounded-lg text-[13px] font-medium"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50">
                              <FileAudio className="h-3.5 w-3.5 text-orange-600" />
                            </div>
                            <span>Áudio</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          instance?.status === 'connected'
                            ? selectedFile
                              ? 'Adicionar legenda...'
                              : 'Digite uma mensagem...'
                            : 'WhatsApp desconectado.'
                        }
                        className="min-h-[44px] max-h-32 bg-zinc-50/80 border-zinc-200/70 resize-none py-3 text-[14px] placeholder:text-zinc-400 focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-300 rounded-2xl"
                        rows={1}
                        disabled={instance?.status !== 'connected'}
                      />
                    </>
                  )}

                  {isRecording ? (
                    <Button
                      type="button"
                      size="icon"
                      className="h-11 w-11 rounded-full bg-red-500 hover:bg-red-600 shrink-0 shadow-sm shadow-red-500/20"
                      onClick={stopRecording}
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  ) : text.trim() || selectedFile || audioBlob ? (
                    <Button
                      type="submit"
                      size="icon"
                      className="h-11 w-11 rounded-full bg-violet-600 hover:bg-violet-700 shrink-0 shadow-sm shadow-violet-600/30"
                      disabled={instance?.status !== 'connected'}
                    >
                      <Send className="h-[18px] w-[18px] ml-0.5" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      className="h-11 w-11 rounded-full bg-violet-600 hover:bg-violet-700 shrink-0 shadow-sm shadow-violet-600/30"
                      disabled={instance?.status !== 'connected'}
                      onClick={startRecording}
                    >
                      <Mic className="h-[18px] w-[18px]" />
                    </Button>
                  )}
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
