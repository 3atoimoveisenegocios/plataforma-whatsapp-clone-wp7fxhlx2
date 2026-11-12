// TEMPORÁRIO (teste e2e da extração do turno atual da Agents API). REMOVER após validação.
//
// Duas rotas GET (para permitir chamada via ferramenta de leitura HTTP):
//
// 1) POST-like de entrada — insere UMA mensagem direction='in' no contato de teste:
//    GET /backend/v1/zz-ai-e2e?contact=<id>&instance=<id>&user=<id>&jid=<jid>&body=<texto>
//    (chame com espera >= 15s entre as chamadas para simular turnos reais)
//
// 2) Snapshot de verificação — espera a rodada terminar (debounce + IA) e devolve
//    as últimas mensagens do contato:
//    GET /backend/v1/zz-ai-e2e-verify?contact=<id>&wait=<segundos opcional>
routerAdd('GET', '/backend/v1/zz-ai-e2e', (e) => {
  const q = e.requestInfo().query
  const contactId = q.contact || ''
  const instanceId = q.instance || ''
  const userId = q.user || ''
  const jid = q.jid || ''
  const body = q.body || ''
  if (!contactId || !instanceId || !userId || !jid || !body) {
    return e.json(400, {
      error: 'params obrigatorios: contact, instance, user, jid, body',
    })
  }

  const col = $app.findCollectionByNameOrId('whatsapp_messages')
  const r = new Record(col)
  r.set('user_id', userId)
  r.set('instance_id', instanceId)
  r.set('contact_id', contactId)
  r.set('remote_jid', jid)
  r.set('message_id', 'zz_e2e_' + $security.randomString(8))
  r.set('direction', 'in')
  r.set('body', body)
  r.set('type', 'text')
  r.set('sent_at', new Date().toISOString())
  $app.saveNoValidate(r)
  return e.json(200, { ok: true, msg_id: r.id, message_id: r.getString('message_id') })
})

routerAdd('GET', '/backend/v1/zz-ai-e2e-verify', (e) => {
  const q = e.requestInfo().query
  const contactId = q.contact || ''
  const waitSec = parseInt(q.wait || '0', 10) || 0
  if (!contactId) return e.json(400, { error: 'param obrigatorio: contact' })
  if (waitSec > 0) {
    try {
      $http.send({
        url: 'https://httpbin.org/delay/' + Math.min(waitSec, 25),
        timeout: Math.min(waitSec, 25) + 5,
      })
    } catch (_) {}
  }
  let msgs = []
  try {
    msgs = $app.findRecordsByFilter(
      'whatsapp_messages',
      `contact_id='${contactId}'`,
      '-created',
      12,
      0,
    )
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
  const out = []
  for (const m of msgs) {
    out.push({
      id: m.id,
      message_id: m.getString('message_id'),
      direction: m.getString('direction'),
      automation_type: m.getString('automation_type'),
      body: (m.getString('body') || '').slice(0, 400),
      created: m.getString('created'),
    })
  }
  let contact = null
  try {
    const c = $app.findRecordById('whatsapp_contacts', contactId)
    contact = {
      id: c.id,
      ai_session_id: c.getString('ai_session_id'),
      ai_processed_ids: c.getString('ai_processed_ids'),
      ai_pending_ids: c.getString('ai_pending_ids'),
      ai_pending_at: c.getString('ai_pending_at'),
      last_message: c.getString('last_message').slice(0, 200),
    }
  } catch (_) {}
  return e.json(200, { contact: contact, messages: out })
})
