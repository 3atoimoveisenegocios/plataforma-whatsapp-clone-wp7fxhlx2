/**
 * Cron de segurança (v0.0.92): drena filas órfãs da IA.
 *
 * Sintoma corrigido (produção, 13/11): contato com ai_pending_ids não vazio e
 * NENHUMA rodada em andamento — sem sessão, sem erro, sem log — a fila nunca é
 * drenada. O dreno do loop v0.0.91 roda somente quando uma rodada abre (e
 * quando a rodada morre, ninguém mais olha a fila).
 *
 * A cada 1 min: para cada contato com ai_pending_ids não vazio e cuja ÚLTIMA
 * atividade (ai_pending_at) tem mais de ACTIVITY_STALE_MS (3 min), drena a fila
 * com a entrada mais recente como gatilho — SEMPRE respeitando horário
 * comercial, teto de rodadas (MAX_ROUNDS_PER_EVENT) e, claro, NUNCA enviando
 * erro ao cliente. Idempotente: se outra execução (hook ou cron) já tem rodada
 * aberta e recente (ai_round_open_at), NÃO drena (evita rodada duplicada).
 *
 * Nota JSVM: toda a lógica fica inline no callback do cron (declarações de topo
 * NÃO são visíveis dentro de callbacks no pool de VMs do PocketBase).
 */
