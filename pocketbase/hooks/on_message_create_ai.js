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
 *   Shape confirmado com dados reais (v0.0.78): a resposta NÃO está no output_text
 *   do root nem em itens type='message' — está no item com phase='final_answer',
 *   cujo content[] tem blocos type='output_text' com o texto em .text.
 * - Em caso de falha da IA, NADA é enviado ao cliente: registra em whatsapp_messages
 *   com automation_type='ai_error' e loga o erro.
 *
 * Controle de duplicação/atraso (tudo persistido em whatsapp_contacts):
 * - ai_processed_ids (json): ids das mensagens de entrada já respondidas — dedupe idempotente.
 * - ai_pending_ids (json): ids de entrada recebidos e ainda não respondidos (debounce).
 * - ai_pending_at (date): instante da ÚLTIMA entrada pendente — base do debounce.
 *
 * Nota: toda a lógica fica dentro do callback (o JSVM do PocketBase executa
 * callbacks em um pool separado — declarações de topo não são visíveis lá).
 */
/* eslint-disable no-unused-vars */
onRecordAfterCreateSuccess(async (e) => {
  const OPENAI_AGENT_ID = 'agent_6af5dc6ca48c8191b0c1a59374012598'
  const OPENAI_BETA_HEADER = 'agents=v1'
  const AGENTS_BASE = 'https://api.openai.com/v1/agents'
  const DEBOUNCE_MS = 5000

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

  function readJsonArray(record, field) {
    let out = []
    try {
      const raw = record.getString(field)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) out = parsed.filter((x) => typeof x === 'string' && x)
      }
    } catch (_) {}
    return out
  }

  function writeJsonArray(record, field, arr) {
    // Mantém pequeno: guarda só os 200 ids mais recentes.
    const trimmed = arr.slice(-200)
    record.set(field, JSON.stringify(trimmed))
  }

  // Extrai o texto de resposta do agente a partir do shape de items/output da
  // Agents API: itens type='message' do root agent com content[] type='output_text'.
  function extractReplyText(data) {
    if (!data) return ''

    // Alguns endpoints devolvem output_text direto.
    if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text

    // Shape REAL confirmado no diagnóstico (v0.0.78): a resposta do agente Iris
    // aparece na lista de itens da sessão como um item com phase='final_answer',
    // cujo content[] traz blocos type='output_text' com o texto em .text.
    // NÃO está no root output_text, NEM em itens type='message'.
    const candidates = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.output)
        ? data.output
        : Array.isArray(data)
          ? data
          : []

    let best = ''
    for (const item of candidates) {
      if (!item || item.phase !== 'final_answer') continue
      const contents = Array.isArray(item.content) ? item.content : []
      let itemText = ''
      for (const c of contents) {
        if (c && c.type === 'output_text' && typeof c.text === 'string') itemText += c.text
      }
      if (itemText.trim()) best = itemText // itera até o último final_answer (mais recente)
    }
    if (best) return best

    // Fallbacks conservadores (caso o shape mude): root text ou resposta direta.
    if (typeof data.text === 'string' && data.text.trim()) return data.text

    // Itens type='message' com output_text (shape documentado da Responses API).
    for (const item of candidates) {
      if (!item || item.type !== 'message') continue
      if (item.role && item.role !== 'assistant') continue
      const contents = Array.isArray(item.content) ? item.content : []
      for (const c of contents) {
        if (c && c.type === 'output_text' && typeof c.text === 'string' && c.text.trim()) {
          return c.text
        }
      }
    }

    return ''
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
  // resposta do agente, se já houver. `minItems` pula respostas de turns
  // anteriores (a resposta que já estava lá quando o turn começou).
  function getSessionReply(sessionId, apiKey, minItems) {
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
    const items = res.json && Array.isArray(res.json.data) ? res.json.data : []
    if (items.length <= (minItems || 0)) return null
    const text = extractReplyText({ data: items })
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
  function pollForReply(sessionId, apiKey, maxAttempts, delayMs, minItems) {
    for (let i = 0; i < maxAttempts; i++) {
      const found = getSessionReply(sessionId, apiKey, minItems || 0)
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

  // ===== Deduplicação (antes de qualquer coisa) =====
  const msg = e.record
  if (msg.getString('direction') !== 'in') return e.next()

  const messageId = msg.getString('message_id') || msg.id
  const contactId = msg.getString('contact_id')
  const instanceId = msg.getString('instance_id')

  const contact = $app.findRecordById('whatsapp_contacts', contactId)
  if (contact.getBool('agent_paused')) return e.next()

  // Registro de processamento persistente (sobrevive a redeploys):
  // ai_processed_ids no contato, com os ids já respondidos. O evento duplicado
  // é ignorado silenciosamente (sem registrar erro).
  const processedIds = readJsonArray(contact, 'ai_processed_ids')
  if (processedIds.indexOf(messageId) !== -1) {
    $app
      .logger()
      .info('AI dedupe: id in processed list — ignoring duplicate event', 'message_id', messageId)
    return e.next()
  }

  // ===== Debounce por contato =====
  // Marca a mensagem como pendente (id + instante da última pendente).
  const pendingIds = readJsonArray(contact, 'ai_pending_ids')
  if (pendingIds.indexOf(messageId) === -1) {
    pendingIds.push(messageId)
    writeJsonArray(contact, 'ai_pending_ids', pendingIds)
  }
  contact.set('ai_pending_at', new Date().toISOString())
  $app.saveNoValidate(contact)

  // Espera o debounce (5s) para ver se chega outra mensagem do mesmo contato.
  $http.send({ url: 'https://httpbin.org/delay/5', timeout: 10 })

  // Relê o contato: se outra mensagem chegou durante o debounce, ela atualizou
  // ai_pending_at — só a execução mais recente segue (as antigas saem).
  let latestContact
  try {
    latestContact = $app.findRecordById('whatsapp_contacts', contact.id)
  } catch (_) {
    return e.next()
  }
  const pendingAtStr = latestContact.getString('ai_pending_at')
  let pendingAt = 0
  if (pendingAtStr) {
    try {
      pendingAt = new Date(pendingAtStr.replace(' ', 'T')).getTime()
    } catch (_) {}
  }
  const waitedEnough = Date.now() - pendingAt >= DEBOUNCE_MS - 500
  if (pendingAt > 0 && !waitedEnough) {
    $app
      .logger()
      .info(
        'AI debounce: newer message pending — exiting',
        'contact',
        contactId,
        'message_id',
        messageId,
      )
    return e.next()
  }

  // Mensagens obsoletas: se surgiu uma entrada mais recente que as pendentes
  // conhecidas no contato (chegou durante o debounce e atualizou o estado),
  // a execução mais recente cuida dela — esta sai.
  const pendingNow = readJsonArray(latestContact, 'ai_pending_ids')
  if (pendingNow.indexOf(messageId) === -1) {
    $app
      .logger()
      .info(
        'AI debounce: message no longer pending (newer round took over)',
        'contact',
        contactId,
        'message_id',
        messageId,
      )
    return e.next()
  }

  // ===== Agente e horário comercial =====
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
      // Limpa as pendentes antes de sair (fora do horário, nada a responder).
      writeJsonArray(latestContact, 'ai_pending_ids', [])
      $app.saveNoValidate(latestContact)
      sendWhatsappText(
        instance.getString('instance_name'),
        latestContact.getString('remote_jid'),
        outOfHoursMessage,
        'out_of_hours',
        latestContact,
      )
      return e.next()
    }
  }
  // ===== END BUSINESS HOURS CHECK =====

  const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
  const instanceName = instance.getString('instance_name')

  // Mensagens pendentes do contato (as que chegaram desde a última resposta da IA).
  let newInMessages = []
  let sourceIds = []
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
      if (m.getString('body')) {
        newInMessages.push(m.getString('body'))
        sourceIds.push(m.getString('message_id') || m.id)
      }
    }
    newInMessages.reverse()
    sourceIds.reverse()
  } catch (err) {}

  const combinedBody = newInMessages.join('\n')
  if (!combinedBody) return e.next()

  const apiKey = getOpenAiKey()
  if (!apiKey) {
    saveAiErrorRecord(latestContact, instance, 'Secret OPENAI_API_KEY ausente')
    $app.logger().error('AI aborted: no OPENAI_API_KEY secret')
    return e.next()
  }

  let sessionId = latestContact.getString('ai_session_id')

  try {
    let reply = ''

    if (sessionId) {
      // Continua a sessão existente na OpenAI (memória da conversa fica lá).
      $app
        .logger()
        .info('AI session: continuing existing', 'session_id', sessionId, 'contact', contactId)

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
          'Idempotency-Key': 'msgs-' + sourceIds.join('-'),
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
        reply = pollForReply(sessionId, apiKey, 10, 3000, 0)
        if (reply) {
          $app
            .logger()
            .info('AI session continued OK', 'session_id', sessionId, 'contact', contactId)
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
      $app.logger().info('AI session: creating new', 'agent', OPENAI_AGENT_ID, 'contact', contactId)
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
            reply = pollForReply(sessionId, apiKey, 15, 3000, 0)
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
      latestContact.set('ai_session_id', sessionId)
      $app.saveNoValidate(latestContact)
      $app.logger().info('AI session saved', 'session_id', sessionId, 'contact', contactId)
    }

    if (reply) {
      // ===== Mensagens obsoletas: se uma entrada ainda mais recente chegou
      // enquanto a resposta era gerada (e ainda não foi respondida), descarta
      // esta resposta — a rodada mais recente responde com o contexto completo.
      try {
        const newerIn = $app.findRecordsByFilter(
          'whatsapp_messages',
          `contact_id='${contactId}' && direction='in'`,
          '-created',
          1,
          0,
        )
        const newest = newerIn.length > 0 ? newerIn[0] : null
        const newestId = newest ? newest.getString('message_id') || newest.id : ''
        if (newest && newestId && sourceIds.indexOf(newestId) === -1) {
          $app
            .logger()
            .info(
              'AI stale reply discarded — newer input arrived',
              'contact',
              contactId,
              'newest',
              newestId,
              'sources',
              sourceIds.join(','),
            )
          reply = ''
        }
      } catch (err) {
        $app.logger().warn('AI stale check failed', 'error', String(err))
      }
    }

    // Marca como processadas (idempotente) e limpa as pendentes.
    const nowProcessed = readJsonArray(latestContact, 'ai_processed_ids')
    for (let i = 0; i < sourceIds.length; i++) {
      if (nowProcessed.indexOf(sourceIds[i]) === -1) nowProcessed.push(sourceIds[i])
    }
    writeJsonArray(latestContact, 'ai_processed_ids', nowProcessed)
    writeJsonArray(latestContact, 'ai_pending_ids', [])
    $app.saveNoValidate(latestContact)

    if (reply) {
      sendWhatsappText(
        instanceName,
        latestContact.getString('remote_jid'),
        reply,
        'ai_response',
        latestContact,
      )
    } else {
      // Falha da IA NÃO é enviada ao cliente. Só registra e loga.
      saveAiErrorRecord(
        latestContact,
        instance,
        'resposta vazia, obsoleta ou falha na chamada à OpenAI Agents API',
      )
    }
  } catch (err) {
    saveAiErrorRecord(latestContact, instance, String(err))
    $app.logger().error('AI response failed', 'error', String(err))
  }

  e.next()
}, 'whatsapp_messages')
