/**
 * TEMPORÁRIO — teste E2E da integração IA. DEVE SER DELETADO após os testes.
 * Rotas: GET /backend/v1/ai-e2e-test?step=...&key=...
 * dup:   cria contato de teste + MESMA mensagem in DUAS vezes (teste de dedupe)
 * seq:   cria DUAS mensagens in rápidas (teste de debounce/agregação)
 * cleanup: apaga mensagens/contato de teste e registros diag_result/ai_error
 */

routerAdd('GET', '/backend/v1/ai-e2e-test', (e) => {
  const q = e.requestInfo().query
  const step = q.step || 'dup'

  const userId = 'jgef0yk57capw1g'
  const instanceId = 'uzo2y1vibqv4oqs'
  const jid = '5511900000000@s.whatsapp.net'

  if (step === 'cleanup') {
    const deleted = { messages: 0, contacts: 0, diag: 0 }
    // mensagens do contato de teste
    try {
      const contact = $app.findFirstRecordByFilter(
        'whatsapp_contacts',
        'remote_jid = {:jid} && user_id = {:uid}',
        { jid: jid, uid: userId },
      )
      const msgs = $app.findRecordsByFilter(
        'whatsapp_messages',
        'contact_id = {:cid}',
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
    // registros diag_result e err_* deixados pelos testes
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

  // cria (ou reusa) o contato de teste
  let contact
  try {
    contact = $app.findFirstRecordByFilter(
      'whatsapp_contacts',
      'remote_jid = {:jid} && user_id = {:uid}',
      { jid: jid, uid: userId },
    )
    // estado limpo por rodada de teste
    contact.set('ai_processed_ids', '')
    contact.set('ai_pending_ids', '')
    contact.set('ai_pending_at', '')
    contact.set('ai_session_id', '')
    $app.saveNoValidate(contact)
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

  const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')

  function createInMessage(messageId, text) {
    const m = new Record(msgsCol)
    m.set('user_id', userId)
    m.set('instance_id', instanceId)
    m.set('contact_id', contact.id)
    m.set('remote_jid', contact.getString('remote_jid'))
    m.set('message_id', messageId)
    m.set('direction', 'in')
    m.set('body', text)
    m.set('type', 'text')
    m.set('sent_at', new Date().toISOString())
    $app.saveNoValidate(m)
    return m.id
  }

  if (step === 'dup') {
    // MESMA mensagem (mesmo message_id) gravada duas vezes — simula evento
    // duplicado do webhook. Cada create dispara o hook da IA.
    const messageId = 'e2e_dup_' + $security.randomString(8)
    const text = 'Teste de duplicacao: voce tem apartamento com 2 quartos?'
    const id1 = createInMessage(messageId, text)
    // whatsapp_messages.message_id tem índice UNIQUE — o 2º registro precisa de
    // id próprio (a chave de dedupe continua sendo `messageId`).
    const id2 = createInMessage(messageId + '_dup', text)
    return e.json(200, {
      ok: true,
      step: 'dup',
      contact_id: contact.id,
      message_id: messageId,
      record_ids: [id1, id2],
    })
  }

  if (step === 'seq') {
    // DUAS mensagens distintas em sequência rápida — simula cliente digitando
    // duas vezes seguidas. O debounce deve agregar as duas numa resposta só.
    const mid1 = 'e2e_seq1_' + $security.randomString(8)
    const mid2 = 'e2e_seq2_' + $security.randomString(8)
    const id1 = createInMessage(mid1, 'Primeira mensagem de teste: qual o horario de atendimento?')
    const id2 = createInMessage(mid2, 'Segunda mensagem de teste: e voces atendem em Santo Andre?')
    return e.json(200, {
      ok: true,
      step: 'seq',
      contact_id: contact.id,
      message_ids: [mid1, mid2],
      record_ids: [id1, id2],
    })
  }

  return e.json(400, { ok: false, error: 'unknown step' })
})
