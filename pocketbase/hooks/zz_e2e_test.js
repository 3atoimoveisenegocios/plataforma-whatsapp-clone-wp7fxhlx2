/**
 * TEMPORÁRIO — teste E2E da integração IA. DEVE SER DELETADO após os testes.
 * Rotas: GET /backend/v1/ai-e2e-test?step=1|2|cleanup&key=...
 * step=1: cria contato de teste + 1ª mensagem in
 * step=2: cria 2ª mensagem in (mesmo contato — teste de continuidade de sessão)
 * cleanup: apaga mensagens/contato de teste e registros diag_result/ai_error
 */
routerAdd('GET', '/backend/v1/ai-e2e-test', (e) => {
  const q = e.requestInfo().query
  const step = q.step || '1'
  const key = q.key || ''
  const expected = $secrets.get('WHATSAPP_API_TOKEN') || $os.getenv('WHATSAPP_API_TOKEN') || ''
  if (!expected || key !== expected) {
    return e.json(401, { ok: false, error: 'unauthorized' })
  }

  const userId = 'jgef0yk57capw1g'
  const instanceId = 'uzo2y1vibqv4oqs'
  const jid = '5511900000000@s.whatsapp.net'

  if (step === 'cleanup') {
    const deleted = { messages: 0, contacts: 0, diag: 0 }
    // mensagens do contato de teste
    try {
      const contact = $app.findFirstRecordByFilter(
        'whatsapp_contacts',
        "remote_jid = {:jid} && user_id = {:uid}",
        { jid: jid, uid: userId },
      )
      const msgs = $app.findRecordsByFilter(
        'whatsapp_messages',
        "contact_id = {:cid}",
        '-created',
        200,
        0,
        { cid: contact.id },
      )
      for (const m of msgs) {
        $app.delete(m)
        deleted.messages++
      }
      $app.delete(contact)
      deleted.contacts++
    } catch (_) {}
    // registros diag_result e err_* deixados pelos testes do cron
    try {
      const diags = $app.findRecordsByFilter(
        'whatsapp_messages',
        "automation_type = 'diag_result' || automation_type = 'ai_error'",
        '-created',
        500,
        0,
      )
      for (const d of diags) {
        const mid = d.getString('message_id')
        if (d.getString('automation_type') === 'ai_error' && mid.indexOf('err_') !== 0) {
          continue // ai_error de produção real: preservar
        }
        $app.delete(d)
        deleted.diag++
      }
    } catch (_) {}
    return e.json(200, { ok: true, deleted: deleted })
  }

  // step 1: cria contato; step 2: reusa
  let contact
  try {
    contact = $app.findFirstRecordByFilter(
      'whatsapp_contacts',
      "remote_jid = {:jid} && user_id = {:uid}",
      { jid: jid, uid: userId },
    )
  } catch (_) {
    const col = $app.findCollectionByNameOrId('whatsapp_contacts')
    contact = new Record(col)
    contact.set('user_id', userId)
    contact.set('instance_id', instanceId)
    contact.set('remote_jid', jid)
    contact.set('name', 'TESTE IA')
    contact.set('phone', '5511900000000')
    contact.set('agent_paused', false)
    $app.saveNoValidate(contact)
  }

  const text = step === '2' ? 'Segunda mensagem de teste: qual o horario de atendimento?' : 'Ola, voce tem apartamento com 2 quartos?'

  const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
  const m = new Record(msgsCol)
  m.set('user_id', userId)
  m.set('instance_id', instanceId)
  m.set('contact_id', contact.id)
  m.set('remote_jid', jid)
  m.set('message_id', 'e2e_' + $security.randomString(12))
  m.set('direction', 'in')
  m.set('body', text)
  m.set('type', 'text')
  m.set('sent_at', new Date().toISOString())
  $app.saveNoValidate(m)

  return e.json(200, {
    ok: true,
    step: step,
    contact_id: contact.id,
    message_id: m.id,
    session_before: contact.getString('ai_session_id'),
  })
})
