// TEMPORARIO (zz_) - E2E da correcao de out-of-order do hook de IA (v0.0.86).
//
// Cron a cada minuto. Cada passada roda UMA etapa (por zz_e2e_state.stage):
//   0 = novo: cria contato de teste + insere Obrigado / vazia / Vcs tem casa ?
//   1 = rodada 1: insere segunda mensagem Obrigado (dispara o hook real) e
//       espera 15s (debounce de 5s + inicio da rodada da OpenAI)
//   2 = rodada 2: insere Vcs tem casa ? (a rodada 1 deve ser descartada como
//       obsoleta - resposta nunca enviada) e espera a rodada completar (ate
//       ~120s, com early-exit pelo estado do contato)
//   3 = final: le o estado e grava o diagnostico em ai_diag_result + loga
//
// Tudo em um CONTATO DE TESTE isolado (nome zz_e2e IA v0.0.86, jid e
// instancia iguais aos do contato real - mesmo shape que o hook ve em
// producao, mas registro NOVO; nada e alterado no contato real).
// O envio real via Evolution falha (jid de teste recusado / sem confirmacao) e
// cai no logger 'Evolution send failed' - a prova e o estado persistido.
// REMOVER este arquivo depois do E2E (nenhum outro hook e tocado).

cronAdd('zz_ai_e2e', '*/1 * * * *', () => {
  // Estado do teste no contato de teste (nunca em contatos reais).
  let contact = null
  try {
    const found = $app.findRecordsByFilter(
      'whatsapp_contacts',
      `name='zz_e2e IA v0.0.86'`,
      '-created',
      1,
      0,
    )
    if (found.length > 0) contact = found[0]
  } catch (_) {}

  if (!contact) {
    const users = $app.findRecordsByFilter('users', '', '-created', 1, 0)
    if (users.length === 0) return
    const userId = users[0].id
    const instances = $app.findRecordsByFilter(
      'whatsapp_instances',
      `user_id='${userId}' && status='connected'`,
      '-created',
      1,
      0,
    )
    if (instances.length === 0) return
    const col = $app.findCollectionByNameOrId('whatsapp_contacts')
    contact = new Record(col)
    contact.set('user_id', userId)
    contact.set('instance_id', instances[0].id)
    contact.set('remote_jid', instances[0].getString('instance_name'))
    contact.set('name', 'zz_e2e IA v0.0.86')
    contact.set('phone', '5511900000000')
    contact.set('agent_paused', false)
    contact.set('ai_processed_ids', '[]')
    contact.set('ai_pending_ids', '[]')
    contact.set('ai_session_id', '')
    $app.saveNoValidate(contact)
    contact.set('ai_diag_result', 'stage 0 created')
    $app.saveNoValidate(contact)
    return
  }

  const userId = contact.getString('user_id')
  const instanceId = contact.getString('instance_id')
  const jid = contact.getString('remote_jid')

  function zzCreateIn(body, sentAt, source) {
    const col = $app.findCollectionByNameOrId('whatsapp_messages')
    const rec = new Record(col)
    rec.set('user_id', userId)
    rec.set('instance_id', instanceId)
    rec.set('contact_id', contact.id)
    rec.set('remote_jid', jid)
    rec.set('message_id', 'zz_' + source + '_' + $security.randomString(6))
    rec.set('direction', 'in')
    rec.set('body', body)
    rec.set('type', 'text')
    rec.set('sent_at', sentAt)
    $app.saveNoValidate(rec)
    return rec
  }

  function zzMs() {
    return Date.now()
  }

  function zzIso(ms) {
    return new Date(ms).toISOString()
  }

  function zzSetStage(stage, note) {
    contact.set('ai_diag_result', 'stage ' + stage + (note ? ' - ' + note : ''))
    $app.saveNoValidate(contact)
  }

  function zzReadProcessed(contactId) {
    try {
      const c = $app.findRecordById('whatsapp_contacts', contactId)
      const raw = String(c.getString('ai_processed_ids') || '[]')
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    } catch (_) {
      return []
    }
  }

  function zzSleep(ms) {
    const end = zzMs() + ms
    while (zzMs() < end) {
      try {
        $http.send({ url: 'https://httpbin.org/delay/3', timeout: 5 })
      } catch (_) {}
    }
  }

  function zzSetOuts() {
    try {
      const msgs = $app.findRecordsByFilter(
        'whatsapp_messages',
        `contact_id='${contact.id}'`,
        '-created',
        30,
        0,
      )
      let outs = 0
      let aiErrors = 0
      const errReasons = []
      for (let i = 0; i < msgs.length; i++) {
        const at = msgs[i].getString('automation_type')
        if (at === 'ai_response') outs = outs + 1
        else if (at === 'ai_error') {
          aiErrors = aiErrors + 1
          errReasons.push(String(msgs[i].getString('body') || '').slice(0, 160))
        }
      }
      return { outs: outs, aiErrors: aiErrors, errReasons: errReasons }
    } catch (_) {
      return { outs: 0, aiErrors: 0, errReasons: [] }
    }
  }

  try {
    const stage = String(contact.getString('ai_diag_result') || '')
    if (stage.indexOf('stage 0') === 0) {
      // Etapa 1: seed + rodada 1 (a segunda mensagem Obrigado dispara o hook).
      const base = Date.now()
      const _obr1 = zzCreateIn('Obrigado', zzIso(base), 'obr1')
      const _vaz = zzCreateIn('', zzIso(base + 200), 'vaz')
      const pergunta = zzCreateIn('Vcs tem casa ?', zzIso(base + 400), 'per1')
      const _obr2 = zzCreateIn('Obrigado', zzIso(base + 600), 'obr2')
      zzSetStage(1, 'seeded obr1/vaz/per1/obr2; pergunta=' + pergunta.getString('message_id'))
      zzSleep(15000)
      // Rodada 2: a pergunta nova dispara o hook de novo (a rodada 1 deve ser
      // descartada como obsoleta - resposta nunca enviada).
      const _per2 = zzCreateIn('Vcs tem casa ?', zzIso(base + 16000), 'per2')
      zzSetStage(2, 'rodada 2 disparada; pergunta2=' + _per2.getString('message_id'))
      return
    }

    if (stage.indexOf('stage 1') === 0 || stage.indexOf('stage 2') === 0) {
      // Etapa 2: espera a rodada 2 completar (ate ~120s) e finaliza.
      const obr2Id = _obr2_id()
      const t1 = zzMs()
      while (zzMs() - t1 < 110000) {
        zzSleep(5000)
        if (obr2Id && zzReadProcessed(contact.id).indexOf(obr2Id) !== -1) break
      }
      const c2 = $app.findRecordById('whatsapp_contacts', contact.id)
      const counts = zzSetOuts()
      const diag =
        'stage 3 done - processed=' +
        String(c2.getString('ai_processed_ids') || '[]') +
        ' pending=' +
        String(c2.getString('ai_pending_ids') || '[]') +
        ' session=' +
        String(c2.getString('ai_session_id') || '') +
        ' outs=' +
        counts.outs +
        ' aiErrors=' +
        counts.aiErrors +
        ' reasons=' +
        counts.errReasons.join(' | ')
      contact.set('ai_diag_result', diag)
      $app.saveNoValidate(contact)
      $app.logger().info('zz_ai_e2e RESULT', 'contact', contact.id, 'diag', diag)
      return
    }

    // stage 3 (done): nao faz nada ate o contato de teste ser removido.
  } catch (err) {
    try {
      contact.set('ai_diag_result', 'error ' + String(err))
      $app.saveNoValidate(contact)
      $app.logger().error('zz_ai_e2e failed', 'error', String(err))
    } catch (_) {}
  }

  function _obr2_id() {
    try {
      const found = $app.findRecordsByFilter(
        'whatsapp_messages',
        `contact_id='${contact.id}' && message_id~'zz_obr2_'`,
        '-created',
        1,
        0,
      )
      if (found.length > 0) return found[0].getString('message_id')
    } catch (_) {}
    return ''
  }
})
