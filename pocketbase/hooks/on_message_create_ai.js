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
 * v0.0.85: janela de polling maior para turnos longos do agente (reasoning +
 *   web_search às vezes passam de 30s): continuação 30x3s (~90s) e sessão nova
 *   30x2s (~60s). Nada mais muda: extração do final_answer do turno atual,
 *   dedupe por ai_processed_ids, debounce ~5s, descarte de resposta obsoleta,
 *   Secret OPENAI_API_KEY e NUNCA enviar erro ao cliente.
 * - Mensagens 'in' com body VAZIO são ignoradas pela IA (não disparam rodada,
 *   não entram no debounce, não entram no input da sessão) — o registro delas
 *   no inbox permanece intacto (o hook só sai cedo, sem alterar o registro).
 * - Descarte de obsoletas (antes de enviar): compara o instante da ÚLTIMA entrada
 *   respondida por esta rodada (sent_at/created) contra TODAS as 'in' do contato
 *   com body não-vazio. Vazias não contam nem bloqueiam. Se existe 'in' com texto
 *   mais recente do que o que a rodada responde, NÃO envia — e NÃO marca as
 *   fontes como processadas nem limpa as pendentes, para que a rodada mais
 *   recente (que inclui o texto novo no input) responda tudo.
 * v0.0.88: APENAS observabilidade — cada rodada grava o desfecho nos campos
 *   novos de whatsapp_messages (migração 0037): ai_status (enviada/falhou/
 *   descartada), ai_reason, ai_session_id, ai_turn_id, ai_source_ids (ids das
 *   entradas que dispararam a rodada) e ai_trigger_body (texto recebido que
 *   disparou). Nenhuma linha da lógica muda: dedupe, debounce, descarte de
 *   obsoletas, extração do turno atual, polling e NUNCA enviar erro ao cliente
 *   continuam idênticos.
 * v0.0.86: correção do out-of-order ("Obrigado" respondido DEPOIS de pergunta
 *   nova): o check antigo só olhava a 'in' mais recente, e uma 'in' vazia logo
 *   depois da pergunta nova (created maior) mascarava a pergunta. Agora o
 *   descarte compara timestamps contra todas as 'in' não-vazias.
 * v0.0.87: três correções de atraso/órfãs ("responde a anterior"):
 *   (1) ao finalizar, a rodada remove APENAS os próprios sourceIds das pendentes
 *       (relendo o contato antes) — nunca esvazia a lista; uma mensagem que saiu
 *       da lista sem ter sido respondida segue e é processada;
 *   (2) o check de obsoletas declara ai_processed_ids antes do loop e, se falhar,
 *       descarta por segurança (fail-closed) logando o erro;
 *   (3) as esperas (debounce, polling, retry) não dependem mais de httpbin.org:
 *       waitMs() espera pelo relógio local e nunca lança.
 * v0.0.91: fila de pendências — a mensagem que chega DURANTE uma rodada em
 *   andamento nunca mais fica sem resposta. O evento dela saía no debounce
 *   ("newer message pending — exiting") e a rodada vigente descartava a
 *   própria resposta como obsoleta SEM processar a nova (comprovado em
 *   produção, contato 5511967226712 em 13/11: ai_pending_ids ficou com a
 *   mensagem órfã para sempre). Agora, ao final de CADA rodada, o mesmo
 *   callback relê o contato e, se ainda há pendência não respondida, roda
 *   outra rodada — em loop, com teto de segurança (MAX_ROUNDS_PER_EVENT=5,
 *   ROUND_STALE_AFTER_MS=10min). A pendência sempre é processada: ou pela
 *   execução do debounce vigente, ou pela reexecução ao fim da rodada
 *   anterior — tudo síncrono, no mesmo callback, sem serviço externo.
 * v0.0.92: fila travada SEM rodada em andamento — comprovado em produção
 *   (contato 5511995464029/Renan, 13/11 ~15:41–15:48): 3 entradas em
 *   ai_pending_ids, nenhum turno aberto, nenhum log de hook, silencioso.
 *   O dreno do loop v0.0.91 nunca dispara quando NENHUMA rodada roda — e
 *   nada reprocessa o enfileiramento sozinho. Três correções:
 *   (1) mensagem nova SEM rodada em andamento abre a rodada IMEDIATAMENTE
 *       (com a mais recente como gatilho) — nunca só enfileirar;
 *   (2) o check de "rodada em andamento" não pode ficar preso: se o último
 *       sinal de atividade (ai_pending_at) tem mais de ACTIVITY_STALE_MS
 *       (3 min), NÃO há rodada ativa — processa;
 *   (3) varredura de segurança no cron existente (a cada 1 min): drena
 *       contatos com ai_pending_ids não vazio e ai_pending_at antigo,
 *       usando a entrada mais recente como gatilho, respeitando horário
 *       comercial e o teto de rodadas. Nada é apagado e nada é enviado ao
 *       cliente em caso de erro.
 * v0.0.93: vazamento da pausa — mensagens enfileiradas ANTES de agent_paused
 *   virar true eram drenadas pelo cron de segurança DEPOIS da reativação (a
 *   IA respondia mensagens enviadas com a IA desativada). A fila é limpa na
 *   pausa (on_contact_pause_clear_queue.js) e o cron ignora pendências
 *   anteriores ao `updated` do contato. Este arquivo não muda: o hook JÁ
 *   sai cedo quando agent_paused (linha ~634) — mensagens que chegam
 *   durante a pausa nunca entram na fila.
 */
