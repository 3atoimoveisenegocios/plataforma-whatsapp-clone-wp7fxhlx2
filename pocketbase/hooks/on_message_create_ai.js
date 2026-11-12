/**
 * IA da Iris via OpenAI Agents API (agente salvo agent_6af5dc6ca48c8191b0c1a59374012598).
 *
 * - A chave usada é SEMPRE o Secret OPENAI_API_KEY ($secrets.get com fallback $os.getenv).
 *   O campo api_key do agente NÃO é lido (permanece intacto no banco, mas sem uso).
 * - A memória da conversa fica na OpenAI: a primeira mensagem cria uma sessão
 *   (POST /v1/agents/sessions) e o session_id é salvo no contato (whatsapp_contacts.ai_session_id).
 *   Mensagens seguintes continuam a sessão (POST /v1/agents/sessions/{id}/events).
 * - A resposta é extraída SEMPRE do turno que acabou de completar: antes de enviar
 *   o input o hook anota o turno mais recente da sessão (priorTurnId) e o instante
 *   t0; depois espera um turno NOVO (criado após o input) — ou o turno ainda ativo
 *   que recebeu o input (steer) — terminar, e lê os itens DELE via
 *   GET /v1/agents/sessions/{sid}/turns/{turn_id}/items. O texto está no item com
 *   phase='final_answer' (content[] com blocos type='output_text'), shape confirmado
 *   com dados reais (v0.0.78). NUNCA se reutiliza final_answer de turno anterior:
 *   turno completado sem final_answer = falha (ai_error, nada enviado ao cliente).
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
  // Tolerância de relógio entre este servidor e a OpenAI ao comparar created_at
  // de turnos com o instante t0 do envio do input.
  const CLOCK_SKEW_MS = 60000

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

  function parseTs(value) {
    if (!value) return 0
    try {
      const ms = Date.parse(String(value).replace(' ', 'T'))
      return isNaN(ms) ? 0 : ms
    } catch (_) {
      return 0
    }
  }

  // Ordena uma lista de objetos da API do mais novo para o mais antigo
  // (por created_at; sem created_at mantém a ordem recebida — estável).
  function sortByCreatedDesc(list) {
    const copy = []
    for (const item of list) copy.push(item)
    copy.sort(function (a, b) {
      const am = parseTs(a && a.created_at)
      const bm = parseTs(b && b.created_at)
      return bm - am
    })
    return copy
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

  // Lista os turns da sessão, do mais novo para o mais antigo.
  function listSessionTurns(sessionId, apiKey) {
    try {
      const res = callOpenAiAgentsApi(
        `${AGENTS_BASE}/sessions/${sessionId}/turns`,
        apiKey,
        null,
        30,
      )
      if (res.statusCode === 200 && res.json && Array.isArray(res.json.data)) {
        return sortByCreatedDesc(res.json.data)
      }
      $app.logger().warn('AI session turns fetch failed', 'status', res.statusCode)
    } catch (err) {
      $app.logger().warn('AI session turns fetch threw', 'error', String(err))
    }
    return []
  }

  // Itens de UM turno específico (endpoint por turn) — nunca mistura itens de
  // turns anteriores da sessão. Devolve do mais novo para o mais antigo.
  function getTurnItems(sessionId, turnId, apiKey) {
    try {
      const res = callOpenAiAgentsApi(
        `${AGENTS_BASE}/sessions/${sessionId}/turns/${turnId}/items`,
        apiKey,
        null,
        30,
      )
      if (res.statusCode === 200 && res.json && Array.isArray(res.json.data)) {
        return sortByCreatedDesc(res.json.data)
      }
      $app.logger().warn('AI turn items fetch failed', 'status', res.statusCode, 'turn', turnId)
    } catch (err) {
      $app.logger().warn('AI turn items fetch threw', 'error', String(err))
    }
    return []
  }

  // Extrai o texto do final_answer mais recente de uma lista de itens JÁ do turno
  // informado (itens do endpoint por turn; turn_id conferido quando presente).
  // Ignora itens incompletos. Devolve '' se o turno não tem final_answer completo.
  function extractLastFinalAnswer(items, turnId) {
    for (const item of items) {
      if (!item || item.phase !== 'final_answer') continue
      if (turnId && item.turn_id && item.turn_id !== turnId) continue
      if (item.status && item.status !== 'completed') continue
      const contents = Array.isArray(item.content) ? item.content : []
      let itemText = ''
      for (const c of contents) {
        if (c && c.type === 'output_text' && typeof c.text === 'string') itemText += c.text
      }
      if (itemText.trim()) return itemText.trim()
    }
    return ''
  }

  // Extração do corpo da RESPOSTA DE CRIAÇÃO de sessão (sessão nova: qualquer
  // final_answer presente é necessariamente do turno atual, pois não há turnos antigos).
  function extractReplyText(data) {
    if (!data) return ''
    if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text
    const candidates = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.output)
        ? data.output
        : Array.isArray(data)
          ? data
          : []
    return extractLastFinalAnswer(candidates, '')
  }

  // Espera o turno disparado pelo input ATUAL terminar e devolve o final_answer
  // DELE — nunca a resposta de um turno anterior.
  //
  // opts.priorTurnId  : turno mais novo que já existia ANTES do input ('' se desconhecido).
  // opts.pinnedTurnId : quando a resposta do POST de input trouxe o id do turno,
  //                     só esse turno vale como alvo.
  // opts.t0Ms         : Date.now() imediatamente antes do envio do input.
  //
  // Retorna { text, hardFail, reason }:
  // - text: resposta do turno atual ('' se não houver);
  // - hardFail: true quando o turno atual terminou sem final_answer (falhou, foi
  //   cancelado ou completou sem resposta) — NÃO se deve tentar de novo nem
  //   reutilizar texto antigo; registra ai_error e não envia nada.
  // - hardFail false + text '': timeout sem conseguir atribuir resposta a um turno
  //   atual (o chamador decide: nova sessão como retry).
  function pollForTurnReply(sessionId, apiKey, opts) {
    const priorTurnId = opts && opts.priorTurnId ? opts.priorTurnId : ''
    const pinnedTurnId = opts && opts.pinnedTurnId ? opts.pinnedTurnId : ''
    const t0Ms = opts && opts.t0Ms ? opts.t0Ms : 0
    const maxAttempts = opts && opts.maxAttempts ? opts.maxAttempts : 10
    const delaySec = opts && opts.delaySec ? opts.delaySec : 3

    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        try {
          $http.send({ url: 'https://httpbin.org/delay/' + delaySec, timeout: delaySec + 7 })
        } catch (_) {}
      }

      const turns = listSessionTurns(sessionId, apiKey)
      if (turns.length === 0) {
        $app.logger().info('AI turn polling: no turns listed yet', 'attempt', i + 1)
        continue
      }

      // Turno alvo = o turno criado pelo input ATUAL.
      let target = null
      for (const t of turns) {
        if (!t || !t.id) continue
        if (pinnedTurnId) {
          // Com turno fixado pela resposta do POST, só ele serve.
          if (t.id === pinnedTurnId) {
            target = t
            break
          }
          continue
        }
        if (t.id === priorTurnId) continue
        // Nunca aceitar turno criado ANTES do envio do input (resposta antiga).
        const createdMs = parseTs(t.created_at)
        if (createdMs > 0 && t0Ms > 0 && createdMs < t0Ms - CLOCK_SKEW_MS) continue
        target = t
        break
      }

      // Sem turno novo: o input pode ter direcionado (steer) o turno que já
      // estava ativo. Só vale se esse turno AINDA estiver rodando — se ele já
      // tinha terminado antes do input, a resposta dele NÃO serve.
      if (!target && !pinnedTurnId && priorTurnId) {
        for (const t of turns) {
          if (t && t.id === priorTurnId) {
            const st = t.status
            if (st === 'queued' || st === 'in_progress' || st === 'waiting') target = t
            break
          }
        }
      }

      if (!target) {
        $app.logger().info('AI turn polling: current turn not identified yet', 'attempt', i + 1)
        continue
      }

      const st = target.status
      if (st === 'failed' || st === 'cancelled' || st === 'incomplete') {
        $app
          .logger()
          .error(
            'AI turn failed',
            'session',
            sessionId,
            'turn',
            target.id,
            'status',
            st,
            'error',
            JSON.stringify(target.error || {}),
          )
        return { text: '', hardFail: true, reason: 'turno atual ' + st }
      }
      if (st === 'completed') {
        const items = getTurnItems(sessionId, target.id, apiKey)
        const text = extractLastFinalAnswer(items, target.id)
        if (text) return { text: text, hardFail: false, reason: '' }
        // Turno atual completou SEM final_answer: falha — nunca cair no texto
        // de um turno anterior.
        $app
          .logger()
          .error(
            'AI turn completed without final_answer',
            'session',
            sessionId,
            'turn',
            target.id,
            'items',
            items.length,
          )
        return { text: '', hardFail: true, reason: 'turno atual completou sem final_answer' }
      }
      // Turno atual ainda rodando (queued/in_progress/waiting): continua esperando.
      $app
        .logger()
        .info(
          'AI turn polling: turn still running',
          'attempt',
          i + 1,
          'turn',
          target.id,
          'status',
          st,
        )
    }

    $app.logger().error('AI turn polling timeout without final_answer', 'session', sessionId)
    return { text: '', hardFail: false, reason: 'timeout aguardando o turno atual completar' }
  }

  // Cria uma NOVA sessão já com o input e aguarda o primeiro turno dela completar.
  // Retorna { sessionId, reply, hardFail, reason }.
  function createSessionAndGetReply(apiKey, combinedBody) {
    try {
      const sessionRes = callOpenAiAgentsApi(`${AGENTS_BASE}/sessions`, apiKey, {
        agent_id: OPENAI_AGENT_ID,
        environment: { type: 'none' },
        input: combinedBody,
        stream: false,
      })

      if (sessionRes.statusCode !== 200 && sessionRes.statusCode !== 201) {
        $app
          .logger()
          .error(
            'AI session creation failed',
            'status',
            sessionRes.statusCode,
            'body',
            JSON.stringify(sessionRes.json || {}),
          )
        return {
          sessionId: '',
          reply: '',
          hardFail: false,
          reason: 'criação de sessão falhou (status ' + sessionRes.statusCode + ')',
        }
      }

      const data = sessionRes.json || {}
      const sid = data.id ? String(data.id) : ''
      let reply = extractReplyText(data)
      if (reply || !sid) {
        return { sessionId: sid, reply: reply, hardFail: false, reason: '' }
      }

      // Sessão nova: o único turno existente é o criado por este input.
      const t0Ms = Date.now()
      const pr = pollForTurnReply(sid, apiKey, { priorTurnId: '', t0Ms: t0Ms, maxAttempts: 15 })
      if (pr.text) return { sessionId: sid, reply: pr.text, hardFail: false, reason: '' }
      return { sessionId: sid, reply: '', hardFail: pr.hardFail, reason: pr.reason }
    } catch (err) {
      $app.logger().error('AI session creation threw', 'error', String(err))
      return {
        sessionId: '',
        reply: '',
        hardFail: false,
        reason: 'criação de sessão lançou erro: ' + String(err),
      }
    }
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
      // Loga o texto que a IA produziu junto da falha de envio — sem isso uma
      // resposta válida para um número de teste fica invisível nos logs.
      $app
        .logger()
        .error(
          'Evolution send failed',
          'status',
          res.statusCode,
          'body_preview',
          JSON.stringify(res.json || {}).slice(0, 300),
          'text',
          String(text || '').slice(0, 500),
        )
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
    const startMinutes = (startParts[0] || 8) * 60 + startParts[1] * 1
    const endMinutes = (endParts[0] || 18) * 60 + endParts[1] * 1

    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
    const currentDayName = dayNames[currentDayNum]
    const isOperatingDay =
      operatingDays.indexOf(currentDayNum) !== -1 || operatingDays.indexOf(currentDayName) !== -1
    const isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes

    if (!isOperatingDay || !isWithinHours) {
      const outInstance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
      // Limpa as pendentes antes de sair (fora do horário, nada a responder).
      writeJsonArray(latestContact, 'ai_pending_ids', [])
      $app.saveNoValidate(latestContact)
      sendWhatsappText(
        outInstance.getString('instance_name'),
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
    let failReason = ''

    if (sessionId) {
      // Continua a sessão existente na OpenAI (memória da conversa fica lá).
      $app
        .logger()
        .info('AI session: continuing existing', 'session_id', sessionId, 'contact', contactId)

      // Turno mais recente ANTES do input: serve de marca para identificar o
      // turno NOVO que o input vai criar (nunca aceitar turnos anteriores).
      const priorTurns = listSessionTurns(sessionId, apiKey)
      const priorTurnId = priorTurns.length > 0 && priorTurns[0].id ? String(priorTurns[0].id) : ''
      const t0Ms = Date.now()

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
      let pinnedTurnId = ''
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
          // Se a resposta do POST trouxer o id do turno criado, fixa nele.
          const evJson = eventsRes.json || {}
          const candidates = [evJson.turn_id, evJson.id, evJson.turn && evJson.turn.id]
          for (let ci = 0; ci < candidates.length; ci++) {
            const cv = candidates[ci]
            if (typeof cv === 'string' && cv.indexOf('turn') !== -1) {
              pinnedTurnId = cv
              break
            }
          }
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
        const pr = pollForTurnReply(sessionId, apiKey, {
          priorTurnId: priorTurnId,
          pinnedTurnId: pinnedTurnId,
          t0Ms: t0Ms,
          maxAttempts: 10,
          delaySec: 3,
        })
        if (pr.text) {
          reply = pr.text
          $app
            .logger()
            .info(
              'AI session continued OK',
              'session_id',
              sessionId,
              'contact',
              contactId,
              'reply_len',
              reply.length,
            )
        } else if (pr.hardFail) {
          // Turno atual terminou sem resposta: falha definitiva — NÃO reutiliza
          // texto antigo e NÃO reenvia o input em nova sessão.
          failReason = pr.reason
        }
      }

      if (!reply && !failReason) {
        // Continuação expirou/sem resposta atribuível ao turno atual — nova
        // sessão como retry (o input é reenviado do zero).
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

    if (!reply && !failReason) {
      // Cria uma nova sessão no agente salvo (primeira mensagem ou retry).
      $app.logger().info('AI session: creating new', 'agent', OPENAI_AGENT_ID, 'contact', contactId)
      const created = createSessionAndGetReply(apiKey, combinedBody)
      if (created.sessionId) sessionId = created.sessionId
      if (created.reply) {
        reply = created.reply
      } else {
        failReason = created.reason || 'nova sessão não retornou final_answer'
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
        failReason || 'resposta vazia, obsoleta ou falha na chamada à OpenAI Agents API',
      )
      $app.logger().error('AI reply not sent', 'contact', contactId, 'reason', failReason)
    }
  } catch (err) {
    saveAiErrorRecord(latestContact, instance, String(err))
    $app.logger().error('AI response failed', 'error', String(err))
  }

  e.next()
}, 'whatsapp_messages')
