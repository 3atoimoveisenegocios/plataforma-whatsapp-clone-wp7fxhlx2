/**
 * TEMPORÁRIO (teste E2E) — DELETAR antes do commit.
 * Posta uma mensagem de teste direction='in' na instância de produção (sem
 * tocar na Evolution), o que dispara o hook on_message_create_ai com a
 * dedupe/debounce da v0.0.80.
 * Uso: POST /backend/v1/zz-ai-test  body: { text: "..." }
 */
routerAdd('POST', '/backend/v1/zz-ai-test', (e) => {
  const body = e.requestInfo().body || {}
  const text = String(body.text || '').trim()
  if (!text) return e.json(400, { ok: false, error: 'text obrigatório' })

  try {
    const instance = $app.findFirstRecordByData(
      'whatsapp_instances',
      'instance_name',
      'user_jgef0yk57capw1g',
    )
    const userId = instance.getString('user_id')
    const remoteJid = '5511900000000@s.whatsapp.net'

    let contact
    try {
      const recs = $app.findRecordsByFilter(
        'whatsapp_contacts',
        'user_id = {:userId} && remote_jid = {:jid}',
        '-created',
        1,
        0,
        { userId: userId, jid: remoteJid },
      )
      if (recs && recs.length > 0) contact = recs[0]
    } catch (_) {}

    if (!contact) {
      const col = $app.findCollectionByNameOrId('whatsapp_contacts')
      contact = new Record(col)
      contact.set('user_id', userId)
      contact.set('instance_id', instance.id)
      contact.set('remote_jid', remoteJid)
      contact.set('name', 'Contato Teste IA')
      contact.set('phone', '5511900000000')
      $app.saveNoValidate(contact)
    }

    const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
    const msg = new Record(msgsCol)
    msg.set('user_id', userId)
    msg.set('instance_id', instance.id)
    msg.set('contact_id', contact.id)
    msg.set('remote_jid', remoteJid)
    msg.set('message_id', 'e2e_' + $security.randomString(10))
    msg.set('direction', 'in')
    msg.set('body', text)
    msg.set('type', 'text')
    msg.set('sent_at', new Date().toISOString())
    $app.saveNoValidate(msg)

    return e.json(200, { ok: true, message_id: msg.getString('message_id') })
  } catch (err) {
    return e.json(500, { ok: false, error: String(err) })
  }
})
