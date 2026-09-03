onRecordAfterCreateSuccess((e) => {
  const msg = e.record
  if (msg.getString('direction') !== 'in') return e.next()

  const contactId = msg.getString('contact_id')
  const instanceId = msg.getString('instance_id')

  try {
    const contact = $app.findRecordById('whatsapp_contacts', contactId)
    if (contact.getBool('agent_paused')) return e.next()
  } catch (_) {
    return e.next()
  }

  let existingMessages = []
  try {
    existingMessages = $app.findRecordsByFilter(
      'whatsapp_messages',
      "contact_id='" + contactId + "' && direction='in'",
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
      "instance_id='" + instanceId + "' && active=true",
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

  let greetingKeywords = ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'ola', 'oie']
  try {
    const raw = agent.getString('greeting_keywords')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) greetingKeywords = parsed
    }
  } catch (_) {}

  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[áàâãä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o')
      .replace(/[úùûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const normalizedKeywords = greetingKeywords.map(normalize).filter(Boolean)
  if (normalizedKeywords.length === 0) return e.next()

  const messageBody = (msg.getString('body') || '').toLowerCase().trim()
  const normalized = normalize(messageBody)
  if (!normalized) return e.next()

  let remaining = normalized
  let matchedAny = false

  const sortedKeywords = normalizedKeywords.slice().sort((a, b) => b.length - a.length)
  for (let i = 0; i < sortedKeywords.length; i++) {
    const kw = sortedKeywords[i]
    if (!kw) continue
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp('\\b' + escaped + '\\b', 'g')
    if (regex.test(remaining)) {
      matchedAny = true
      remaining = remaining.replace(regex, '').replace(/\s+/g, ' ').trim()
    }
  }

  if (!matchedAny) return e.next()

  const businessHoursEnabled = agent.getBool('business_hours_enabled')
  if (businessHoursEnabled) {
    let operatingDays = []
    try {
      const raw = agent.getString('operating_days')
      if (raw) operatingDays = JSON.parse(raw)
    } catch (_) {}

    const startTime = agent.getString('start_time') || '09:00'
    const endTime = agent.getString('end_time') || '18:00'

    const now = new Date()
    const utcMs = now.getTime()
    const localMs = utcMs - 3 * 60 * 60 * 1000
    const localDate = new Date(localMs)

    const currentDayNum = localDate.getUTCDay()
    const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
    const startParts = startTime.split(':').map(Number)
    const endParts = endTime.split(':').map(Number)
    const startMinutes = (startParts[0] || 8) * 60 + (startParts[1] || 0)
    const endMinutes = (endParts[0] || 18) * 60 + (endParts[1] || 0)

    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
    const currentDayName = dayNames[currentDayNum]
    const isOperatingDay =
      operatingDays.indexOf(currentDayNum) !== -1 || operatingDays.indexOf(currentDayName) !== -1
    const isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes

    if (!isOperatingDay || !isWithinHours) {
      return e.next()
    }
  }

  if (remaining.length > 0) {
    try {
      const contact = $app.findRecordById('whatsapp_contacts', contactId)
      const instance = $app.findRecordById('whatsapp_instances', instanceId)
      const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
      const suppressRecord = new Record(msgsCol)
      suppressRecord.set('user_id', contact.getString('user_id'))
      suppressRecord.set('instance_id', instance.id)
      suppressRecord.set('contact_id', contact.id)
      suppressRecord.set('remote_jid', contact.getString('remote_jid'))
      suppressRecord.set('message_id', 'suppress_' + $security.randomString(10))
      suppressRecord.set('direction', 'out')
      suppressRecord.set('body', 'Saudação suprimida')
      suppressRecord.set('type', 'text')
      suppressRecord.set('automation_type', 'suppressed_greeting')
      suppressRecord.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(suppressRecord)
    } catch (err) {
      $app.logger().error('Failed to create suppressed greeting indicator', 'error', String(err))
    }
    return e.next()
  }

  const nowDate = new Date()
  const localMs2 = nowDate.getTime() - 3 * 60 * 60 * 1000
  const localDate2 = new Date(localMs2)
  const hour = localDate2.getUTCHours()

  let greetingPrefix = 'Boa noite'
  if (hour >= 6 && hour < 12) greetingPrefix = 'Bom dia'
  else if (hour >= 12 && hour < 18) greetingPrefix = 'Boa tarde'

  const fullWelcomeMessage = greetingPrefix + '! ' + welcomeMessage

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
        text: fullWelcomeMessage,
        delay: 1200,
      }),
      timeout: 15,
    })

    if (res.statusCode === 200 || res.statusCode === 201) {
      let messageId = 'msg_' + $security.randomString(10)
      if (res.json && res.json.key && res.json.key.id) messageId = res.json.key.id
      else if (res.json && res.json.messageId) messageId = res.json.messageId

      const msgsCol2 = $app.findCollectionByNameOrId('whatsapp_messages')
      const msgRecord = new Record(msgsCol2)
      msgRecord.set('user_id', contact.getString('user_id'))
      msgRecord.set('instance_id', instance.id)
      msgRecord.set('contact_id', contact.id)
      msgRecord.set('remote_jid', contact.getString('remote_jid'))
      msgRecord.set('message_id', messageId)
      msgRecord.set('direction', 'out')
      msgRecord.set('body', fullWelcomeMessage)
      msgRecord.set('type', 'text')
      msgRecord.set('automation_type', 'welcome')
      msgRecord.set('sent_at', new Date().toISOString())
      $app.saveNoValidate(msgRecord)

      try {
        const incomingMsg = $app.findRecordById('whatsapp_messages', msg.id)
        incomingMsg.set('greeting_sent', true)
        $app.saveNoValidate(incomingMsg)
      } catch (_) {}

      contact.set('last_message', fullWelcomeMessage)
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
