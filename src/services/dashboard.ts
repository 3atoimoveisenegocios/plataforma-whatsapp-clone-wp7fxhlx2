import pb from '@/lib/pocketbase/client'

export interface DashboardMetrics {
  totalContacts: number
  totalMessagesSent: number
  totalMessagesReceived: number
  aiMessagesSent: number
  manualMessagesSent: number
  last7Days: { date: string; sent: number; received: number }[]
  last30Days: { date: string; sent: number; received: number }[]
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [contacts, messages] = await Promise.all([
    pb.collection('whatsapp_contacts').getFullList({ fields: 'id,created' }),
    pb.collection('whatsapp_messages').getFullList({
      fields: 'id,direction,body,sent_at,created',
      sort: '-created',
    }),
  ])

  const totalContacts = contacts.length
  const totalMessagesSent = messages.filter((m) => m.direction === 'out').length
  const totalMessagesReceived = messages.filter((m) => m.direction === 'in').length

  const errorPattern = /^⚠️|Falha na resposta da IA/
  const aiMessagesSent = messages.filter(
    (m) => m.direction === 'out' && !errorPattern.test(m.body || ''),
  ).length
  const manualMessagesSent = messages.filter(
    (m) => m.direction === 'out' && errorPattern.test(m.body || ''),
  ).length

  const buildDailyData = (days: number) => {
    const result: { date: string; sent: number; received: number }[] = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      result.push({ date: dateStr, sent: 0, received: 0 })
    }
    const dateMap = new Map(result.map((r) => [r.date, r]))
    for (const m of messages) {
      const rawDate = m.sent_at || m.created
      if (!rawDate) continue
      const dateStr = new Date(rawDate).toISOString().split('T')[0]
      const entry = dateMap.get(dateStr)
      if (entry) {
        if (m.direction === 'out') entry.sent++
        else entry.received++
      }
    }
    return result
  }

  return {
    totalContacts,
    totalMessagesSent,
    totalMessagesReceived,
    aiMessagesSent,
    manualMessagesSent,
    last7Days: buildDailyData(7),
    last30Days: buildDailyData(30),
  }
}
