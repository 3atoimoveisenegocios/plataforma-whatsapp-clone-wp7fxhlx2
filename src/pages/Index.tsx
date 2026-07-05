import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, MessageSquare, Zap, Shield, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

export default function Index() {
  const { user } = useAuth()

  if (user) {
    return <Navigate to="/inbox" replace />
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-50 pt-24 pb-32">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="container relative z-10 mx-auto px-4 text-center">
          <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-medium text-violet-800 mb-8 animate-fade-in-down">
            <span className="flex h-2 w-2 rounded-full bg-violet-500 mr-2 animate-pulse"></span>
            Desenvolvido com Evolution API
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl mb-6 animate-fade-in-up">
            Conecte o WhatsApp ao seu fluxo de trabalho em{' '}
            <span className="text-violet-500">segundos.</span>
          </h1>
          <p
            className="mx-auto max-w-2xl text-lg text-slate-600 mb-10 animate-fade-in-up"
            style={{ animationDelay: '100ms' }}
          >
            Uma plataforma perfeita e sem configurações para gerenciar suas conversas do WhatsApp.
            Escaneie um QR code e comece a conversar diretamente do seu navegador com nossa
            interface premium.
          </p>
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up"
            style={{ animationDelay: '200ms' }}
          >
            <Button
              size="lg"
              className="bg-violet-500 hover:bg-violet-600 h-14 px-8 text-lg w-full sm:w-auto"
              asChild
            >
              <Link to="/register">
                Comece de Graça <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-lg w-full sm:w-auto"
              asChild
            >
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        </div>

        {/* Mockup Preview */}
        <div
          className="container mx-auto px-4 mt-20 animate-slide-up"
          style={{ animationDelay: '300ms' }}
        >
          <div className="relative mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center border-b border-slate-100 bg-slate-50/50 px-4 py-3">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400"></div>
                <div className="h-3 w-3 rounded-full bg-amber-400"></div>
                <div className="h-3 w-3 rounded-full bg-green-400"></div>
              </div>
            </div>
            <div className="flex h-[400px] sm:h-[600px] w-full">
              <div className="w-1/3 border-r border-slate-100 bg-slate-50 p-4 hidden sm:block">
                <div className="h-10 w-full rounded-md bg-white border border-slate-200 mb-6"></div>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded-lg bg-white shadow-sm border border-slate-100"
                    >
                      <div className="h-10 w-10 rounded-full bg-slate-200 shrink-0"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-24 bg-slate-200 rounded"></div>
                        <div className="h-3 w-full bg-slate-100 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 bg-[url('https://img.usecurling.com/p/800/800?q=texture&color=gray')] bg-opacity-5 p-6 flex flex-col justify-end gap-4 relative">
                <div className="absolute inset-0 bg-white/80"></div>
                <div className="relative z-10 self-start max-w-md rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-slate-700 shadow-sm">
                  Ei, como funciona a nova integração?
                </div>
                <div className="relative z-10 self-end max-w-md rounded-2xl rounded-tr-sm bg-violet-500 px-4 py-3 text-white shadow-sm">
                  É incrível! É só escanear o QR code e pronto. Nenhuma configuração técnica
                  necessária. 🚀
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Tudo o que você precisa, nada além disso
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mb-2">
                <Zap className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold">Zero Configuração</h3>
              <p className="text-slate-600">
                Sem webhooks para configurar, sem servidores para manter. Escaneie e use.
              </p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
                <Globe className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold">Sincronização em Tempo Real</h3>
              <p className="text-slate-600">
                Mensagens sincronizadas instantaneamente em todos os seus dispositivos usando
                websockets seguros.
              </p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                <Shield className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold">Seguro e Privado</h3>
              <p className="text-slate-600">
                Sua conexão é isolada e segura. Nós cuidamos da infraestrutura.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
