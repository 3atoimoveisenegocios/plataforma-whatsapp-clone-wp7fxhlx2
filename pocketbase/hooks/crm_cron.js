cronAdd('crm_status_updates', '*/1 * * * *', () => {
  const fiveMinsAgoStr = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ')

  const inConv = $app.findRecordsByFilter(
    'whatsapp_contacts',
    "(status = 'em_conversa' || status = 'in_conversation' || status = '') && last_message_at != '' && last_message_at <= {:date}",
    '-created',
    100,
    0,
    { date: fiveMinsAgoStr },
  )

  for (const contact of inConv) {
    contact.set('status', 'aguardando')
    $app.save(contact)
  }

  const fifteenMinsAgoStr = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ')

  const waiting = $app.findRecordsByFilter(
    'whatsapp_contacts',
    "(status = 'aguardando' || status = 'waiting') && updated <= {:date}",
    '-created',
    100,
    0,
    { date: fifteenMinsAgoStr },
  )

  // Chave: Secret OPENAI_API_KEY ($os.getenv). O campo api_key do agente não é mais usado.
  const apiKey = $os.getenv('OPENAI_API_KEY') || $secrets.get('OPENAI_API_KEY') || ''
  if (apiKey) {
    $app.logger().info('CRM lead classification key source: Secret OPENAI_API_KEY')
  } else {
    $app.logger().warn('CRM lead classification: Secret OPENAI_API_KEY not found')
  }

  for (const contact of waiting) {
    try {
      const messages = $app.findRecordsByFilter(
        'whatsapp_messages',
        'contact_id = {:contactId}',
        'created',
        50,
        0,
        { contactId: contact.id },
      )

      let historyText = messages
        .map((m) => {
          const dir = m.getString('direction') === 'in' ? 'Cliente' : 'Agente'
          return `${dir}: ${m.getString('body')}`
        })
        .join('\n')

      if (!historyText.trim()) historyText = 'Sem mensagens.'

      let newStatus = 'resolvido'

      if (apiKey) {
        const aiPrompt = `Analise o seguinte histórico de conversa do WhatsApp e classifique o status do lead.
Responda APENAS com a palavra "resolvido" se a dúvida foi resolvida, o atendimento foi finalizado com sucesso ou a conversa chegou a um fim natural.
Responda APENAS com a palavra "perdido" se o cliente desistiu, parou de responder no meio de um fluxo de venda/atendimento sem resolução, ou não tem mais interesse.

Histórico:
${historyText}`

        const res = $http.send({
          url: 'https://api.openai.com/v1/responses',
          method: 'POST',
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            input: aiPrompt,
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey,
          },
          timeout: 60,
        })

        if (res.statusCode === 200 && res.json) {
          let answer = ''
          if (typeof res.json.output_text === 'string') {
            answer = res.json.output_text
          } else if (Array.isArray(res.json.output)) {
            for (const out of res.json.output) {
              const contents = Array.isArray(out && out.content) ? out.content : []
              for (const c of contents) {
                if (c && c.type === 'output_text' && typeof c.text === 'string') answer += c.text
              }
            }
          }
          answer = answer.toLowerCase()
          if (answer.includes('lost') || answer.includes('perdido')) newStatus = 'perdido'
        } else {
          $app
            .logger()
            .error(
              'CRM lead classification API error',
              'contact',
              contact.id,
              'status',
              res.statusCode,
              'body',
              JSON.stringify(res.json || {}),
            )
        }
      }

      contact.set('status', newStatus)
      $app.save(contact)
    } catch (e) {
      $app
        .logger()
        .error('Error in AI classification', 'contact', contact.id, 'error', e.toString())
      contact.set('status', 'resolvido')
      $app.save(contact)
    }
  }
})
