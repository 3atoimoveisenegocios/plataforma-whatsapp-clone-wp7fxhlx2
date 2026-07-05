import { useEffect, useState, useRef } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { getInstances, fetchInstanceQR, logoutInstance } from '@/services/whatsapp'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { RefreshCw, QrCode, PowerOff, Smartphone, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'

export default function ConnectionSetup() {
  const [instance, setInstance] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const autoQrTriggered = useRef(false)
  const { user } = useAuth()
  const { toast } = useToast()

  const loadInstance = async () => {
    try {
      const instances = await getInstances()
      if (instances.length > 0) {
        setInstance(instances[0])
      } else {
        setInstance(null)
      }
    } catch (e) {
      console.error('Failed to load instance:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInstance()
  }, [])

  useRealtime(
    'whatsapp_instances',
    () => {
      loadInstance()
    },
    !!user,
  )

  const handleRefresh = () => {
    setLoading(true)
    loadInstance()
  }

  const handleConnect = async (silent = false) => {
    if (!instance) return
    setActionLoading(true)
    try {
      await fetchInstanceQR(instance.id)
      if (!silent) {
        toast({
          title: 'QR Code solicitado',
          description: 'Por favor, aguarde o novo QR code ser gerado.',
        })
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao gerar QR Code',
        description: e.message || 'Erro na Evolution API',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (
      !loading &&
      instance &&
      instance.status !== 'connected' &&
      !instance.qrcode &&
      !autoQrTriggered.current
    ) {
      autoQrTriggered.current = true
      handleConnect(true)
    }
  }, [loading, instance])

  const handleDisconnect = async () => {
    setActionLoading(true)
    try {
      await logoutInstance()
      toast({ title: 'Desconectado com sucesso' })
    } catch (e: any) {
      toast({
        title: 'Erro ao desconectar instância',
        description: e.message || 'Erro na Evolution API',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const base =
      'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium tracking-wide'
    switch (status) {
      case 'connected':
        return (
          <span className={`${base} bg-emerald-50 text-emerald-700`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Conectado
          </span>
        )
      case 'disconnected':
        return (
          <span className={`${base} bg-rose-50 text-rose-700`}>
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Desconectado
          </span>
        )
      case 'pending':
        return (
          <span className={`${base} bg-amber-50 text-amber-700`}>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Pendente
          </span>
        )
      case 'connecting':
        return (
          <span className={`${base} bg-violet-50 text-violet-700`}>
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            Conectando
          </span>
        )
      default:
        return <span className={`${base} bg-slate-100 text-slate-600`}>Desconhecido</span>
    }
  }

  const getQRCodeSrc = (qr: string) => {
    if (qr.startsWith('data:')) return qr
    if (qr.startsWith('http')) return qr
    return `data:image/png;base64,${qr}`
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col">
        <PageHeader
          title="Conexão do WhatsApp"
          description="Vincule seu dispositivo para começar a enviar e receber mensagens de forma profissional e limpa."
        />
        <div className="flex flex-col items-center mx-auto w-full px-6 md:px-10 pb-16">
          <div className="w-full max-w-md mt-8">
            <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-200/40 rounded-[20px] overflow-hidden">
              <CardHeader className="p-6 border-b border-slate-50/50">
                <div className="flex justify-between items-center">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center min-h-[280px] space-y-6">
                  <Skeleton className="h-52 w-52 rounded-2xl" />
                  <div className="space-y-3 w-full flex flex-col items-center">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col">
      <PageHeader
        title="Conexão do WhatsApp"
        description="Vincule seu dispositivo para começar a enviar e receber mensagens de forma profissional e limpa."
      />
      <div className="flex flex-col items-start md:items-center mx-auto w-full px-6 md:px-10 pb-16">
        {!instance ? (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8 md:mt-0">
            <Alert className="bg-white border border-slate-200/60 shadow-lg shadow-slate-200/40 rounded-[20px] p-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-5">
                <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 shadow-sm shadow-violet-100">
                  <Smartphone className="h-5 w-5 text-violet-600" />
                </div>
                <div className="space-y-1.5">
                  <AlertTitle className="text-base font-medium text-slate-900">
                    Nenhuma Instância Encontrada
                  </AlertTitle>
                  <AlertDescription className="text-sm text-slate-500 leading-relaxed">
                    Você ainda não possui uma instância do WhatsApp associada à sua conta. Por
                    favor, entre em contato com o suporte ou administrador do sistema para
                    provisionar a sua instância dedicada.
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          </div>
        ) : (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8 md:mt-0">
            <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-200/40 rounded-[20px] overflow-hidden">
              <CardHeader className="p-6 flex flex-row items-center justify-between gap-4 border-b border-slate-50">
                <div className="space-y-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-100">
                      <Smartphone className="h-4 w-4 text-violet-600" />
                    </div>
                    <CardTitle className="text-base font-medium text-slate-900 tracking-tight line-clamp-1">
                      {instance.instance_name}
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    Instância de comunicação
                  </CardDescription>
                </div>
                <div className="flex justify-end shrink-0">{getStatusBadge(instance.status)}</div>
              </CardHeader>

              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center min-h-[280px]">
                  {instance.status === 'connected' ? (
                    <div className="flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-500">
                      <div className="h-20 w-20 bg-emerald-50/50 rounded-full flex items-center justify-center ring-1 ring-emerald-100">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-medium text-slate-900 tracking-tight">
                          Dispositivo Conectado
                        </h3>
                        <p className="text-slate-500 text-sm max-w-[260px] leading-relaxed">
                          Sua sessão está ativa. O envio e recebimento de mensagens estão
                          operacionais e em sincronia.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center w-full space-y-6 animate-in fade-in duration-500">
                      {instance.qrcode ? (
                        <div className="relative group">
                          <div className="absolute -inset-4 rounded-3xl bg-slate-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                          <div className="relative p-4 bg-white rounded-2xl shadow-sm border border-slate-100 ring-1 ring-slate-900/5">
                            <img
                              src={getQRCodeSrc(instance.qrcode)}
                              alt="WhatsApp QR Code"
                              className="w-52 h-52 object-contain"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-52 h-52 bg-violet-50/30 rounded-2xl border border-dashed border-violet-200 flex flex-col items-center justify-center text-violet-400 space-y-3">
                          <QrCode
                            className="h-10 w-10 opacity-40 text-violet-500"
                            strokeWidth={1.5}
                          />
                          <span className="text-xs font-medium tracking-wide text-violet-600">
                            Aguardando QR Code
                          </span>
                        </div>
                      )}

                      <div className="text-center space-y-2">
                        <h3 className="text-base font-medium text-slate-900 tracking-tight flex items-center justify-center gap-2">
                          {instance.status === 'connecting' && (
                            <RefreshCw className="h-4 w-4 animate-spin text-violet-600" />
                          )}
                          {instance.status === 'connecting'
                            ? 'Conectando...'
                            : 'Escaneie o código QR'}
                        </h3>
                        <p className="text-sm text-slate-500 max-w-[260px] mx-auto leading-relaxed">
                          {instance.status === 'connecting'
                            ? 'Aguardando sincronização com o WhatsApp...'
                            : 'Gere um novo QR code e escaneie com seu celular.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="p-4 sm:px-6 sm:py-5 bg-slate-50/30 border-t border-slate-100/50 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={loading || actionLoading}
                  className="w-full sm:w-auto text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-medium text-sm h-9"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>

                <div className="flex w-full sm:w-auto items-center gap-2 sm:gap-3 flex-col sm:flex-row">
                  {instance.status === 'connected' ? (
                    <Button
                      onClick={handleDisconnect}
                      disabled={actionLoading}
                      variant="ghost"
                      className="w-full sm:w-auto text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium text-sm h-9"
                    >
                      {actionLoading ? (
                        <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                      ) : (
                        <PowerOff className="h-3.5 w-3.5 mr-2" />
                      )}
                      Desconectar
                    </Button>
                  ) : null}

                  {instance.status !== 'connected' && (
                    <Button
                      onClick={() => handleConnect()}
                      disabled={actionLoading || instance.status === 'connecting'}
                      className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700 text-white shadow-sm font-medium px-5 text-sm h-9"
                    >
                      {actionLoading || instance.status === 'connecting' ? (
                        <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="h-3.5 w-3.5 mr-2" />
                      )}
                      {instance.status === 'connecting' ? 'Conectando...' : 'Gerar QR Code'}
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
