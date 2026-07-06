import pb from '@/lib/pocketbase/client'

export const getContacts = (userId: string) =>
  pb.collection('whatsapp_contacts').getFullList({
    filter: `user_id = "${userId}"`,
    sort: '-updated',
  })

export const updateContactStatus = (contactId: string, status: string) =>
  pb.collection('whatsapp_contacts').update(contactId, { status })
