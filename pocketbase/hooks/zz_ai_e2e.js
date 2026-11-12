// TEMPORÁRIO (teste e2e da extração do turno atual da Agents API).
// Insere UMA mensagem direction='in' no contato de teste informado:
//   POST /backend/v1/zz-ai-e2e?contact=<id>&instance=<id>&user=<id>&jid=<jid>&body=<texto>
// Chame duas vezes (com espera entre elas) para simular o turno 1 ('oi') e o
// turno 2 ('tem apartamento em Santo André?') de uma conversa real.
routerAdd('POST', '/backend/v1/zz-ai-e2e', (e) => {
  const q = e.requestInfo().query
  const contactId = q.contact || ''
  const instanceId = q.instance || ''
  const userId = q.user || ''
  const jid = q.jid || ''
  const body = q.body || ''
  if (!contactId || !instanceId || !userId || !jid || !body) {
    return e.json(400, { error: 'params obrigatorios: contact, instance, user, jid, body' })
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
