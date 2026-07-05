routerAdd(
  'POST',
  '/backend/v1/messages/send',
  (e) => {
    const body = e.requestInfo().body
    const contactId = body.contact_id
    const text = body.text || ''
    const type = body.type || 'text'
    const mediaBase64 = body.media_base64
    const mimeType = body.mime_type || 'application/octet-stream'
    const fileName = body.file_name || 'file'

    if (!contactId || (type === 'text' && !text)) throw new BadRequestError('Missing fields')

    let contact
    try {
      contact = $app.findRecordById('whatsapp_contacts', contactId)
    } catch (_) {
      throw new ForbiddenError('Access denied')
    }

    if (contact.getString('user_id') !== e.auth?.id) {
      throw new ForbiddenError('Access denied')
    }

    let instance
    try {
      instance = $app.findRecordById('whatsapp_instances', contact.getString('instance_id'))
    } catch (_) {
      throw new InternalServerError('Instance not found')
    }
    const instanceName = instance.getString('instance_name')

    const evoUrl = $secrets.get('EVOLUTION_API_URL')
    const evoKey = $secrets.get('EVOLUTION_API_KEY')

    let messageId = 'msg_' + $security.randomString(10)

    if (evoUrl && evoKey) {
      try {
        let evoUrlSanitized = evoUrl
        if (evoUrlSanitized.endsWith('/')) {
          evoUrlSanitized = evoUrlSanitized.slice(0, -1)
        }

        let res
        if (type === 'audio' && mediaBase64) {
          res = $http.send({
            url: evoUrlSanitized + '/message/sendWhatsAppAudio/' + instanceName,
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number: contact.getString('remote_jid'),
              audio: mediaBase64,
              delay: 1200,
              encoding: true,
            }),
            timeout: 60,
          })
        } else if (type !== 'text' && mediaBase64) {
          res = $http.send({
            url: evoUrlSanitized + '/message/sendMedia/' + instanceName,
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number: contact.getString('remote_jid'),
              mediatype: type,
              mimetype: mimeType,
              caption: text,
              media: mediaBase64,
              fileName: fileName,
              delay: 1200,
            }),
            timeout: 60,
          })
        } else {
          res = $http.send({
            url: evoUrlSanitized + '/message/sendText/' + instanceName,
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number: contact.getString('remote_jid'),
              text: text,
              delay: 1200,
            }),
            timeout: 15,
          })
        }

        if (res.statusCode === 200 || res.statusCode === 201) {
          if (res.json && res.json.key && res.json.key.id) {
            messageId = res.json.key.id
          } else if (res.json && res.json.messageId) {
            messageId = res.json.messageId
          }
        } else {
          let rawBody = ''
          try {
            if (res.body) rawBody = new TextDecoder().decode(res.body)
          } catch (_) {}

          $app
            .logger()
            .error(
              'Evolution API Send Failed',
              'instance',
              instanceName,
              'statusCode',
              res.statusCode,
              'response',
              res.json ? JSON.stringify(res.json) : rawBody,
            )

          throw new InternalServerError('Evolution API Error')
        }
      } catch (err) {
        if (err instanceof InternalServerError) {
          throw err
        }
        $app.logger().error('Evolution API Send Exception', 'error', String(err))
        throw new InternalServerError('Evolution API Error')
      }
    }

    const msgsCol = $app.findCollectionByNameOrId('whatsapp_messages')
    const msgRecord = new Record(msgsCol)
    msgRecord.set('user_id', e.auth.id)
    msgRecord.set('instance_id', instance.id)
    msgRecord.set('contact_id', contact.id)
    msgRecord.set('remote_jid', contact.getString('remote_jid'))
    msgRecord.set('message_id', messageId)
    msgRecord.set('direction', 'out')
    msgRecord.set('body', text)
    msgRecord.set('type', type)
    msgRecord.set('mime_type', mimeType)
    msgRecord.set('file_name', fileName)
    msgRecord.set('caption', text)
    msgRecord.set('sent_at', new Date().toISOString())

    try {
      const files = e.findUploadedFiles('media_file')
      if (files && files.length > 0) {
        msgRecord.set('media_file', files[0])
      }
    } catch (_) {
      // Request was not multipart/form-data (text-only message). Safe to ignore.
    }

    // Skip validation to allow files larger than 5MB default
    $app.saveNoValidate(msgRecord)

    let lastMsgPreview = text
    if (type === 'image') lastMsgPreview = '📷 Foto'
    else if (type === 'video') lastMsgPreview = '🎥 Vídeo'
    else if (type === 'audio') lastMsgPreview = '🎵 Áudio'
    else if (type === 'document') lastMsgPreview = '📄 Documento'

    contact.set('last_message', lastMsgPreview)
    contact.set('last_message_at', new Date().toISOString())
    $app.saveNoValidate(contact)

    return e.json(200, { success: true, message: msgRecord })
  },
  $apis.requireAuth(),
  $apis.bodyLimit(100 * 1024 * 1024),
)
