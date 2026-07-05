import pb from '@/lib/pocketbase/client'

export interface Property {
  id: string
  title: string
  sale_price: number | null
  rent_price: number | null
  description: string
  bedrooms: number
  bathrooms: number
  suites: number
  parking_spots: number
  photos: string[]
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
