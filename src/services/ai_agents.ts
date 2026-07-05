import pb from '@/lib/pocketbase/client'

export const getAiAgents = () =>
  pb.collection('ai_agents').getFullList({ expand: 'instance_id', sort: '-created' })

export const getAiAgent = (id: string) =>
  pb.collection('ai_agents').getOne(id, { expand: 'instance_id' })

export const createAiAgent = (data: any) => pb.collection('ai_agents').create(data)

export const updateAiAgent = (id: string, data: any) => pb.collection('ai_agents').update(id, data)

export const deleteAiAgent = (id: string) => pb.collection('ai_agents').delete(id)
