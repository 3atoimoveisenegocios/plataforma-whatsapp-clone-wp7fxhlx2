onRecordAfterCreateSuccess(async (e) => {
  const msg = e.record
  if (msg.getString('direction') !== 'in') return e.next()

  const contactId = msg.getString('contact_id')
  const instanceId = msg.getString('instance_id')

  const contact = $app.findRecordById('whatsapp_contacts', contactId)
  if (contact.getBool('agent_paused')) return e.next()

  // 7-Second Message Debounce
  try {
    $http.send({ url: 'https://httpbin.org/delay/7', timeout: 10 })
  } catch (err) {
    try {
      $http.send({ url: 'http://198.51.100.1:81', timeout: 7 })
    } catch (err2) {}
  }

  // Check if a newer incoming message arrived while we were sleeping
  let newestMsg
  try {
    const msgs = $app.findRecordsByFilter(
      'whatsapp_messages',
      `contact_id='${contactId}' && direction='in'`,
      '-created',
      1,
      0,
    )
    if (msgs.length > 0) newestMsg = msgs[0]
  } catch (err) {}

  if (newestMsg && newestMsg.id !== msg.id) {
    // Another message arrived after this one. Abort this execution to let the newer one handle it.
    return e.next()
  }

  let agents
  try {
    agents = $app.findRecordsByFilter(
      'ai_agents',
      `instance_id='${instanceId}' && active=true`,
      '-created',
      1,
      0,
    )
  } catch (_) {
    return e.next()
  }

  if (!agents || agents.length === 0) return e.next()
  const agent = agents[0]

  const provider = agent.getString('provider')
  const apiKey = agent.getString('api_key')

  if (!provider || !apiKey) {
    $app.logger().error('AI Agent missing provider or api_key', 'agent_id', agent.id)
    return e.next()
  }

  // ===== BUSINESS HOURS CHECK =====
  const businessHoursEnabled = agent.getBool('business_hours_enabled')
  if (businessHoursEnabled) {
    let operatingDays = []
    try {
      const raw = agent.getString('operating_days')
      if (raw) operatingDays = JSON.parse(raw)
    } catch (_) {}

    const startTime = agent.getString('start_time') || '09:00'
    const endTime = agent.getString('end_time') || '18:00'
    const outOfHoursMessage =
      agent.getString('out_of_hours_message') ||
      'No momento estamos fora do horario de atendimento. Retornaremos em breve!'

    const now = new Date()
    // Brasilia Time is UTC-3 year-round (DST abolished in 2019).
    // Compute directly instead of relying on toLocaleString which
    // produces inconsistent results across JS runtimes.
    const utcMs = now.getTime()
    const localMs = utcMs - 3 * 60 * 60 * 1000
    const localDate = new Date(localMs)

    // 0=Sunday, 1=Monday, ..., 6=Saturday
    const currentDayNum = localDate.getUTCDay()
    const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
    const startParts = startTime.split(':').map(Number)
    const endParts = endTime.split(':').map(Number)
    const startMinutes = (startParts[0] || 8) * 60 + (startParts[1] || 0)
    const endMinutes = (endParts[0] || 18) * 60 + (endParts[1] || 0)

    // Support both numeric format [0,1,2,3,4,5,6] and string format ['domingo','segunda',...]
    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
    const currentDayName = dayNames[currentDayNum]
    const isOperatingDay =
      operatingDays.indexOf(currentDayNum) !== -1 || operatingDays.indexOf(currentDayName) !== -1
    const isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes

    if (!isOperatingDay || !isWithinHours) {
      const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
      const instanceName = instance.getString('instance_name')

      const evoUrl = $secrets.get('EVOLUTION_API_URL')
      const evoKey = $secrets.get('EVOLUTION_API_KEY')

      if (evoUrl && evoKey) {
        let evoUrlSanitized = evoUrl.endsWith('/') ? evoUrl.slice(0, -1) : evoUrl

        const res = $http.send({
          url: evoUrlSanitized + '/message/sendText/' + instanceName,
          method: 'POST',
          headers: { apikey: evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: contact.getString('remote_jid'),
            text: outOfHoursMessage,
            delay: 0,
          }),
          timeout: 15,
        })

        if (res.statusCode === 200 || res.statusCode === 201) {
          let messageId = 'msg_' + $security.randomString(10)
          if (res.json && res.json.key && res.json.key.id) messageId = res.json.key.id
          else if (res.json && res.json.messageId) messageId = res.json.messageId

          const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
          const msgRecord = new Record(msgsCol)
          msgRecord.set('user_id', contact.getString('user_id'))
          msgRecord.set('instance_id', instance.id)
          msgRecord.set('contact_id', contact.id)
          msgRecord.set('remote_jid', contact.getString('remote_jid'))
          msgRecord.set('message_id', messageId)
          msgRecord.set('direction', 'out')
          msgRecord.set('body', outOfHoursMessage)
          msgRecord.set('type', 'text')
          msgRecord.set('sent_at', new Date().toISOString())
          $app.saveNoValidate(msgRecord)

          contact.set('last_message', outOfHoursMessage)
          contact.set('last_message_at', new Date().toISOString())
          contact.set('status', 'aguardando')
          $app.saveNoValidate(contact)
        } else {
          $app.logger().error('Evolution send failed (out of hours)', 'status', res.statusCode)
        }
      }

      return e.next()
    }
  }
  // ===== END BUSINESS HOURS CHECK =====

  try {
    const sysPrompt =
      agent.getString('system_prompt') +
      "\n\nIMPORTANT INSTRUCTION: Your output MUST contain ONLY your direct answer to the user. DO NOT echo, repeat, or quote the user's questions or messages in your response. DO NOT include prefixes like 'AI:', 'Agent:', or 'Response:'."

    let history = []
    try {
      history = $app.findRecordsByFilter(
        'whatsapp_messages',
        `contact_id='${contactId}'`,
        '-created',
        20,
        0,
      )
    } catch (e) {}

    let newInMessages = []
    let pastHistory = []
    let foundOut = false

    for (let i = 0; i < history.length; i++) {
      const m = history[i]
      if (!foundOut) {
        if (m.getString('direction') === 'out') {
          foundOut = true
          pastHistory.push(m)
        } else {
          newInMessages.push(m)
        }
      } else {
        pastHistory.push(m)
      }
    }

    if (newInMessages.length === 0) return e.next()

    newInMessages.reverse()
    pastHistory.reverse()

    const combinedBody = newInMessages
      .map((m) => m.getString('body'))
      .filter(Boolean)
      .join('\n')

    if (!combinedBody) return e.next()

    const model = provider === 'openai' ? 'gpt-3.5-turbo' : 'gemini-1.5-flash'

    let requestUrl = ''
    let headers = {}
    let body = {}

    if (provider === 'openai') {
      requestUrl = 'https://api.openai.com/v1/chat/completions'
      headers = { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' }

      const messages = [{ role: 'system', content: sysPrompt }]
      for (let m of pastHistory) {
        if (m.getString('body')) {
          messages.push({
            role: m.getString('direction') === 'in' ? 'user' : 'assistant',
            content: m.getString('body'),
          })
        }
      }

      messages.push({
        role: 'user',
        content: combinedBody,
      })

      body = { model: model, messages: messages, max_tokens: 500 }
    } else if (provider === 'gemini') {
      requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      headers = { 'Content-Type': 'application/json' }

      const geminiContents = []
      let lastRole = null

      for (let m of pastHistory) {
        const text = m.getString('body')
        if (!text) continue
        const role = m.getString('direction') === 'in' ? 'user' : 'model'

        if (role === lastRole && geminiContents.length > 0) {
          geminiContents[geminiContents.length - 1].parts[0].text += '\n' + text
        } else {
          geminiContents.push({ role, parts: [{ text }] })
          lastRole = role
        }
      }

      if (lastRole === 'user' && geminiContents.length > 0) {
        geminiContents[geminiContents.length - 1].parts[0].text += '\n' + combinedBody
      } else {
        geminiContents.push({ role: 'user', parts: [{ text: combinedBody }] })
      }

      while (geminiContents.length > 0 && geminiContents[0].role !== 'user') {
        geminiContents.shift()
      }

      body = {
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 500 },
      }
    }

    const completionRes = $http.send({
      url: requestUrl,
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      timeout: 30,
    })

    const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
    const instanceName = instance.getString('instance_name')

    let reply = ''
    if (completionRes.statusCode === 200) {
      if (provider === 'openai') {
        if (
          completionRes.json &&
          completionRes.json.choices &&
          completionRes.json.choices.length > 0
        ) {
          reply = completionRes.json.choices[0].message.content
        }
      } else if (provider === 'gemini') {
        if (
          completionRes.json &&
          completionRes.json.candidates &&
          completionRes.json.candidates.length > 0 &&
          completionRes.json.candidates[0].content &&
          completionRes.json.candidates[0].content.parts &&
          completionRes.json.candidates[0].content.parts.length > 0
        ) {
          reply = completionRes.json.candidates[0].content.parts[0].text
        }
      }
    }

    if (reply) {
      const evoUrl = $secrets.get('EVOLUTION_API_URL')
      const evoKey = $secrets.get('EVOLUTION_API_KEY')

      if (evoUrl && evoKey) {
        let evoUrlSanitized = evoUrl.endsWith('/') ? evoUrl.slice(0, -1) : evoUrl
        const res = $http.send({
          url: evoUrlSanitized + '/message/sendText/' + instanceName,
          method: 'POST',
          headers: { apikey: evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: contact.getString('remote_jid'),
            text: reply,
            delay: 0,
          }),
          timeout: 15,
        })

        if (res.statusCode === 200 || res.statusCode === 201) {
          let messageId = 'msg_' + $security.randomString(10)
          if (res.json && res.json.key && res.json.key.id) messageId = res.json.key.id
          else if (res.json && res.json.messageId) messageId = res.json.messageId

          const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
          const msgRecord = new Record(msgsCol)
          msgRecord.set('user_id', contact.getString('user_id'))
          msgRecord.set('instance_id', instance.id)
          msgRecord.set('contact_id', contact.id)
          msgRecord.set('remote_jid', contact.getString('remote_jid'))
          msgRecord.set('message_id', messageId)
          msgRecord.set('direction', 'out')
          msgRecord.set('body', reply)
          msgRecord.set('type', 'text')
          msgRecord.set('sent_at', new Date().toISOString())
          $app.saveNoValidate(msgRecord)

          contact.set('last_message', reply)
          contact.set('last_message_at', new Date().toISOString())
          $app.saveNoValidate(contact)
        } else {
          $app.logger().error('Evolution send failed', 'status', res.statusCode)
        }
      } else {
        $app.logger().error('Evolution config missing')
      }
    } else {
      const errMsg = '⚠️ Falha na resposta da IA (Status ' + completionRes.statusCode + ')'
      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const msgRecord = new Record(msgsCol)
      msgRecord.set('user_id', contact.getString('user_id'))
      msgRecord.set('instance_id', instance.id)
      msgRecord.set('contact_id', contact.id)
      msgRecord.set('remote_jid', contact.getString('remote_jid'))
      msgRecord.set('message_id', 'err_' + $security.randomString(10))
      msgRecord.set('direction', 'out')
      msgRecord.set('body', errMsg)
      msgRecord.set('type', 'text')
      msgRecord.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(msgRecord)

      $app
        .logger()
        .error(
          'AI Error',
          'status',
          completionRes.statusCode,
          'url',
          requestUrl,
          'body',
          JSON.stringify(completionRes.json || {}),
        )
    }
  } catch (err) {
    $app.logger().error('AI response failed', 'error', String(err))
  }

  e.next()
}, 'whatsapp_messages')
