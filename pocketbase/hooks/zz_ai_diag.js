/**
 * TEMPORÁRIO (diagnóstico) — DELETAR antes do commit.
 * Cria UMA sessão no agente Iris salvo, espera os itens, e grava os BODIES
 * brutos (criação + items) na whatsapp_messages como automation_type='diag_result'.
 * Uso: POST /backend/v1/zz-ai-diag  body: { text: "diag" }
 */
routerAdd('POST', '/backend/v1/zz-ai-diag', (e) => {
  const body = e.requestInfo().body || {}
  const text = String(body.text || 'Diagnóstico da Agents API')

  const AGENTS_BASE = 'https://api.openai.com/v1/agents'
  const apiKey = $secrets.get('OPENAI_API_KEY') || $os.getenv('OPENAI_API_KEY') || ''

  const call = (url, payload) => {
    const options = {
      url,
      method: payload === null ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'agents=v1',
      },
      timeout: 60,
    }
    if (payload !== null) options.body = JSON.stringify(payload)
    return $http.send(options)
  }

  try {
    const sessionRes = call(AGENTS_BASE + '/sessions', {
      agent_id: 'agent_6af5dc6ca48c8191b0c1a59374012598',
      environment: { type: 'none' },
      input: text,
      stream: false,
    })
    const sessionBody =
      (sessionRes.body && new TextDecoder().decode(sessionRes.body)) ||
      JSON.stringify(sessionRes.json || {})

    let sessionId = ''
    try {
      sessionId = (sessionRes.json && sessionRes.json.id) || ''
    } catch (_) {}

    // Espera antes de buscar os itens.
    $http.send({ url: 'https://httpbin.org/delay/8', timeout: 15 })

    let itemsBody = ''
    if (sessionId) {
      const itemsRes = call(
        AGENTS_BASE + '/sessions/' + sessionId + '/items?order=desc&limit=20',
        null,
      )
      itemsBody =
        (itemsRes.body && new TextDecoder().decode(itemsRes.body)) ||
        JSON.stringify(itemsRes.json || {})
      itemsBody = 'ITEMS_STATUS=' + itemsRes.statusCode + ' | ' + itemsBody
    }

    const col = $app.findCollectionByNameOrId('whatsapp_messages')
    const rec = new Record(col)
    rec.set('user_id', 'jgef0yk57capw1g')
    rec.set('instance_id', 'uzo2y1vibqv4oqs')
    rec.set('contact_id', 'uhqgvpw3ydrbd6w')
    rec.set('remote_jid', '5511900000000@s.whatsapp.net')
    rec.set('message_id', 'diag_' + $security.randomString(12))
    rec.set('direction', 'out')
    rec.set('type', 'text')
    rec.set(
      'body',
      'DIAG session=' +
        sessionId +
        ' :: ' +
        sessionBody.slice(0, 4000) +
        ' ||| ' +
        itemsBody.slice(0, 12000),
    )
    rec.set('automation_type', 'diag_result')
    rec.set('sent_at', new Date().toISOString())
    $app.saveNoValidate(rec)

    return e.json(200, { ok: true })
  } catch (err) {
    return e.json(500, { ok: false, error: String(err) })
  }
})