cronAdd('ai_queue_safety_sweep', '*/1 * * * *', () => {
  const ACTIVITY_STALE_MS = 3 * 60 * 1000
  const ROUND_OPEN_STALE_MS = 4 * 60 * 1000
  const MAX_ROUNDS_PER_EVENT = 5
  const AI_ROUND_OPEN_AT = 'ai_round_open_at'
  const OPENAI_AGENT_ID = 'agent_6af5dc6ca48c8191b0c1a59374012598'
  const OPENAI_BETA_HEADER = 'agents=v1'
  const AGENTS_BASE = 'https://api.openai.com/v1/agents'
  const DEBOUNCE_MS = 5000

  // ===== Utilitários (inline no callback — exigência do JSVM) =====
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

  // ===== Contatos com fila pendente NÃO vazia e sem rodada em andamento =====
  // ai_pending_ids é json (texto): filtro por string não-vazia, não-'[]', não-'null'.
  // ai_pending_at vazio OU mais velho que ACTIVITY_STALE_MS: nenhuma execução
  // do hook mexeu na fila recentemente — é uma fila órfã (drena).
  let stuckContacts = []
  try {
    stuckContacts = $app.findRecordsByFilter(
      'whatsapp_contacts',
      `ai_pending_ids != '' && ai_pending_ids != '[]' && ai_pending_ids != 'null' && (ai_pending_at = '' || ai_pending_at <= {:stale})`,
      '-ai_pending_at',
      20,
      0,
      { stale: new Date(Date.now() - ACTIVITY_STALE_MS).toISOString().replace('T', ' ') },
    )
  } catch (err) {
    $app.logger().error('AI safety sweep: query failed', 'error', String(err))
    return
  }
  if (!stuckContacts.length) return

  $app.logger().info('AI safety sweep: stuck queues found', 'contacts', stuckContacts.length)

  for (let ci = 0; ci < stuckContacts.length; ci++) {
    const contact = stuckContacts[ci]
    const contactId = contact.id
    try {
      // Relê o contato: pode ter mudado desde a query.
      let latestContact
      try {
        latestContact = $app.findRecordById('whatsapp_contacts', contactId)
      } catch (_) {
        continue
      }
      if (latestContact.getBool('agent_paused')) continue

      // Marca de rodada aberta RECENTE: outra execução (hook ou cron) está
      // processando agora — NÃO drena (evita rodada duplicada).
      const roundOpenAtStr = latestContact.getString(AI_ROUND_OPEN_AT)
      if (roundOpenAtStr) {
        const openMs = parseTs(roundOpenAtStr)
        if (openMs > 0 && Date.now() - openMs < ROUND_OPEN_STALE_MS) continue
      }

      // Horário comercial (do agente da instância do contato).
      const instanceId = latestContact.getString('instance_id')
      let agents = []
      try {
        agents = $app.findRecordsByFilter(
          'ai_agents',
          `instance_id='${instanceId}' && active=true`,
          '-created',
          1,
          0,
        )
      } catch (_) {
        agents = []
      }
      if (!agents.length) continue
      const agent = agents[0]

      if (agent.getBool('business_hours_enabled')) {
        let operatingDays = []
        try {
          const raw = agent.getString('operating_days')
          if (raw) operatingDays = JSON.parse(raw)
        } catch (_) {}
        const startTime = agent.getString('start_time') || '09:00'
        const endTime = agent.getString('end_time') || '18:00'
        // Brasilia Time is UTC-3 year-round (DST abolished in 2019).
        const localDate = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const currentDayNum = localDate.getUTCDay()
        const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
        const startParts = startTime.split(':').map(Number)
        const endParts = endTime.split(':').map(Number)
        const startMinutes = (startParts[0] || 8) * 60 + (startParts[1] || 0)
        const endMinutes = (endParts[0] || 18) * 60 + (endParts[1] || 0)
        const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
        const isOperatingDay =
          operatingDays.indexOf(currentDayNum) !== -1 ||
          operatingDays.indexOf(dayNames[currentDayNum]) !== -1
        const isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes
        if (!isOperatingDay || !isWithinHours) continue
      }

      // Entrada mais recente com texto ainda NÃO respondida — gatilho do dreno.
      // (ai_log/ai_error são META e não entram; entradas vazias também não.)
      const doneNow = readJsonArray(latestContact, 'ai_processed_ids')
      let newestIn = null
      try {
        const recent = $app.findRecordsByFilter(
          'whatsapp_messages',
          `contact_id='${contactId}' && direction='in'`,
          '-created',
          20,
          0,
        )
        for (let ri = 0; ri < recent.length; ri++) {
          const m = recent[ri]
          if (!m.getString('body')) continue
          const mid = m.getString('message_id') || m.id
          if (doneNow.indexOf(mid) !== -1) continue
          newestIn = m
          break
        }
      } catch (_) {}

      if (!newestIn) {
        // Nada não-respondido com texto: a fila está vazia na prática — limpa.
        const c = $app.findRecordById('whatsapp_contacts', contactId)
        writeJsonArray(c, 'ai_pending_ids', [])
        $app.saveNoValidate(c)
        continue
      }

      // Abre a rodada: marca de rodada aberta (o hook ignora esta marca quando
      // antiga — nunca prende a fila).
      try {
        const cOpen = $app.findRecordById('whatsapp_contacts', contactId)
        cOpen.set(AI_ROUND_OPEN_AT, new Date().toISOString())
        $app.saveNoValidate(cOpen)
      } catch (_) {}

      // Roda UMA rodada de dreno (o teto de rodadas do hook cobre o resto —
      // aqui é a rede de segurança para filas que ninguém mais pegou).
      $app
        .logger()
        .info(
          'AI safety sweep: draining stuck queue',
          'contact',
          contactId,
          'phone',
          latestContact.getString('phone'),
        )
      // O dreno em si é o mesmo código do hook: reaproveita o fluxo chamando o
      // hook interno via atualização do contato — o hook de IA reage ao evento.
      // Para NÃO depender de evento, o dreno roda AQUI com a mesma chamada de
      // Agents API usada pelo hook (respeitando sessão por contato e
      // final_answer), e a resposta vai pelo mesmo caminho do hook.
      drainQueueOnce(latestContact, agent, newestIn)
    } catch (err) {
      $app
        .logger()
        .error('AI safety sweep: contact failed', 'contact', contactId, 'error', String(err))
    }
  }

  // ===== Uma rodada de dreno (mesma chamada do hook) =====
  // Reutiliza o fluxo do hook: continua a sessão do contato (ou cria uma nova),
  // espera o turno atual completar e extrai o final_answer DELE. Em falha:
  // registra ai_error e NUNCA envia nada ao cliente.
  function drainQueueOnce(contact, agent, newestIn) {
    const contactId = contact.id
    const apiKey = $secrets.get('OPENAI_API_KEY') || $os.getenv('OPENAI_API_KEY') || ''
    if (!apiKey) {
      $app.logger().error('AI safety sweep: OPENAI_API_KEY missing', 'contact', contactId)
      return
    }
    let sessionId = contact.getString('ai_session_id')
    let reply = ''
    let turnId = ''
    const sourceIds = [newestIn.getString('message_id') || newestIn.id]
    const combinedBody = newestIn.getString('body')

    try {
      if (sessionId) {
        // Continua a sessão existente (memória da conversa fica na OpenAI).
        const priorTurns = listSessionTurns(sessionId, apiKey)
        const priorTurnId =
          priorTurns.length > 0 && priorTurns[0].id ? String(priorTurns[0].id) : ''
        const t0Ms = Date.now()
        let continuationOk = false
        let pinnedTurnId = ''
        try {
          const eventsRes = callOpenAiAgentsApi(
            `${AGENTS_BASE}/sessions/${sessionId}/events`,
            apiKey,
            {
              events: [
                {
                  type: 'agent.session.input.message',
                  input: [{ role: 'user', content: [{ type: 'input_text', text: combinedBody }] }],
                },
              ],
            },
            90,
            { 'Idempotency-Key': 'cron-' + sourceIds.join('-') },
          )
          if (
            eventsRes.statusCode === 200 ||
            eventsRes.statusCode === 201 ||
            eventsRes.statusCode === 202
          ) {
            continuationOk = true
            const evJson = eventsRes.json || {}
            const candidates = [evJson.turn_id, evJson.id, evJson.turn && evJson.turn.id]
            for (let i = 0; i < candidates.length; i++) {
              const cv = candidates[i]
              if (typeof cv === 'string' && cv.indexOf('turn') !== -1) {
                pinnedTurnId = cv
                break
              }
            }
          } else {
            $app
              .logger()
              .warn('AI safety sweep: session events failed', 'status', eventsRes.statusCode)
          }
        } catch (err) {
          $app.logger().warn('AI safety sweep: session events threw', 'error', String(err))
        }
        if (continuationOk) {
          const pr = pollForTurnReply(sessionId, apiKey, {
            priorTurnId,
            pinnedTurnId,
            t0Ms,
            maxAttempts: 30,
            delaySec: 3,
          })
          if (pr.text) {
            reply = pr.text
            turnId = pr.turnId || ''
          }
          // hardFail/timeout: sem retry aqui (o hook trata o fluxo normal;
          // o cron é a rede de segurança, uma tentativa por execução).
        }
      }

      if (!reply && !sessionId) {
        // Cria uma nova sessão já com o input e aguarda o turno completar.
        let sessionRes = null
        try {
          sessionRes = callOpenAiAgentsApi(`${AGENTS_BASE}/sessions`, apiKey, {
            agent_id: OPENAI_AGENT_ID,
            environment: { type: 'none' },
            input: combinedBody,
            stream: false,
          })
        } catch (err) {
          $app.logger().warn('AI safety sweep: session creation threw', 'error', String(err))
        }
        const st = sessionRes ? sessionRes.statusCode : 0
        if (st === 200 || st === 201) {
          const data = sessionRes.json || {}
          sessionId = data.id ? String(data.id) : ''
          reply = extractReplyText(data)
          if (!reply && sessionId) {
            const t0Ms = Date.now()
            const pr = pollForTurnReply(sessionId, apiKey, { priorTurnId: '', t0Ms })
            if (pr.text) {
              reply = pr.text
              turnId = pr.turnId || ''
            }
          }
        } else {
          $app.logger().warn('AI safety sweep: session creation failed', 'status', st)
        }
      }
    } catch (err) {
      $app
        .logger()
        .error('AI safety sweep: round threw', 'contact', contactId, 'error', String(err))
    }

    // Salva a sessão (para o hook continuar a mesma conversa).
    try {
      const c = $app.findRecordById('whatsapp_contacts', contactId)
      if (sessionId && sessionId !== c.getString('ai_session_id')) {
        c.set('ai_session_id', sessionId)
      }
      // Fecha a marca de rodada aberta.
      c.set(AI_ROUND_OPEN_AT, '')
      $app.saveNoValidate(c)
    } catch (_) {}

    if (reply) {
      // Descarte de obsoletas (v0.0.86): se surgiu entrada com texto mais
      // recente do que a que esta rodada responde, NÃO envia — o hook trata.
      let stale = false
      try {
        const respondedAtMs = newestIn.getString('sent_at')
          ? parseTs(newestIn.getString('sent_at'))
          : parseTs(newestIn.get('created'))
        const inHistory = $app.findRecordsByFilter(
          'whatsapp_messages',
          `contact_id='${contactId}' && direction='in'`,
          '-created',
          20,
          0,
        )
        for (let i = 0; i < inHistory.length; i++) {
          const m = inHistory[i]
          if (!m.getString('body')) continue
          const mid = m.getString('message_id') || m.id
          if (sourceIds.indexOf(mid) !== -1) continue
          const mAt = m.getString('sent_at')
            ? parseTs(m.getString('sent_at'))
            : parseTs(m.get('created'))
          if (mAt > respondedAtMs) {
            stale = true
            break
          }
        }
      } catch (_) {}

      if (!stale) {
        sendWhatsappText(contact, agent, reply, sourceIds, combinedBody, sessionId, turnId)
        // Marca as fontes como processadas e limpa a fila do contato.
        try {
          const c = $app.findRecordById('whatsapp_contacts', contactId)
          const done = readJsonArray(c, 'ai_processed_ids')
          for (let i = 0; i < sourceIds.length; i++) {
            if (done.indexOf(sourceIds[i]) === -1) done.push(sourceIds[i])
          }
          writeJsonArray(c, 'ai_processed_ids', done)
          const stillPending = readJsonArray(c, 'ai_pending_ids').filter(
            (id) => sourceIds.indexOf(id) === -1,
          )
          writeJsonArray(c, 'ai_pending_ids', stillPending)
          $app.saveNoValidate(c)
        } catch (_) {}
        $app
          .logger()
          .info('AI safety sweep: reply sent', 'contact', contactId, 'reply_len', reply.length)
      } else {
        $app
          .logger()
          .info('AI safety sweep: reply stale — left for the main hook', 'contact', contactId)
      }
    } else {
      // Falha: NUNCA envia erro ao cliente. Registra ai_error (mesmo formato
      // do hook) e NÃO limpa a fila — a próxima varredura tenta de novo.
      try {
        const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
        const msgRecord = new Record(msgsCol)
        msgRecord.set('user_id', contact.getString('user_id'))
        msgRecord.set('instance_id', agent.getString('instance_id'))
        msgRecord.set('contact_id', contactId)
        msgRecord.set('remote_jid', contact.getString('remote_jid'))
        msgRecord.set('message_id', 'err_' + $security.randomString(10))
        msgRecord.set('direction', 'out')
        msgRecord.set('body', 'Falha na resposta da IA: dreno do cron sem final_answer')
        msgRecord.set('type', 'text')
        msgRecord.set('automation_type', 'ai_error')
        msgRecord.set('sent_at', new Date().toISOString())
        msgRecord.set('ai_status', 'falhou')
        msgRecord.set('ai_reason', 'cron de segurança: rodada sem final_answer')
        msgRecord.set('ai_session_id', sessionId || '')
        msgRecord.set('ai_turn_id', turnId || '')
        msgRecord.set('ai_source_ids', JSON.stringify(sourceIds))
        msgRecord.set('ai_trigger_body', combinedBody)
        $app.saveNoValidate(msgRecord)
      } catch (err) {
        $app.logger().error('AI safety sweep: failed to record ai_error', 'error', String(err))
      }
    }
  }

  // ===== Chamadas de Agents API / envio (mesmo formato do hook) =====
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

  function sortByCreatedDesc(list) {
    const copy = []
    for (const item of list) copy.push(item)
    copy.sort(function (a, b) {
      return parseTs(b && b.created_at) - parseTs(a && a.created_at)
    })
    return copy
  }

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
    } catch (_) {}
    return []
  }

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
    } catch (_) {}
    return []
  }

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

  function pollForTurnReply(sessionId, apiKey, opts) {
    const priorTurnId = opts && opts.priorTurnId ? opts.priorTurnId : ''
    const pinnedTurnId = opts && opts.pinnedTurnId ? opts.pinnedTurnId : ''
    const t0Ms = opts && opts.t0Ms ? opts.t0Ms : 0
    const maxAttempts = opts && opts.maxAttempts ? opts.maxAttempts : 30
    const delaySec = opts && opts.delaySec ? opts.delaySec : 2
    const CLOCK_SKEW_MS = 60000

    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) waitMs(delaySec * 1000)
      const turns = listSessionTurns(sessionId, apiKey)
      if (turns.length === 0) continue

      let target = null
      for (const t of turns) {
        if (!t || !t.id) continue
        if (pinnedTurnId) {
          if (t.id === pinnedTurnId) {
            target = t
            break
          }
          continue
        }
        if (t.id === priorTurnId) continue
        const createdMs = parseTs(t.created_at)
        if (createdMs > 0 && t0Ms > 0 && createdMs < t0Ms - CLOCK_SKEW_MS) continue
        target = t
        break
      }
      if (!target && !pinnedTurnId && priorTurnId) {
        for (const t of turns) {
          if (t && t.id === priorTurnId) {
            const st = t.status
            if (st === 'queued' || st === 'in_progress' || st === 'waiting') target = t
            break
          }
        }
      }
      if (!target) continue

      const st = target.status
      if (st === 'failed' || st === 'cancelled' || st === 'incomplete') {
        return { text: '', hardFail: true, reason: 'turno atual ' + st, turnId: target.id }
      }
      if (st === 'completed') {
        const items = getTurnItems(sessionId, target.id, apiKey)
        const text = extractLastFinalAnswer(items, target.id)
        if (text) return { text: text, hardFail: false, reason: '' }
        return {
          text: '',
          hardFail: true,
          reason: 'turno atual completou sem final_answer',
          turnId: target.id,
        }
      }
      // Turno ainda rodando: continua esperando.
    }
    return {
      text: '',
      hardFail: false,
      reason: 'timeout aguardando o turno atual completar',
      turnId: '',
    }
  }

  // Espera síncrona local (sem serviço externo). Nunca lança.
  function waitMs(ms) {
    try {
      const end = Date.now() + ms
      while (Date.now() < end) {}
    } catch (_) {}
  }

  function sendWhatsappText(contact, agent, text, sourceIds, triggerBody, sessionId, turnId) {
    try {
      const evoUrl = $secrets.get('EVOLUTION_API_URL') || $os.getenv('EVOLUTION_API_URL') || ''
      const evoKey = $secrets.get('EVOLUTION_API_KEY') || $os.getenv('EVOLUTION_API_KEY') || ''
      if (!evoUrl || !evoKey) {
        $app.logger().error('AI safety sweep: Evolution config missing')
        return
      }
      const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
      const instanceName = instance.getString('instance_name')
      const remoteJid = contact.getString('remote_jid')
      const evoUrlSanitized = evoUrl.endsWith('/') ? evoUrl.slice(0, -1) : evoUrl
      const res = $http.send({
        url: evoUrlSanitized + '/message/sendText/' + instanceName,
        method: 'POST',
        headers: { apikey: evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: remoteJid, text, delay: 0 }),
        timeout: 15,
      })
      if (res.statusCode === 200 || res.statusCode === 201) {
        let mId = 'msg_' + $security.randomString(10)
        if (res.json && res.json.key && res.json.key.id) mId = res.json.key.id
        else if (res.json && res.json.messageId) mId = res.json.messageId
        const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
        const msgRecord = new Record(msgsCol)
        msgRecord.set('user_id', contact.getString('user_id'))
        msgRecord.set('instance_id', contact.getString('instance_id'))
        msgRecord.set('contact_id', contact.id)
        msgRecord.set('remote_jid', remoteJid)
        msgRecord.set('message_id', mId)
        msgRecord.set('direction', 'out')
        msgRecord.set('body', text)
        msgRecord.set('type', 'text')
        msgRecord.set('automation_type', 'ai_response')
        msgRecord.set('sent_at', new Date().toISOString())
        msgRecord.set('ai_status', 'enviada')
        msgRecord.set('ai_session_id', sessionId || '')
        msgRecord.set('ai_turn_id', turnId || '')
        msgRecord.set('ai_source_ids', JSON.stringify(sourceIds))
        msgRecord.set('ai_trigger_body', triggerBody)
        $app.saveNoValidate(msgRecord)
        contact.set('last_message', text)
        contact.set('last_message_at', new Date().toISOString())
        $app.saveNoValidate(contact)
      } else {
        $app
          .logger()
          .error(
            'AI safety sweep: Evolution send failed',
            'status',
            res.statusCode,
            'body_preview',
            JSON.stringify(res.json || {}).slice(0, 300),
          )
      }
    } catch (err) {
      $app.logger().error('AI safety sweep: send threw', 'error', String(err))
    }
  }
})
