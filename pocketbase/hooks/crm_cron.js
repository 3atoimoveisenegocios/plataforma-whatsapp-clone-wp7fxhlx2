cronAdd('crm_status_updates', '*/1 * * * *', () => {
  const fiveMinsAgoStr = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ')

  const inConv = $app.findRecordsByFilter(
    'whatsapp_contacts',
    "(status = 'in_conversation' || status = '') && last_message_at != '' && last_message_at <= {:date}",
    '-created',
    100,
    0,
    { date: fiveMinsAgoStr },
  )

  for (const contact of inConv) {
    contact.set('status', 'waiting')
    $app.save(contact)
  }

  const fifteenMinsAgoStr = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ')

  const waiting = $app.findRecordsByFilter(
    'whatsapp_contacts',
    "status = 'waiting' && updated <= {:date}",
    '-created',
    100,
    0,
    { date: fifteenMinsAgoStr },
  )

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

      let provider = 'openai'
      let apiKey = ''
      try {
        const agent = $app.findFirstRecordByFilter('ai_agents', 'user_id = {:userId}', {
          userId: contact.getString('user_id'),
        })
        provider = agent.getString('provider')
        apiKey = agent.getString('api_key')
      } catch (err) {}

      let newStatus = 'resolved'

      if (apiKey) {
        const aiPrompt = `Analise o seguinte histórico de conversa do WhatsApp e classifique o status do lead.
Responda APENAS com a palavra "resolved" se a dúvida foi resolvida, o atendimento foi finalizado com sucesso ou a conversa chegou a um fim natural.
Responda APENAS com a palavra "lost" se o cliente desistiu, parou de responder no meio de um fluxo de venda/atendimento sem resolução, ou não tem mais interesse.

Histórico:
${historyText}`

        let aiUrl =
          provider === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
              apiKey

        if (provider === 'openai') {
          const res = $http.send({
            url: aiUrl,
            method: 'POST',
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: aiPrompt }],
              temperature: 0.1,
            }),
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + apiKey,
            },
          })
          if (res.statusCode === 200 && res.json && res.json.choices && res.json.choices[0]) {
            const answer = res.json.choices[0].message.content.toLowerCase()
            if (answer.includes('lost')) newStatus = 'lost'
          }
        } else {
          const res = $http.send({
            url: aiUrl,
            method: 'POST',
            body: JSON.stringify({
              contents: [{ parts: [{ text: aiPrompt }] }],
            }),
            headers: { 'Content-Type': 'application/json' },
          })
          if (res.statusCode === 200 && res.json && res.json.candidates && res.json.candidates[0]) {
            const answer = res.json.candidates[0].content.parts[0].text.toLowerCase()
            if (answer.includes('lost')) newStatus = 'lost'
          }
        }
      }

      contact.set('status', newStatus)
      $app.save(contact)
    } catch (e) {
      $app
        .logger()
        .error('Error in AI classification', 'contact', contact.id, 'error', e.toString())
      contact.set('status', 'resolved')
      $app.save(contact)
    }
  }
})
