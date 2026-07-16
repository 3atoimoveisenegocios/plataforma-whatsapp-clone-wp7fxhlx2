onRecordAfterCreateSuccess((e) => {
  const msg = e.record
  if (msg.getString('direction') !== 'in') return e.next()

  const contactId = msg.getString('contact_id')
  const instanceId = msg.getString('instance_id')

  let existingMessages = []
  try {
    existingMessages = $app.findRecordsByFilter(
      'whatsapp_messages',
      `contact_id='${contactId}'`,
      '-created',
      2,
      0,
    )
  } catch (err) {
    return e.next()
  }

  if (existingMessages.length > 1) return e.next()

  let agents = []
  try {
    agents = $app.findRecordsByFilter(
      'ai_agents',
      `instance_id='${instanceId}' && active=true`,
      '-created',
      1,
      0,
    )
  } catch (_) {
    return e.next()
  }

  if (!agents || agents.length === 0) return e.next()
  const agent = agents[0]

  const welcomeEnabled = agent.getBool('welcome_enabled')
  if (!welcomeEnabled) return e.next()

  const welcomeMessage = agent.getString('welcome_message')
  if (!welcomeMessage || !welcomeMessage.trim()) return e.next()

  const contact = $app.findRecordById('whatsapp_contacts', contactId)

  let instance
  try {
    instance = $app.findRecordById('whatsapp_instances', instanceId)
  } catch (_) {
    return e.next()
  }
  const instanceName = instance.getString('instance_name')

  const evoUrl = $secrets.get('EVOLUTION_API_URL')
  const evoKey = $secrets.get('EVOLUTION_API_KEY')

  if (!evoUrl || !evoKey) return e.next()

  let evoUrlSanitized = evoUrl
  if (evoUrlSanitized.endsWith('/')) evoUrlSanitized = evoUrlSanitized.slice(0, -1)

  try {
    const res = $http.send({
      url: evoUrlSanitized + '/message/sendText/' + instanceName,
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: contact.getString('remote_jid'),
        text: welcomeMessage,
        delay: 1200,
      }),
      timeout: 15,
    })

    if (res.statusCode === 200 || res.statusCode === 201) {
      let messageId = 'msg_' + $security.randomString(10)
      if (res.json && res.json.key && res.json.key.id) messageId = res.json.key.id
      else if (res.json && res.json.messageId) messageId = res.json.messageId

      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const msgRecord = new Record(msgsCol)
      msgRecord.set('user_id', contact.getString('user_id'))
      msgRecord.set('instance_id', instance.id)
      msgRecord.set('contact_id', contact.id)
      msgRecord.set('remote_jid', contact.getString('remote_jid'))
      msgRecord.set('message_id', messageId)
      msgRecord.set('direction', 'out')
      msgRecord.set('body', welcomeMessage)
      msgRecord.set('type', 'text')
      msgRecord.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(msgRecord)

      contact.set('last_message', welcomeMessage)
      contact.set('last_message_at', new Date().toISOString())
      $app.saveNoValidate(contact)
    } else {
      $app.logger().error('Welcome message send failed', 'status', res.statusCode)
    }
  } catch (err) {
    $app.logger().error('Welcome message exception', 'error', String(err))
  }

  return e.next()
}, 'whatsapp_messages')
