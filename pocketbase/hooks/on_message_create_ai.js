/**
 * IA da Iris via OpenAI Agents API (agente salvo agent_6af5dc6ca48c8191b0c1a59374012598).
 *
 * - A chave usada é SEMPRE o Secret OPENAI_API_KEY ($secrets.get com fallback $os.getenv).
 *   O campo api_key do agente NÃO é lido (permanece intacto no banco, mas sem uso).
 * - A memória da conversa fica na OpenAI: a primeira mensagem cria uma sessão
 *   (POST /v1/agents/sessions) e o session_id é salvo no contato (whatsapp_contacts.ai_session_id).
 *   Mensagens seguintes continuam a sessão (POST /v1/agents/sessions/{id}/events).
 * - Com stream:false a criação retorna a SESSÃO (turn assíncrono, sem texto) — o hook faz
 *   polling de GET /v1/agents/sessions/{id}/items até a resposta do agente aparecer.
 * - Em caso de falha da IA, NADA é enviado ao cliente: registra em whatsapp_messages
 *   com automation_type='ai_error' e loga o erro.
 *
 * Nota: toda a lógica fica dentro do callback (o JSVM do PocketBase executa
 * callbacks em um pool separado — declarações de topo não são visíveis lá).
 */

onRecordAfterCreateSuccess(async (e) => {
  const OPENAI_AGENT_ID = 'agent_6af5dc6ca48c8191b0c1a59374012598'
  const OPENAI_BETA_HEADER = 'agents=v1'
  const AGENTS_BASE = 'https://api.openai.com/v1/agents'

  function getOpenAiKey() {
    const key = $secrets.get('OPENAI_API_KEY') || $os.getenv('OPENAI_API_KEY') || ''
    if (key) {
      $app
        .logger()
        .info(
          'AI key source: Secret OPENAI_API_KEY',
          'agent',
          OPENAI_AGENT_ID,
          'key_prefix',
          key.slice(0, 7),
        )
    } else {
      $app.logger().error('AI key source: OPENAI_API_KEY Secret NOT FOUND')
    }
    return key
  }

  function saveAiErrorRecord(contact, instance, detail) {
    try {
      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const msgRecord = new Record(msgsCol)
      msgRecord.set('user_id', contact.getString('user_id'))
      msgRecord.set('instance_id', instance.id)
      msgRecord.set('contact_id', contact.id)
      msgRecord.set('remote_jid', contact.getString('remote_jid'))
      msgRecord.set('message_id', 'err_' + $security.randomString(10))
      msgRecord.set('direction', 'out')
      msgRecord.set('body', 'Falha na resposta da IA: ' + detail)
      msgRecord.set('type', 'text')
      msgRecord.set('automation_type', 'ai_error')
      msgRecord.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(msgRecord)
    } catch (err) {
      $app.logger().error('Failed to record ai_error', 'error', String(err))
    }
  }

  // Extrai o texto de resposta do agente a partir do shape de items/output da
  // Agents API: itens type='message' do root agent com content[] type='output_text'.
  function extractReplyText(data) {
    if (!data) return ''

    // Alguns endpoints devolvem output_text direto.
    if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text

    const candidates = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.output)
        ? data.output
        : Array.isArray(data)
          ? data
          : []

    // 1) Itens completos (formato items: { type:'message', role, content:[...] }).
    for (const item of candidates) {
      if (!item || item.type !== 'message') continue
      if (item.role && item.role !== 'assistant') continue
      const contents = Array.isArray(item.content) ? item.content : []
      for (const c of contents) {
        if (
          c &&
          (c.type === 'output_text' || c.type === 'text') &&
          typeof c.text === 'string' &&
          c.text.trim()
        ) {
          return c.text
        }
      }
    }

    // 2) Fallback: qualquer content type='output_text' válido.
    for (const item of candidates) {
      if (!item) continue
      const contents = Array.isArray(item.content) ? item.content : []
      for (const c of contents) {
        if (c && c.type === 'output_text' && typeof c.text === 'string' && c.text.trim()) {
          return c.text
        }
      }
    }

    // 3) Fallback: output[] com content direto (formato /v1/responses).
    const outputs = Array.isArray(data.output) ? data.output : []
    for (const out of outputs) {
      if (!out || out.type === 'reasoning' || out.type === 'web_search_call') continue
      const contents = Array.isArray(out.content) ? out.content : []
      for (const c of contents) {
        if (c && c.type === 'output_text' && typeof c.text === 'string' && c.text.trim()) {
          return c.text
        }
      }
    }

    if (typeof data.text === 'string' && data.text.trim()) return data.text
    return ''
  }

  // Fallback SSE (só usado se o polling falhar): decodifica res.body (bytes) e
  // extrai o texto dos eventos agent.session.turn.output_text.done / deltas.
  function extractReplyFromSse(res) {
    let text = ''
    let sessionId = ''
    try {
      let raw = ''
      if (typeof res.raw === 'string' && res.raw) raw = res.raw
      else if (res.body) {
        try {
          raw = new TextDecoder().decode(res.body)
        } catch (_) {
          raw = String(res.body)
        }
      }
      if (!raw) return { text, sessionId }

      const lines = raw.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let ev
        try {
          ev = JSON.parse(payload)
        } catch (_) {
          continue
        }
        if (ev.session_id) sessionId = ev.session_id
        if (ev.type === 'agent.session.turn.output_text.done' && ev.text) text = ev.text
        else if (ev.type === 'agent.session.turn.output_text.delta' && ev.delta) text += ev.delta
        else if (ev.type === 'agent.session.turn.completed' && ev.turn && ev.turn.output_text) {
          text = ev.turn.output_text
        } else if (!text && ev.output_text) text = ev.output_text
      }
    } catch (err) {
      $app.logger().warn('Failed to parse Agents SSE stream', 'error', String(err))
    }
    return { text, sessionId }
  }

  function callOpenAiAgentsApi(url, apiKey, body, timeout, extraHeaders) {
    const headers = {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'OpenAI-Beta': OPENAI_BETA_HEADER,
    }
    if (extraHeaders) {
      for (const k in extraHeaders) headers[k] = extraHeaders[k]
    }
    const options = { url, method: body === null ? 'GET' : 'POST', headers, timeout: timeout || 60 }
    if (body !== null) options.body = JSON.stringify(body)
    return $http.send(options)
  }

  // Consulta os últimos items da sessão (mais recentes primeiro) e extrai a
  // resposta do agente, se já houver.
  function getSessionReply(sessionId, apiKey) {
    let res = null
    try {
      res = callOpenAiAgentsApi(
        `${AGENTS_BASE}/sessions/${sessionId}/items?order=desc&limit=20`,
        apiKey,
        null,
        30,
      )
    } catch (err) {
      $app.logger().warn('AI session items fetch threw', 'error', String(err))
      return null
    }
    if (res.statusCode !== 200) {
      $app
        .logger()
        .warn(
          'AI session items fetch failed',
          'status',
          res.statusCode,
          'body',
          JSON.stringify(res.json || {}),
        )
      return null
    }
    const text = extractReplyText(res.json)
    return text ? { text } : null
  }

  // Consulta o estado do turn corrente (status, erro) — para diagnóstico e para
  // abortar cedo quando o turn falhou.
  function getSessionTurns(sessionId, apiKey) {
    try {
      const res = callOpenAiAgentsApi(
        `${AGENTS_BASE}/sessions/${sessionId}/turns`,
        apiKey,
        null,
        30,
      )
      if (res.statusCode === 200) return res.json
    } catch (err) {
      $app.logger().warn('AI session turns fetch threw', 'error', String(err))
    }
    return null
  }

  // Espera o turn da sessão terminar (items com resposta do agente), com polling.
  function pollForReply(sessionId, apiKey, maxAttempts, delayMs) {
    for (let i = 0; i < maxAttempts; i++) {
      const found = getSessionReply(sessionId, apiKey)
      if (found && found.text) return found.text

      const turns = getSessionTurns(sessionId, apiKey)
      if (turns && Array.isArray(turns.data)) {
        for (const t of turns.data) {
          if (t && (t.status === 'failed' || t.type === 'turn.failed')) {
            $app
              .logger()
              .error(
                'AI session turn failed',
                'session',
                sessionId,
                'error',
                JSON.stringify(t.error || {}),
              )
            return ''
          }
        }
      }
      $app.logger().info('AI session polling', 'attempt', i + 1, 'session', sessionId)
      $http.send({ url: 'https://httpbin.org/delay/3', timeout: 10 })
    }
    return ''
  }

  function sendWhatsappText(instanceName, remoteJid, text, automationType, contact) {
    const evoUrl = $secrets.get('EVOLUTION_API_URL') || $os.getenv('EVOLUTION_API_URL') || ''
    const evoKey = $secrets.get('EVOLUTION_API_KEY') || $os.getenv('EVOLUTION_API_KEY') || ''
    if (!evoUrl || !evoKey) {
      $app.logger().error('Evolution config missing')
      return
    }
    const evoUrlSanitized = evoUrl.endsWith('/') ? evoUrl.slice(0, -1) : evoUrl
    const res = $http.send({
      url: evoUrlSanitized + '/message/sendText/' + instanceName,
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid, text, delay: 0 }),
      timeout: 15,
    })

    if (res.statusCode === 200 || res.statusCode === 201) {
      let messageId = 'msg_' + $security.randomString(10)
      if (res.json && res.json.key && res.json.key.id) messageId = res.json.key.id
      else if (res.json && res.json.messageId) messageId = res.json.messageId

      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const msgRecord = new Record(msgsCol)
      msgRecord.set('user_id', contact.getString('user_id'))
      msgRecord.set('instance_id', contact.getString('instance_id'))
      msgRecord.set('contact_id', contact.id)
      msgRecord.set('remote_jid', remoteJid)
      msgRecord.set('message_id', messageId)
      msgRecord.set('direction', 'out')
      msgRecord.set('body', text)
      msgRecord.set('type', 'text')
      msgRecord.set('automation_type', automationType)
      msgRecord.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(msgRecord)

      contact.set('last_message', text)
      contact.set('last_message_at', new Date().toISOString())
      $app.saveNoValidate(contact)
    } else {
      $app.logger().error('Evolution send failed', 'status', res.statusCode)
    }
  }

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

  // Check if greeting was already sent by the greeting hook
  try {
    const freshMsg = $app.findRecordById('whatsapp_messages', msg.id)
    if (freshMsg.getBool('greeting_sent')) return e.next()
  } catch (_) {}

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
    const localDate = new Date(now.getTime() - 3 * 60 * 60 * 1000)

    // 0=Sunday, 1=Monday, ..., 6=Saturday
    const currentDayNum = localDate.getUTCDay()
    const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
    const startParts = startTime.split(':').map(Number)
    const endParts = endTime.split(':').map(Number)
    const startMinutes = (startParts[0] || 8) * 60 + (startParts[1] || 0)
    const endMinutes = (endParts[0] || 18) * 60 + (endParts[1] || 0)

    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
    const currentDayName = dayNames[currentDayNum]
    const isOperatingDay =
      operatingDays.indexOf(currentDayNum) !== -1 || operatingDays.indexOf(currentDayName) !== -1
    const isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes

    if (!isOperatingDay || !isWithinHours) {
      const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
      sendWhatsappText(
        instance.getString('instance_name'),
        contact.getString('remote_jid'),
        outOfHoursMessage,
        'out_of_hours',
        contact,
      )
      return e.next()
    }
  }
  // ===== END BUSINESS HOURS CHECK =====

  const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
  const instanceName = instance.getString('instance_name')

  // Mensagens novas do cliente (as que chegaram desde a última resposta da IA)
  let newInMessages = []
  try {
    const history = $app.findRecordsByFilter(
      'whatsapp_messages',
      `contact_id='${contactId}'`,
      '-created',
      20,
      0,
    )
    for (let i = 0; i < history.length; i++) {
      const m = history[i]
      if (m.getString('direction') !== 'in') break
      if (m.getString('body')) newInMessages.push(m.getString('body'))
    }
    newInMessages.reverse()
  } catch (err) {}

  const combinedBody = newInMessages.join('\n')
  if (!combinedBody) return e.next()

  const apiKey = getOpenAiKey()
  if (!apiKey) {
    saveAiErrorRecord(contact, instance, 'Secret OPENAI_API_KEY ausente')
    $app.logger().error('AI aborted: no OPENAI_API_KEY secret')
    return e.next()
  }

  let sessionId = contact.getString('ai_session_id')

  try {
    let reply = ''

    if (sessionId) {
      // Continua a sessão existente na OpenAI (memória da conversa fica lá).
      $app
        .logger()
        .info('AI session: continuing existing', 'session_id', sessionId, 'contact', contact.id)

      const eventsUrl = `${AGENTS_BASE}/sessions/${sessionId}/events`
      const eventPayload = {
        events: [
          {
            type: 'agent.session.input.message',
            input: [
              {
                role: 'user',
                content: [{ type: 'input_text', text: combinedBody }],
              },
            ],
          },
        ],
      }

      let continuationOk = false
      try {
        const eventsRes = callOpenAiAgentsApi(eventsUrl, apiKey, eventPayload, 90, {
          'Idempotency-Key': 'msg-' + msg.id + '-' + Date.now(),
        })
        if (
          eventsRes.statusCode === 200 ||
          eventsRes.statusCode === 201 ||
          eventsRes.statusCode === 202
        ) {
          continuationOk = true
        } else {
          $app
            .logger()
            .warn(
              'AI session events failed',
              'status',
              eventsRes.statusCode,
              'body',
              JSON.stringify(eventsRes.json || {}),
            )
        }
      } catch (err) {
        $app.logger().warn('AI session events threw', 'error', String(err))
      }

      if (continuationOk) {
        reply = pollForReply(sessionId, apiKey, 10, 3000)
        if (reply) {
          $app
            .logger()
            .info('AI session continued OK', 'session_id', sessionId, 'contact', contact.id)
        }
      }

      if (!reply) {
        // Continuação falhou, expirou ou não trouxe texto — nova sessão (automático).
        $app
          .logger()
          .warn(
            'AI session continuation unusable — creating a new session',
            'old_session_id',
            sessionId,
          )
        sessionId = ''
      }
    }

    if (!reply) {
      // Cria uma nova sessão no agente salvo (primeira mensagem ou sessão expirada).
      $app
        .logger()
        .info('AI session: creating new', 'agent', OPENAI_AGENT_ID, 'contact', contact.id)
      try {
        const sessionRes = callOpenAiAgentsApi(`${AGENTS_BASE}/sessions`, apiKey, {
          agent_id: OPENAI_AGENT_ID,
          environment: { type: 'none' },
          input: combinedBody,
          stream: false,
        })

        if (sessionRes.statusCode === 200 || sessionRes.statusCode === 201) {
          const data = sessionRes.json || {}
          if (data.id) sessionId = data.id
          reply = extractReplyText(data)
          if (!reply && sessionId) {
            reply = pollForReply(sessionId, apiKey, 15, 3000)
          }
        } else {
          $app
            .logger()
            .error(
              'AI session creation failed',
              'status',
              sessionRes.statusCode,
              'body',
              JSON.stringify(sessionRes.json || {}),
            )
        }
      } catch (err) {
        $app.logger().error('AI session creation threw', 'error', String(err))
      }
    }

    if (reply && sessionId) {
      contact.set('ai_session_id', sessionId)
      $app.saveNoValidate(contact)
      $app.logger().info('AI session saved', 'session_id', sessionId, 'contact', contact.id)
    }

    if (reply) {
      sendWhatsappText(instanceName, contact.getString('remote_jid'), reply, 'ai_response', contact)
    } else {
      // Falha da IA NÃO é enviada ao cliente. Só registra e loga.
      saveAiErrorRecord(contact, instance, 'resposta vazia ou falha na chamada à OpenAI Agents API')
    }
  } catch (err) {
    saveAiErrorRecord(contact, instance, String(err))
    $app.logger().error('AI response failed', 'error', String(err))
  }

  e.next()
}, 'whatsapp_messages')