/* eslint-disable no-unused-vars */
// JSVM (goja) não suporta funções async — o callback é síncrono (nada de await aqui).
onRecordAfterCreateSuccess((e) => {
  // Marca (na variável de instância do evento) que ESTA execução do hook abriu
  // a rodada agora — usado pela varredura do cron para não drenar uma fila
  // que ACABOU de ganhar uma rodada em andamento (evita rodada duplicada).
  if (!e.record) return e.next()
  const OPENAI_AGENT_ID = 'agent_6af5dc6ca48c8191b0c1a59374012598'
  // v0.0.92: idade máxima (ms) do último sinal de atividade (ai_pending_at) para
  //   considerar que EXISTE uma rodada em andamento. Passou disso: nenhuma rodada
  //   ativa (travada/morta) — a fila é processada imediatamente.
  const ACTIVITY_STALE_MS = 3 * 60 * 1000
  // v0.0.92: marca persistente (no contato) de que uma rodada está aberta AGORA
  //   para esta execução — usado pelo cron de segurança para não drenar uma fila
  //   cuja rodada acabou de começar (evita rodada duplicada).
  const AI_ROUND_OPEN_AT = 'ai_round_open_at'
  // v0.0.92: idade máxima (ms) de uma rodada marcada como aberta — passou disso
  //   o cron considera a rodada morta e drena a fila.
  const ROUND_OPEN_STALE_MS = 4 * 60 * 1000
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

  function saveAiErrorRecord(contact, instance, detail, meta) {
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
      if (meta) {
        if (meta.status) msgRecord.set('ai_status', meta.status)
        if (meta.reason) msgRecord.set('ai_reason', meta.reason)
        if (meta.sessionId) msgRecord.set('ai_session_id', meta.sessionId)
        if (meta.turnId) msgRecord.set('ai_turn_id', meta.turnId)
        if (meta.sourceIds) msgRecord.set('ai_source_ids', JSON.stringify(meta.sourceIds))
        if (meta.triggerBody) msgRecord.set('ai_trigger_body', meta.triggerBody)
      }
      $app.saveNoValidate(msgRecord)
    } catch (err) {
      $app.logger().error('Failed to record ai_error', 'error', String(err))
    }
  }

  // v0.0.88 — APENAS observabilidade: grava o desfecho da rodada num registro
  // whatsapp_messages (direction='out', automation_type='ai_log'). NUNCA é
  // enviado ao cliente (sendWhatsappText não é chamado) e nada da lógica muda.
  function saveAiLogRecord(contact, instance, meta) {
    try {
      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const logRecord = new Record(msgsCol)
      logRecord.set('user_id', contact.getString('user_id'))
      logRecord.set('instance_id', instance.id)
      logRecord.set('contact_id', contact.id)
      logRecord.set('remote_jid', contact.getString('remote_jid'))
      logRecord.set('message_id', 'log_' + $security.randomString(10))
      logRecord.set('direction', 'out')
      const bodyPrefix =
        meta && meta.status === 'descartada'
          ? 'Rodada descartada: resposta obsoleta (há entrada mais recente sem resposta).'
          : 'Rodada sem resposta: ' + ((meta && meta.reason) || 'motivo não informado')
      logRecord.set('body', bodyPrefix)
      logRecord.set('type', 'text')
      logRecord.set('automation_type', 'ai_log')
      logRecord.set('sent_at', new Date().toISOString())
      if (meta) {
        if (meta.status) logRecord.set('ai_status', meta.status)
        if (meta.reason) logRecord.set('ai_reason', meta.reason)
        if (meta.sessionId) logRecord.set('ai_session_id', meta.sessionId)
        if (meta.turnId) logRecord.set('ai_turn_id', meta.turnId)
        if (meta.sourceIds) logRecord.set('ai_source_ids', JSON.stringify(meta.sourceIds))
        if (meta.triggerBody) logRecord.set('ai_trigger_body', meta.triggerBody)
      }
      $app.saveNoValidate(logRecord)
    } catch (err) {
      $app.logger().error('Failed to record ai_log', 'error', String(err))
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

  // Espera síncrona local (sem serviço externo). Nunca lança: no pior caso
  // a execução segue imediatamente.
  function waitMs(ms) {
    try {
      const end = Date.now() + ms
      while (Date.now() < end) {}
    } catch (_) {}
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
    // Janela padrão maior: turnos do agente (reasoning + web_search) às vezes
    // passam de 30s — ~60–90s de espera total no máximo, com delay menor para
    // caber no tempo de execução do hook no JSVM.
    const maxAttempts = opts && opts.maxAttempts ? opts.maxAttempts : 30
    const delaySec = opts && opts.delaySec ? opts.delaySec : 2

    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) waitMs(delaySec * 1000)

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
        return { text: '', hardFail: true, reason: 'turno atual ' + st, turnId: target.id }
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
        return {
          text: '',
          hardFail: true,
          reason: 'turno atual completou sem final_answer',
          turnId: target.id,
        }
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
    return {
      text: '',
      hardFail: false,
      reason: 'timeout aguardando o turno atual completar',
      turnId: '',
    }
  }

  // Cria uma NOVA sessão já com o input e aguarda o primeiro turno dela completar.
  // Retorna { sessionId, reply, hardFail, reason, turnId }.
  function createSessionAndGetReply(apiKey, combinedBody) {
    // Até 2 tentativas: erro 5xx na criação de sessão tem 1 retry com pequena
    // espera. O corpo/estado do erro é SEMPRE logado para diagnóstico.
    let sessionRes = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        sessionRes = callOpenAiAgentsApi(`${AGENTS_BASE}/sessions`, apiKey, {
          agent_id: OPENAI_AGENT_ID,
          environment: { type: 'none' },
          input: combinedBody,
          stream: false,
        })
      } catch (err) {
        $app.logger().error('AI session creation threw', 'attempt', attempt, 'error', String(err))
        sessionRes = null
      }
      const st = sessionRes ? sessionRes.statusCode : 0
      if (st === 200 || st === 201) break
      $app
        .logger()
        .error(
          'AI session creation failed',
          'attempt',
          attempt,
          'status',
          st,
          'body',
          JSON.stringify((sessionRes && sessionRes.json) || {}),
        )
      if (attempt < 2 && st >= 500) {
        waitMs(2000)
        continue
      }
      break
    }

    if (!sessionRes) {
      return {
        sessionId: '',
        reply: '',
        hardFail: false,
        reason: 'criação de sessão falhou (sem resposta da API após retry)',
      }
    }

    if (sessionRes.statusCode !== 200 && sessionRes.statusCode !== 201) {
      const bodyPreview = JSON.stringify(sessionRes.json || {}).slice(0, 200)
      return {
        sessionId: '',
        reply: '',
        hardFail: false,
        reason:
          'criação de sessão falhou (status ' +
          sessionRes.statusCode +
          ')' +
          (bodyPreview ? ': ' + bodyPreview : ''),
      }
    }

    try {
      const data = sessionRes.json || {}
      const sid = data.id ? String(data.id) : ''
      let reply = extractReplyText(data)
      if (reply || !sid) {
        // Sessão nova: resposta já disponível no corpo da criação — desfecho
        // registrado pelo chamador (sessionId = sid; sem id de turno aqui).
        return { sessionId: sid, reply: reply, hardFail: false, reason: '' }
      }

      // Sessão nova: o único turno existente é o criado por este input.
      const t0Ms = Date.now()
      const pr = pollForTurnReply(sid, apiKey, { priorTurnId: '', t0Ms: t0Ms, maxAttempts: 30 })
      if (pr.text)
        return { sessionId: sid, reply: pr.text, hardFail: false, reason: '', turnId: pr.turnId }
      return {
        sessionId: sid,
        reply: '',
        hardFail: pr.hardFail,
        reason: pr.reason,
        turnId: pr.turnId,
      }
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

  function sendWhatsappText(instanceName, remoteJid, text, automationType, contact, meta) {
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
      if (meta) {
        if (meta.status) msgRecord.set('ai_status', meta.status)
        if (meta.reason) msgRecord.set('ai_reason', meta.reason)
        if (meta.sessionId) msgRecord.set('ai_session_id', meta.sessionId)
        if (meta.turnId) msgRecord.set('ai_turn_id', meta.turnId)
        if (meta.sourceIds) msgRecord.set('ai_source_ids', JSON.stringify(meta.sourceIds))
        if (meta.triggerBody) msgRecord.set('ai_trigger_body', meta.triggerBody)
      }
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

  // ===== Ignora 'in' com body vazio antes de qualquer coisa (nem debounce) =====
  // A mensagem permanece registrada no inbox — o hook só não a processa.
  const msg = e.record
  if (msg.getString('direction') !== 'in') return e.next()
  if (!msg.getString('body')) return e.next()

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

  // ===== Fila de pendências (v0.0.91) =====
  // A mensagem que chega DURANTE uma rodada em andamento vira pendência no
  // contato. Antes, seu evento saía no debounce ("newer message pending —
  // exiting") e nada mais a processava: a rodada vigente descartava a própria
  // resposta como obsoleta e a mensagem ficava órfã em ai_pending_ids para
  // sempre (contato 5511967226712, 13/11). Agora CADA execução do hook, ao
  // final da sua rodada, relê o contato e — se ainda há pendência com texto
  // não respondida — roda outra rodada com a mensagem mais recente como
  // gatilho, em loop síncrono (sem serviço externo, sem setTimeout), até
  // processar tudo ou atingir o teto de segurança (MAX_ROUNDS_PER_EVENT).
  // Assim a IA SEMPRE responde à mensagem mais atual do cliente.
  const MAX_ROUNDS_PER_EVENT = 5
  const ROUND_STALE_AFTER_MS = 10 * 60 * 1000

  // Id da entrada com texto mais recente ainda NÃO respondida do contato
  // ('' se a fila está vazia) — usado pelo loop de rodadas para decidir se
  // roda outra rodada após um descarte de obsoletas.
  function newestUnansweredId() {
    try {
      const doneNow = readJsonArray(latestContact, 'ai_processed_ids')
      const recent = $app.findRecordsByFilter(
        'whatsapp_messages',
        `contact_id='${contactId}' && direction='in'`,
        '-created',
        20,
        0,
      )
      for (let i = 0; i < recent.length; i++) {
        const m = recent[i]
        if (!m.getString('body')) continue
        const mid = m.getString('message_id') || m.id
        if (doneNow.indexOf(mid) === -1) return mid
      }
    } catch (_) {}
    return ''
  }

  function schedulePendingFollowUp(contactRecord, msg) {
    try {
      const c = $app.findRecordById('whatsapp_contacts', contactRecord.id)
      const pending = readJsonArray(c, 'ai_pending_ids')
      const mid = msg.getString('message_id') || msg.id
      if (pending.indexOf(mid) === -1) {
        pending.push(mid)
        writeJsonArray(c, 'ai_pending_ids', pending)
      }
      c.set('ai_pending_at', new Date().toISOString())
      $app.saveNoValidate(c)
    } catch (err) {
      $app.logger().warn('AI queue: failed to schedule pending follow-up', 'error', String(err))
    }
  }

  // ===== Rodada em andamento? (v0.0.92) =====
  // Fonte de verdade: a marca persistente ai_round_open_at (gravada pelo hook
  // e pelo cron quando uma rodada começa). NÃO é a atividade recente
  // (ai_pending_at fresco NÃO prova rodada ativa — era exatamente o bug do
  // Renan: a execução morria antes de abrir a rodada e a fila ficava presa).
  // A marca expira sozinha (ROUND_OPEN_STALE_MS = 4 min): passou disso,
  // nenhuma rodada ativa — processa AGORA, nunca fica presa.
  let latestContact
  try {
    latestContact = $app.findRecordById('whatsapp_contacts', contact.id)
  } catch (_) {
    return e.next()
  }
  const roundOpenAtStr = latestContact.getString(AI_ROUND_OPEN_AT)
  let roundOpenAt = 0
  if (roundOpenAtStr) {
    try {
      roundOpenAt = parseTs(roundOpenAtStr)
    } catch (_) {}
  }
  const roundOpenFresh = roundOpenAt > 0 && Date.now() - roundOpenAt < ROUND_OPEN_STALE_MS

  // Debounce com a entrada mais recente: se a ÚLTIMA pendência do contato é
  // recente (< DEBOUNCE_MS), espera o resto do debounce (agrupa mensagens em
  // rajada num turno só) e ABRIRÁ a rodada — nunca só enfileirar, pois
  // roundOpenFresh === false aqui significa nenhuma rodada ativa.
  const pendingAtMs = parseTs(latestContact.getString('ai_pending_at'))
  const sinceLastActivityMs = pendingAtMs > 0 ? Date.now() - pendingAtMs : DEBOUNCE_MS
  if (sinceLastActivityMs < DEBOUNCE_MS) {
    $app
      .logger()
      .info(
        'AI debounce: no round in progress — waiting debounce before opening round',
        'contact',
        contactId,
        'message_id',
        messageId,
        'wait_ms',
        DEBOUNCE_MS - sinceLastActivityMs,
      )
    waitMs(Math.max(0, DEBOUNCE_MS - sinceLastActivityMs))
  } else {
    // Sem rodada em andamento (marca ausente/antiga): abre a rodada
    // IMEDIATAMENTE — nunca apenas enfileirar.
    $app
      .logger()
      .info(
        'AI round: opening round immediately (no active round)',
        'contact',
        contactId,
        'message_id',
        messageId,
      )
  }
  if (roundOpenFresh) {
    // Há rodada em andamento (ativa de verdade): enfileira como pendência —
    // o fim da rodada vigente reprocessa a fila (loop v0.0.91) e, se ela
    // morrer, o cron de segurança drena.
    $app
      .logger()
      .info(
        'AI round in progress — queued for end-of-round requeue or safety cron',
        'contact',
        contactId,
        'message_id',
        messageId,
      )
    schedulePendingFollowUp(latestContact, msg)
    return e.next()
  }

  // Mensagens obsoletas: se surgiu uma entrada mais recente que as pendentes
  // conhecidas no contato (chegou durante o debounce e atualizou o estado),
  // a execução mais recente cuida dela — esta sai.
  // Fora da lista de pendentes: se outra rodada já a respondeu, esta sai; se
  // não foi respondida ainda, segue e processa normalmente.
  const pendingNow = readJsonArray(latestContact, 'ai_pending_ids')
  if (pendingNow.indexOf(messageId) === -1) {
    const doneNow = readJsonArray(latestContact, 'ai_processed_ids')
    if (doneNow.indexOf(messageId) !== -1) {
      $app
        .logger()
        .info(
          'AI debounce: message already answered by another round',
          'contact',
          contactId,
          'message_id',
          messageId,
        )
      return e.next()
    }
    $app
      .logger()
      .info(
        'AI debounce: message not pending but not answered — processing anyway',
        'contact',
        contactId,
        'message_id',
        messageId,
      )
  }

  // ===== LOOP DE RODADAS (v0.0.91) =====
  // Cada iteração processa as pendências ATUAIS do contato. Ao fim de cada
  // rodada o loop relê o contato: se sobrou entrada com texto não respondida
  // (a que chegou durante a rodada), roda MAIS uma rodada com a mensagem mais
  // recente como gatilho — a IA sempre responde à mensagem mais atual.
  // v0.0.92: marca no contato que UMA rodada está aberta agora (com o instante) —
  // o cron de segurança vê isso e NÃO drena uma fila que acabou de ganhar
  // rodada. Expira sozinha (ROUND_OPEN_STALE_MS) — nunca prende a fila.
  try {
    const cOpen = $app.findRecordById('whatsapp_contacts', contact.id)
    cOpen.set(AI_ROUND_OPEN_AT, new Date().toISOString())
    $app.saveNoValidate(cOpen)
    latestContact = cOpen
  } catch (err) {
    $app.logger().warn('AI round: failed to mark round open', 'error', String(err))
  }

  const queueStartMs = Date.now()
  let roundIndex = 0
  // Id da entrada mais recente que causou o último descarte de obsoletas
  // (referência para o debounce da re-fila após descarte).
  let lastDiscardedNewestId = ''

  while (roundIndex < MAX_ROUNDS_PER_EVENT && Date.now() - queueStartMs < ROUND_STALE_AFTER_MS) {
    roundIndex++
    $app.logger().info('AI round loop: starting round', 'contact', contactId, 'round', roundIndex)

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
      break
    }

    if (!agents || agents.length === 0) break
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
        const outInstance = $app.findRecordById(
          'whatsapp_instances',
          agent.getString('instance_id'),
        )
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
        break
      }
    }
    // ===== END BUSINESS HOURS CHECK =====

    const instance = $app.findRecordById('whatsapp_instances', agent.getString('instance_id'))
    const instanceName = instance.getString('instance_name')

    // Mensagens pendentes do contato (as que chegaram desde a última resposta da IA).
    // Relidas A CADA RODADA: o que chegou durante a rodada anterior entra aqui.
    let newInMessages = []
    let sourceIds = []
    let sourceLastAtMs = 0
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
        if (m.getString('direction') !== 'in') {
          // v0.0.91: ai_log/ai_error são registros META do desfecho de uma
          // rodada — não são mensagens da conversa. Sem isso, o registro do
          // descarte (criado logo após a entrada) era o mais novo do histórico
          // e a rodada seguinte não via as pendências dele.
          const at = m.getString('automation_type')
          if (at === 'ai_log' || at === 'ai_error') continue
          break
        }
        const mid = m.getString('message_id') || m.id
        const doneNow = readJsonArray(latestContact, 'ai_processed_ids')
        if (doneNow.indexOf(mid) !== -1) break // já respondida por rodada anterior
        if (m.getString('body')) {
          newInMessages.push(m.getString('body'))
          sourceIds.push(mid)
          // Instante da entrada mais recente que esta rodada vai responder
          // (sent_at com fallback created) — base do descarte de obsoletas.
          if (sourceLastAtMs === 0) {
            const sa = m.getString('sent_at')
            sourceLastAtMs = sa ? parseTs(sa) : parseTs(m.get('created'))
          }
        }
      }
      newInMessages.reverse()
      sourceIds.reverse()
    } catch (err) {}

    const combinedBody = newInMessages.join('\n')
    if (!combinedBody) {
      // Nada não-respondido com texto — a fila deste contato está vazia.
      try {
        const c = $app.findRecordById('whatsapp_contacts', contact.id)
        writeJsonArray(c, 'ai_pending_ids', [])
        $app.saveNoValidate(c)
      } catch (_) {}
      break
    }

    const apiKey = getOpenAiKey()
    if (!apiKey) {
      saveAiErrorRecord(latestContact, instance, 'Secret OPENAI_API_KEY ausente', {
        status: 'falhou',
        reason: 'Secret OPENAI_API_KEY ausente',
        sessionId: '',
        turnId: '',
        sourceIds: sourceIds,
        triggerBody: combinedBody,
      })
      $app.logger().error('AI aborted: no OPENAI_API_KEY secret')
      break
    }

    let sessionId = latestContact.getString('ai_session_id')
    // Usados também pelo reavaliador de fim de rodada (fora do try).
    let staleDiscarded = false

    try {
      let reply = ''
      let failReason = ''
      let turnId = ''

      if (sessionId) {
        // Continua a sessão existente na OpenAI (memória da conversa fica lá).
        $app
          .logger()
          .info('AI session: continuing existing', 'session_id', sessionId, 'contact', contactId)

        // Turno mais recente ANTES do input: serve de marca para identificar o
        // turno NOVO que o input vai criar (nunca aceitar turnos anteriores).
        const priorTurns = listSessionTurns(sessionId, apiKey)
        const priorTurnId =
          priorTurns.length > 0 && priorTurns[0].id ? String(priorTurns[0].id) : ''
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
            maxAttempts: 30,
            delaySec: 3,
          })
          if (pr.text) {
            reply = pr.text
            turnId = pr.turnId || ''
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
            turnId = pr.turnId || ''
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
        $app
          .logger()
          .info('AI session: creating new', 'agent', OPENAI_AGENT_ID, 'contact', contactId)
        const created = createSessionAndGetReply(apiKey, combinedBody)
        if (created.sessionId) sessionId = created.sessionId
        if (created.reply) {
          reply = created.reply
          turnId = created.turnId || ''
        } else {
          failReason = created.reason || 'nova sessão não retornou final_answer'
        }
      }

      // v0.0.88 — APENAS observabilidade: metadados do desfecho desta rodada,
      // gravados em whatsapp_messages (nada da lógica usa estes valores).
      const roundMeta = {
        sessionId: sessionId || '',
        turnId: turnId || '',
        sourceIds: sourceIds,
        triggerBody: combinedBody,
        reason: failReason,
      }

      if (reply && sessionId) {
        latestContact.set('ai_session_id', sessionId)
        $app.saveNoValidate(latestContact)
        $app.logger().info('AI session saved', 'session_id', sessionId, 'contact', contactId)
      }

      if (reply) {
        // ===== Mensagens obsoletas: se existe entrada com TEXTO mais recente do
        // que a última que esta rodada está respondendo, descarta esta resposta —
        // a rodada mais recente (debounce) responde com o contexto completo.
        // Comparação por INSTANTE (sent_at, com fallback created) contra TODAS as
        // 'in' do contato com body não-vazio: mensagens vazias não contam nem
        // bloqueiam (elas ficam com created maior e antes mascaravam a pergunta
        // nova — caso 20:07:46/20:07:54 do contato 5511995464029).
        try {
          const respondedAtMs = sourceLastAtMs
          // Declarada ANTES do loop (usada na comparação abaixo).
          const nowProcessed = readJsonArray(latestContact, 'ai_processed_ids')
          const inHistory = $app.findRecordsByFilter(
            'whatsapp_messages',
            `contact_id='${contactId}' && direction='in'`,
            '-created',
            20,
            0,
          )
          for (let ni = 0; ni < inHistory.length; ni++) {
            const m = inHistory[ni]
            if (!m.getString('body')) continue // vazia não conta
            const mid = m.getString('message_id') || m.id
            if (sourceIds.indexOf(mid) !== -1) continue // é a própria fonte desta rodada
            const mAt = m.getString('sent_at')
              ? parseTs(m.getString('sent_at'))
              : parseTs(m.get('created'))
            if (mAt <= 0 || respondedAtMs <= 0) continue
            if (mAt > respondedAtMs && nowProcessed.indexOf(mid) === -1) {
              $app
                .logger()
                .info(
                  'AI stale reply discarded — newer text input exists',
                  'contact',
                  contactId,
                  'newer',
                  mid,
                  'responding_to_at',
                  new Date(respondedAtMs).toISOString(),
                  'sources',
                  sourceIds.join(','),
                )
              reply = ''
              break
            }
          }
        } catch (err) {
          // Fail-closed: sem conseguir conferir obsolescência, descarta por segurança.
          reply = ''
          $app
            .logger()
            .error('AI stale check failed — discarding reply (fail-closed)', 'error', String(err))
        }
      }

      // Quando a resposta foi DESCARTADA como obsoleta, NÃO marca as fontes como
      // processadas e NÃO limpa as pendentes: a mensagem de texto mais recente
      // ("Vcs tem casa ?") precisa ser respondida pela rodada mais recente —
      // sem isso ela ficava órfã (respondida só pelo 'Obrigado' descartado).
      // Nas falhas reais da IA (hardFail/timeout), marca como processadas para
      // não reprocessar infinitamente a mesma entrada.
      if (!reply && !failReason) staleDiscarded = true

      if (!staleDiscarded) {
        // Releitura do contato: outras rodadas podem ter gravado ids enquanto esta
        // esperava a OpenAI. Só mexe nos ids DESTA rodada.
        latestContact = $app.findRecordById('whatsapp_contacts', contact.id)
        const doneIds = readJsonArray(latestContact, 'ai_processed_ids')
        for (let i = 0; i < sourceIds.length; i++) {
          if (doneIds.indexOf(sourceIds[i]) === -1) doneIds.push(sourceIds[i])
        }
        writeJsonArray(latestContact, 'ai_processed_ids', doneIds)
        const stillPending = readJsonArray(latestContact, 'ai_pending_ids').filter(
          (id) => sourceIds.indexOf(id) === -1,
        )
        writeJsonArray(latestContact, 'ai_pending_ids', stillPending)
        $app.saveNoValidate(latestContact)
      }

      if (staleDiscarded) {
        // A resposta desta rodada foi descartada como obsoleta: anota o id da
        // entrada mais recente NÃO respondida (é o gatilho da próxima rodada).
        lastDiscardedNewestId = newestUnansweredId()
      }

      if (reply) {
        // Observabilidade: desfecho 'enviada' — status/reason/sessão/turno vão na
        // MESMA mensagem ai_response que o cliente recebe (sem registro extra).
        const okMeta = {}
        for (const k in roundMeta) okMeta[k] = roundMeta[k]
        okMeta.status = 'enviada'
        okMeta.reason = ''
        sendWhatsappText(
          instanceName,
          latestContact.getString('remote_jid'),
          reply,
          'ai_response',
          latestContact,
          okMeta,
        )
      } else if (staleDiscarded) {
        // Resposta descartada como obsoleta: NADA é enviado ao cliente — apenas
        // o registro de desfecho da rodada (v0.0.88, observabilidade).
        const staleMeta = {}
        for (const k in roundMeta) staleMeta[k] = roundMeta[k]
        staleMeta.status = 'descartada'
        staleMeta.reason = 'resposta obsoleta: existe entrada mais recente sem resposta'
        saveAiLogRecord(latestContact, instance, staleMeta)
        $app
          .logger()
          .info(
            'AI reply discarded as stale — pending stays for the newest round',
            'contact',
            contactId,
          )
      } else {
        // Falha da IA NÃO é enviada ao cliente. Só registra e loga.
        const failMeta = {}
        for (const k in roundMeta) failMeta[k] = roundMeta[k]
        failMeta.status = 'falhou'
        failMeta.reason =
          failReason || 'resposta vazia, obsoleta ou falha na chamada à OpenAI Agents API'
        saveAiErrorRecord(latestContact, instance, failMeta.reason, failMeta)
        $app.logger().error('AI reply not sent', 'contact', contactId, 'reason', failReason)
      }
    } catch (err) {
      saveAiErrorRecord(latestContact, instance, String(err), {
        status: 'falhou',
        reason: String(err),
        sessionId: typeof sessionId === 'string' ? sessionId : '',
        turnId: '',
        sourceIds: sourceIds,
        triggerBody: combinedBody,
      })
      $app.logger().error('AI response failed', 'error', String(err))
      break
    } finally {
      // v0.0.91: a pendência que chegou DURANTE esta rodada nunca fica sem
      // resposta — ao fim de cada rodada o loop relê o contato e roda outra
      // rodada se ainda há entrada com texto não respondida.
      if (staleDiscarded) {
        lastDiscardedNewestId = newestUnansweredId()
      }
    }

    // ===== Fim da rodada: a pendência que chegou DURANTE esta rodada =====
    // Reavalia a fila do contato. Se ainda há entrada com texto não respondida
    // (ou seja, a resposta desta rodada foi descartada como obsoleta, ou uma
    // mensagem nova chegou enquanto esperávamos a OpenAI), o loop roda outra
    // rodada com a mensagem mais recente como gatilho. Caso contrário, encerra.
    try {
      latestContact = $app.findRecordById('whatsapp_contacts', contact.id)
      const stillPending = readJsonArray(latestContact, 'ai_pending_ids')
      const doneIds2 = readJsonArray(latestContact, 'ai_processed_ids')
      let remaining = 0
      let newestPendingId = ''
      let newestPendingAt = 0
      const recent = $app.findRecordsByFilter(
        'whatsapp_messages',
        `contact_id='${contactId}' && direction='in'`,
        '-created',
        20,
        0,
      )
      for (let ri = 0; ri < recent.length; ri++) {
        const m = recent[ri]
        if (!m.getString('body')) continue // vazia não entra na fila
        const mid = m.getString('message_id') || m.id
        if (doneIds2.indexOf(mid) !== -1) continue // já respondida
        remaining++
        if (newestPendingAt === 0) {
          newestPendingId = mid
          const mAt = m.getString('sent_at')
            ? parseTs(m.getString('sent_at'))
            : parseTs(m.get('created'))
          newestPendingAt = mAt
        }
      }
      if (remaining === 0) {
        // Fila vazia: limpa as pendentes do contato e encerra.
        writeJsonArray(latestContact, 'ai_pending_ids', [])
        $app.saveNoValidate(latestContact)
        $app
          .logger()
          .info('AI round loop: queue drained', 'contact', contactId, 'rounds', roundIndex)
        break
      }
      if (staleDiscarded && newestPendingId === lastDiscardedNewestId) {
        // A mais recente ainda é a mesma que causou o descarte: espera o
        // debounce do PRÓPRIO texto (mensagens em rajada chegam em ~2s) antes
        // de rodar de novo, para a próxima rodada já incluir tudo.
        $app
          .logger()
          .info(
            'AI round loop: stale round — waiting for debounce before requeueing',
            'contact',
            contactId,
            'round',
            roundIndex,
          )
        waitMs(DEBOUNCE_MS)
        continue
      }
      if (!staleDiscarded && newestPendingId === '') {
        // Rodada concluiu e não há pendência nova — nada a fazer.
        break
      }
      $app
        .logger()
        .info(
          'AI round loop: pending remains — running another round',
          'contact',
          contactId,
          'round',
          roundIndex,
          'remaining',
          remaining,
          'newest_pending',
          newestPendingId,
        )
    } catch (err) {
      $app.logger().error('AI round loop: requeue check failed', 'error', String(err))
      break
    }
  }

  // ===== v0.0.92: fecha a marca de "rodada aberta" =====
  // Todo caminho de saída do loop (break, teto de rodadas, fim natural) passa
  // aqui — a marca nunca fica órfã (o cron de segurança a ignora quando antiga,
  // mas fechar aqui evita esperar o ROUND_OPEN_STALE_MS à toa).
  try {
    const cClose = $app.findRecordById('whatsapp_contacts', contact.id)
    cClose.set(AI_ROUND_OPEN_AT, '')
    $app.saveNoValidate(cClose)
  } catch (_) {}

  e.next()
}, 'whatsapp_messages')
