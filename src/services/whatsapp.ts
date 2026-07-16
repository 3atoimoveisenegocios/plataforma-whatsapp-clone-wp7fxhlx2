import pb from '@/lib/pocketbase/client'

export const getInstances = () =>
  pb.collection('whatsapp_instances').getFullList({ sort: '-created' })

export const getContacts = () =>
  pb.collection('whatsapp_contacts').getFullList({ sort: '-last_message_at' })

export const toggleContactAgent = (contactId: string, paused: boolean) =>
  pb.collection('whatsapp_contacts').update(contactId, { agent_paused: paused })

export const updateContactTags = (contactId: string, tags: string[]) =>
  pb.collection('whatsapp_contacts').update(contactId, { tags })

export const getMessages = (contactId: string) =>
  pb
    .collection('whatsapp_messages')
    .getFullList({ filter: `contact_id = '${contactId}'`, sort: 'sent_at' })

export const fetchInstanceQR = (instanceId: string) =>
  pb.send(`/backend/v1/instance/${instanceId}/qr`, { method: 'GET' })

export const sendMessage = (
  contactId: string,
  data: {
    text: string
    file?: File
    type?: string
    base64?: string
    instance_id?: string
    remote_jid?: string
  },
) => {
  const formData = new FormData()
  formData.append('contact_id', contactId)
  formData.append('text', data.text || '')
  formData.append('body', data.text || '')
  formData.append('type', data.type || 'text')

  if (data.instance_id) {
    formData.append('instance_id', data.instance_id)
  }
  if (data.remote_jid) {
    formData.append('remote_jid', data.remote_jid)
  }

  if (data.file) {
    formData.append('media_file', data.file)
    formData.append('file_name', data.file.name)
    formData.append('mime_type', data.file.type)
  }

  if (data.base64) {
    formData.append('media_base64', data.base64)
  }

  return pb.send(`/backend/v1/messages/send`, {
    method: 'POST',
    body: formData,
  })
}

export const logoutInstance = () => pb.send(`/backend/v1/instance/logout`, { method: 'POST' })

export const deleteContact = async (contactId: string) => {
  const messages = await pb
    .collection('whatsapp_messages')
    .getFullList({ filter: `contact_id = '${contactId}'` })
  await Promise.all(messages.map((m) => pb.collection('whatsapp_messages').delete(m.id)))
  await pb.collection('whatsapp_contacts').delete(contactId)
}
