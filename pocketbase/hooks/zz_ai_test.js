// TEMPORÁRIO — diagnóstico da Agents API. Remover após os testes.
cronAdd('ai_integration_test', '*/1 * * * *', () => {
  const apiKey = $os.getenv('OPENAI_API_KEY') || $secrets.get('OPENAI_API_KEY') || ''
  const store = (body) => {
    try {
      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const r = new Record(msgsCol)
      r.set('user_id', 'jgef0yk57capw1g')
      r.set('instance_id', 'uzo2y1vibqv4oqs')
      r.set('remote_jid', 'diag@diagnostic.local')
      r.set('message_id', 'diag_' + $security.randomString(8))
      r.set('direction', 'out')
      r.set('body', String(body).slice(0, 2000))
      r.set('type', 'text')
      r.set('automation_type', 'diag_result')
      r.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(r)
    } catch (err) {
      console.error('diag store failed: ' + String(err))
    }
  }

  // 1. Sessão (não-stream)
  let res = null
  try {
    res = $http.send({
      url: 'https://api.openai.com/v1/agents/sessions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'agents=v1',
      },
      body: JSON.stringify({
        agent_id: 'agent_6af5dc6ca48c8191b0c1a59374012598',
        environment: { type: 'none' },
        input: 'Ola, bom dia! Voces tem casas com 3 quartos para alugar em Santo Andre?',
        stream: false,
      }),
      timeout: 90,
    })
    store('NONSTREAM status=' + res.statusCode + ' body=' + JSON.stringify(res.json || res.body))
  } catch (err) {
    store('NONSTREAM threw: ' + String(err))
    return
  }

  // 2. Se não-stream não deu texto, testa stream:true e captura o SSE bruto.
  try {
    const res2 = $http.send({
      url: 'https://api.openai.com/v1/agents/sessions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'agents=v1',
      },
      body: JSON.stringify({
        agent_id: 'agent_6af5dc6ca48c8191b0c1a59374012598',
        environment: { type: 'none' },
        input: 'Ola, bom dia! Voces tem casas com 3 quartos para alugar em Santo Andre?',
        stream: true,
      }),
      timeout: 90,
    })
    store('STREAM status=' + res2.statusCode + ' body=' + String(res2.body || '').slice(0, 4000))
  } catch (err) {
    store('STREAM threw: ' + String(err))
  }
})
