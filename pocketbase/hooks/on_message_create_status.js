onRecordAfterCreateSuccess((e) => {
  if (e.record.getString('direction') === 'in') {
    const contactId = e.record.get('contact_id')
    if (contactId) {
      try {
        const contact = $app.findRecordById('whatsapp_contacts', contactId)
        contact.set('status', 'in_conversation')
        contact.set('last_message_at', new Date().toISOString().replace('T', ' '))
        contact.set('last_message', e.record.getString('body'))
        $app.save(contact)
      } catch (err) {
        $app.logger().error('Failed to update contact status', 'error', err.toString())
      }
    }
  }
  e.next()
}, 'whatsapp_messages')
