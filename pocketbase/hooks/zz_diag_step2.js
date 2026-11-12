// TEMPORÁRIO — parte da depuração da Agents API. Grava em
// whatsapp_messages (automation_type='diag_result') o texto exato do item
// assistant para provar o texto real da Iris, e remove os dados antigos de
// teste da sessão anterior (roda 1x por minuto, mas é idempotente).
cronAdd('ai_diag_step2', '*/1 * * * *', () => {
  const apiKey = $os.getenv('OPENAI_API_KEY') || $secrets.get('OPENAI_API_KEY') || ''
  const AGENTS_BASE = 'https://api.openai.com/v1/agents'
  const SESSION_ID = 'sess_0712488a50380eb5006af5e85c2a98819695eadd5d90118fe1'

  const store = (body) => {
    try {
      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const r = new Record(msgsCol)
      r.set('user_id', 'jgef0yk57capw1g')
      r.set('instance_id', 'uzo2y1vibqv4oqs')
      r.set('remote_jid', 'diag@diagnostic.local')
      r.set('message_id', 'diag_' + $security.randomString(8))
      r.set('direction', 'out')
      r.set('body', String(body).slice(0, 50000))
      r.set('type', 'text')
      r.set('automation_type', 'diag_result')
      r.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(r)
    } catch (err) {
      console.error('diag store failed: ' + String(err))
    }
  }

  // 1. LIMPEZA de registros de teste criados por este diagnóstico e pela
  //    sessão de teste do ai_integration_test (não mexe em dados reais de
  //    clientes — só no contato temporário 'diag@diagnostic.local' e no
  //    contato temporário usado pelo test hook).
  try {
    const tempContacts = $app.findRecordsByFilter(
      'whatsapp_contacts',
      "remote_jid~'diag@diagnostic.local' || remote_jid~'5511900000000'",
      '',
      0,
      0,
    )
    tempContacts.forEach((c) => {
      $app.delete($app.findRecordById('whatsapp_contacts', c.id))
    })
    const diagMsgs = $app.findRecordsByFilter(
      'whatsapp_messages',
      "automation_type='diag_result'",
      '',
      0,
      0,
    )
    diagMsgs.forEach((m) => {
      $app.delete($app.findRecordById('whatsapp_messages', m.id))
    })
    const testInMsgs = $app.findRecordsByFilter(
      'whatsapp_messages',
      "direction='in' && remote_jid~'5511900000000'",
      '',
      0,
      0,
    )
    testInMsgs.forEach((m) => {
      $app.delete($app.findRecordById('whatsapp_messages', m.id))
    })
    const testOutMsgs = $app.findRecordsByFilter(
      'whatsapp_messages',
      "direction='out' && remote_jid~'5511900000000'",
      '',
      0,
      0,
    )
    testOutMsgs.forEach((m) => {
      $app.delete($app.findRecordById('whatsapp_messages', m.id))
    })
  } catch (err) {
    store('CLEANUP threw: ' + String(err))
  }

  // 2. Prova do texto real da Iris: GET /items, achar o item assistant mais
  //    recente e gravar o .text exato + o shape bruto completo em diag_result.
  try {
    const items = $http.send({
      url: AGENTS_BASE + '/sessions/' + SESSION_ID + '/items?order=desc&limit=20',
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'agents=v1',
      },
      timeout: 30,
    })
    const list = items.json && Array.isArray(items.json.data) ? items.json.data : []
    for (let i = 0; i < list.length; i++) {
      const it = list[i]
      if (it.role === 'assistant' && Array.isArray(it.content)) {
        const textParts = []
        it.content.forEach((part) => {
          if (part && (part.type === 'output_text' || part.type === 'text')) {
            textParts.push(part.text)
          }
        })
        const joined = textParts.join('\n')
        store(
          'IRIS_TEXT status=' +
            items.statusCode +
            ' item_id=' +
            String(it.id) +
            ' phase=' +
            String(it.phase) +
            ' status_field=' +
            String(it.status) +
            ' turn=' +
            String(it.turn_id) +
            ' | shape=' +
            JSON.stringify(it) +
            ' | TEXT_BEGIN' +
            joined +
            'TEXT_END',
        )
        break // só o assistant mais recente
      }
    }
    if (list.length === 0) {
      store('IRIS_TEXT EMPTY data=' + JSON.stringify(items.json || items.body))
    }
  } catch (err) {
    store('IRIS_TEXT threw: ' + String(err))
  }
})
