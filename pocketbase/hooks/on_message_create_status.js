onRecordAfterCreateSuccess((e) => {
  if (e.record.getString('direction') === 'in') {
    const contactId = e.record.get('contact_id')
    if (contactId) {
      try {
        const contact = $app.findRecordById('whatsapp_contacts', contactId)
        contact.set('status', 'em_conversa')
        let skipLastMessage = false
        try {
          const freshMsg = $app.findRecordById('whatsapp_messages', e.record.id)
          if (freshMsg.getBool('greeting_sent')) skipLastMessage = true
        } catch (_) {}
        if (!skipLastMessage) {
          contact.set('last_message_at', new Date().toISOString().replace('T', ' '))
          contact.set('last_message', e.record.getString('body'))
        }
        $app.saveNoValidate(contact)
      } catch (err) {
        $app.logger().error('Failed to update contact status', 'error', err.toString())
      }
    }
  }
  e.next()
}, 'whatsapp_messages')
