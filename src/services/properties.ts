import pb from '@/lib/pocketbase/client'

export interface Property {
  id: string
  name: string
  description: string
  bedrooms: number
  bathrooms: number
  suites: number
  garage_spots: number
  images: string[]
  cover_image: string | null
  external_link: string
  sale_price?: number | null
  rent_price?: number | null
  source: 'local' | 'external'
}

let cachedProperties: Property[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60 * 1000

export const getProperties = async (): Promise<Property[]> => {
  const now = Date.now()
  if (cachedProperties && now - cacheTimestamp < CACHE_TTL) {
    return cachedProperties
  }

  const data = await pb.send('/backend/v1/properties', { method: 'GET' })
  cachedProperties = data
  cacheTimestamp = now
  return data
}

export const clearPropertiesCache = () => {
  cachedProperties = null
  cacheTimestamp = 0
}

export const refreshProperties = async (): Promise<Property[]> => {
  cachedProperties = null
  cacheTimestamp = 0
  const data = await pb.send('/backend/v1/properties', { method: 'GET' })
  cachedProperties = data
  cacheTimestamp = Date.now()
  return data
}

export const refreshProperties = async (): Promise<Property[]> => {
  cachedProperties = null
  cacheTimestamp = 0
  const data = await pb.send('/backend/v1/properties', { method: 'GET' })
  cachedProperties = data
  cacheTimestamp = Date.now()
  return data
}

export const refreshProperties = async (): Promise<Property[]> => {
  cachedProperties = null
  cacheTimestamp = 0
  const data = await pb.send('/backend/v1/properties', { method: 'GET' })
  cachedProperties = data
  cacheTimestamp = Date.now()
  return data
}
