import { useEffect, useState, useCallback } from 'react'
import { Users, MessageCircle, Send, Download, Bot, Hand, TrendingUp, Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { getDashboardMetrics, type DashboardMetrics } from '@/services/dashboard'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartConfig } from '@/components/ui/chart'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

const chartConfig: ChartConfig = {
  sent: { label: 'Enviadas', color: 'hsl(var(--primary))' },
  received: { label: 'Recebidas', color: 'hsl(142, 71%, 45%)' },
}

const formatDateShort = (dateStr: string) => {
  const [, month, day] = dateStr.split('-')
  return `${day}/${month}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'7' | '30'>('7')

  const loadData = useCallback(async () => {
    try {
      const data = await getDashboardMetrics()
      setMetrics(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  useRealtime('whatsapp_messages', () => loadData(), !!user)
  useRealtime('whatsapp_contacts', () => loadData(), !!user)

  if (loading || !metrics) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50/50">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    )
  }

  const chartData = range === '7' ? metrics.last7Days : metrics.last30Days

  const cards = [
    {
      title: 'Contatos',
      value: metrics.totalContacts,
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      title: 'Mensagens Recebidas',
      value: metrics.totalMessagesReceived,
      icon: Download,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Mensagens Enviadas',
      value: metrics.totalMessagesSent,
      icon: Send,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'IA Enviadas',
      value: metrics.aiMessagesSent,
      icon: Bot,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      title: 'Manuais Enviadas',
      value: metrics.manualMessagesSent,
      icon: Hand,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      title: 'Total de Interações',
      value: metrics.totalMessagesSent + metrics.totalMessagesReceived,
      icon: TrendingUp,
      color: 'text-zinc-600',
      bg: 'bg-zinc-100',
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/30">
      <PageHeader
        title="Dashboard"
        description="Acompanhe a performance das suas comunicações e do seu agente de IA."
      />
      <div className="px-4 md:px-8 pb-10 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {cards.map((card) => (
            <Card key={card.title} className="border-zinc-200/70 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[12px] font-medium text-zinc-500">
                  {card.title}
                </CardTitle>
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', card.bg)}>
                  <card.icon className={cn('h-4 w-4', card.color)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-zinc-200/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[15px] font-semibold text-zinc-900">
              Volume de Mensagens
            </CardTitle>
            <Tabs value={range} onValueChange={(v) => setRange(v as '7' | '30')}>
              <TabsList className="h-8">
                <TabsTrigger value="7" className="text-xs px-3 h-6">
                  7 dias
                </TabsTrigger>
                <TabsTrigger value="30" className="text-xs px-3 h-6">
                  30 dias
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0 0% 90%)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="hsl(0 0% 60%)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="hsl(0 0% 60%)"
                  allowDecimals={false}
                />
                <RechartsTooltip
                  cursor={{ fill: 'hsl(0 0% 95%)' }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(0 0% 90%)',
                    fontSize: '12px',
                  }}
                  labelFormatter={(label) => `Data: ${formatDateShort(label as string)}`}
                />
                <Bar
                  dataKey="received"
                  fill="hsl(142, 71%, 45%)"
                  radius={[4, 4, 0, 0]}
                  name="Recebidas"
                />
                <Bar
                  dataKey="sent"
                  fill="hsl(262, 83%, 58%)"
                  radius={[4, 4, 0, 0]}
                  name="Enviadas"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-zinc-200/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[15px] font-semibold text-zinc-900">
                Distribuição de Mensagens Enviadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-700">
                      <Bot className="h-4 w-4 text-violet-500" />
                      IA Automática
                    </span>
                    <span className="text-[13px] font-bold text-zinc-900">
                      {metrics.aiMessagesSent}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{
                        width: `${metrics.totalMessagesSent > 0 ? (metrics.aiMessagesSent / metrics.totalMessagesSent) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-700">
                      <Hand className="h-4 w-4 text-amber-500" />
                      Manuais
                    </span>
                    <span className="text-[13px] font-bold text-zinc-900">
                      {metrics.manualMessagesSent}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{
                        width: `${metrics.totalMessagesSent > 0 ? (metrics.manualMessagesSent / metrics.totalMessagesSent) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[15px] font-semibold text-zinc-900">
                Resumo de Comunicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                  <span className="flex items-center gap-2 text-[13px] text-zinc-600">
                    <MessageCircle className="h-4 w-4 text-zinc-400" />
                    Total de Mensagens
                  </span>
                  <span className="text-[14px] font-bold text-zinc-900">
                    {metrics.totalMessagesSent + metrics.totalMessagesReceived}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                  <span className="flex items-center gap-2 text-[13px] text-zinc-600">
                    <Users className="h-4 w-4 text-zinc-400" />
                    Contatos Ativos
                  </span>
                  <span className="text-[14px] font-bold text-zinc-900">
                    {metrics.totalContacts}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2 text-[13px] text-zinc-600">
                    <TrendingUp className="h-4 w-4 text-zinc-400" />
                    Taxa de Resposta
                  </span>
                  <span className="text-[14px] font-bold text-zinc-900">
                    {metrics.totalMessagesReceived > 0
                      ? `${Math.round((metrics.totalMessagesSent / metrics.totalMessagesReceived) * 100)}%`
                      : '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
