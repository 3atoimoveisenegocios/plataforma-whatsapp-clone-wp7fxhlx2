;['/backend/v1/whatsapp/send', '/api/custom/v1/whatsapp/send'].forEach((routePath) => {
  routerAdd(
    'POST',
    routePath,
    (e) => {
      // 1. Bearer Token Authentication
      var expectedToken =
        $secrets.get('WHATSAPP_API_TOKEN') || $os.getenv('WHATSAPP_API_TOKEN') || ''
      if (!expectedToken) {
        $app.logger().error('WHATSAPP_API_TOKEN secret is not configured')
        return e.json(500, { ok: false, error: 'Server authentication configuration missing' })
      }

      var authHeader =
        e.requestInfo().headers['authorization'] || e.requestInfo().headers['Authorization'] || ''
      var providedToken = ''
      if (authHeader.indexOf('Bearer ') === 0) {
        providedToken = authHeader.substring(7).trim()
      } else if (authHeader.indexOf('bearer ') === 0) {
        providedToken = authHeader.substring(7).trim()
      }

      if (!providedToken || providedToken !== expectedToken) {
        return e.json(401, { ok: false, error: 'Unauthorized: Invalid or missing token' })
      }

      // 2. Validate payload
      var body = e.requestInfo().body || {}
      var to = body.to ? String(body.to).trim() : ''
      var text = body.text != null ? String(body.text).trim() : ''

      if (!to || !text) {
        return e.json(400, {
          ok: false,
          error: 'Missing required fields: to and text are required',
        })
      }

      // Sanitize destination number
      var cleanNumber = to.replace(/[^0-9]/g, '')
      if (!cleanNumber) {
        return e.json(400, {
          ok: false,
          error: 'Invalid "to" phone number format',
        })
      }

      var remoteJid =
        cleanNumber.indexOf('@') !== -1 ? cleanNumber : cleanNumber + '@s.whatsapp.net'

      // 3. Find connected instance
      var instanceName = 'user_jgef0yk57capw1g'
      var instance
      try {
        instance = $app.findFirstRecordByData('whatsapp_instances', 'instance_name', instanceName)
      } catch (_) {
        $app.logger().error('Whatsapp instance record not found', 'instance_name', instanceName)
        return e.json(500, { ok: false, error: 'WhatsApp instance not found on server' })
      }

      var userId = instance.getString('user_id')

      // 4. Find or create contact
      var contact
      try {
        var records = $app.findRecordsByFilter(
          'whatsapp_contacts',
          'user_id = {:userId} && remote_jid = {:jid}',
          '-created',
          1,
          0,
          { userId: userId, jid: remoteJid },
        )
        if (records && records.length > 0) {
          contact = records[0]
        }
      } catch (_) {}

      if (!contact) {
        try {
          var contactsCol = $app.findCollectionByNameOrId('whatsapp_contacts')
          contact = new Record(contactsCol)
          contact.set('user_id', userId)
          contact.set('instance_id', instance.id)
          contact.set('remote_jid', remoteJid)
          contact.set('name', cleanNumber)
          contact.set('phone', cleanNumber)
          contact.set('last_message', text)
          contact.set('last_message_at', new Date().toISOString())
          $app.saveNoValidate(contact)
        } catch (cErr) {
          $app.logger().warn('Could not auto-create contact record', 'error', String(cErr))
        }
      } else {
        try {
          contact.set('last_message', text)
          contact.set('last_message_at', new Date().toISOString())
          $app.saveNoValidate(contact)
        } catch (_) {}
      }

      var contactId = contact ? contact.id : ''

      // 5. Send message via Evolution API
      var evoUrl = $secrets.get('EVOLUTION_API_URL') || $os.getenv('EVOLUTION_API_URL') || ''
      var evoKey = $secrets.get('EVOLUTION_API_KEY') || $os.getenv('EVOLUTION_API_KEY') || ''

      if (!evoUrl || !evoKey) {
        $app.logger().error('Evolution API credentials missing')
        return e.json(502, {
          ok: false,
          status: 'failed',
          error: 'Evolution API configuration missing on server',
        })
      }

      var evoUrlSanitized = evoUrl
      if (evoUrlSanitized.endsWith('/')) {
        evoUrlSanitized = evoUrlSanitized.slice(0, -1)
      }

      var evoRes
      try {
        evoRes = $http.send({
          url: evoUrlSanitized + '/message/sendText/' + instanceName,
          method: 'POST',
          headers: {
            apikey: evoKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: remoteJid,
            text: text,
            delay: 1200,
          }),
          timeout: 20,
        })
      } catch (netErr) {
        $app.logger().error('Evolution API HTTP send exception', 'error', String(netErr))
        return e.json(502, {
          ok: false,
          status: 'failed',
          error: 'Failed to communicate with Evolution API: ' + String(netErr),
        })
      }

      var evoOk = evoRes && (evoRes.statusCode === 200 || evoRes.statusCode === 201)
      if (!evoOk) {
        var rawBody = ''
        try {
          if (evoRes && evoRes.body) rawBody = new TextDecoder().decode(evoRes.body)
        } catch (_) {}

        $app
          .logger()
          .error(
            'Evolution API Send Failed',
            'instance',
            instanceName,
            'statusCode',
            evoRes ? evoRes.statusCode : 0,
            'response',
            evoRes && evoRes.json ? JSON.stringify(evoRes.json) : rawBody,
          )

        var evoErrMsg = 'Evolution API error (status ' + (evoRes ? evoRes.statusCode : 0) + ')'
        if (evoRes && evoRes.json && (evoRes.json.message || evoRes.json.error)) {
          evoErrMsg = evoRes.json.message || evoRes.json.error
        } else if (rawBody) {
          evoErrMsg = rawBody
        }

        return e.json(502, {
          ok: false,
          status: 'failed',
          error: evoErrMsg,
        })
      }

      // 6. Extract messageId
      var messageId = 'msg_' + $security.randomString(10)
      if (evoRes.json && evoRes.json.key && evoRes.json.key.id) {
        messageId = evoRes.json.key.id
      } else if (evoRes.json && evoRes.json.messageId) {
        messageId = evoRes.json.messageId
      }

      // 7. Register message in whatsapp_messages collection
      try {
        var msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
        var msgRecord = new Record(msgsCol)
        msgRecord.set('user_id', userId)
        msgRecord.set('instance_id', instance.id)
        if (contactId) {
          msgRecord.set('contact_id', contactId)
        }
        msgRecord.set('remote_jid', remoteJid)
        msgRecord.set('message_id', messageId)
        msgRecord.set('direction', 'out')
        msgRecord.set('body', text)
        msgRecord.set('type', 'text')
        msgRecord.set('caption', text)
        msgRecord.set('sent_at', new Date().toISOString())
        if (body.event) {
          msgRecord.set('automation_type', 'crm_' + String(body.event))
        }

        $app.saveNoValidate(msgRecord)
      } catch (saveErr) {
        $app.logger().error('Failed to save whatsapp_message record', 'error', String(saveErr))
      }

      return e.json(200, {
        ok: true,
        messageId: messageId,
        status: 'sent',
      })
    },
    $apis.bodyLimit(5 * 1024 * 1024),
  )
})
