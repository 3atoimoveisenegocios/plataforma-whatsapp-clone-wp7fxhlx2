import type { Property } from '@/services/properties'

export function getYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?#\s]{11})/,
  )
  return match ? match[1] : null
}

export function getPropertyUrl(property: Property): string | null {
  if (property.slug) {
    const baseUrl = import.meta.env.VITE_PROPERTY_BASE_URL || 'https://iris.3atoimoveis.com.br'
    return `${baseUrl}/imovel/${property.slug}`
  }
  if (property.external_link) return property.external_link
  return null
}

export function getPropertyImageUrl(property: Property): string | null {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL

  if (property.cover_image) {
    if (property.cover_image.startsWith('http')) {
      return property.cover_image
    }
    return `${baseUrl}/api/files/properties/${property.id}/${property.cover_image}`
  }

  if (property.images && property.images.length > 0) {
    const firstImage = property.images[0]
    if (firstImage.startsWith('http')) {
      return firstImage
    }
    return `${baseUrl}/api/files/properties/${property.id}/${firstImage}`
  }

  return null
}

export function formatPropertyMessage(property: Property): string {
  const lines: string[] = []

  if (property.name) {
    lines.push(`*${property.name}*`)
  }

  const details: string[] = []
  if (property.bedrooms != null && property.bedrooms > 0) {
    details.push(`Quartos: ${property.bedrooms}`)
  }
  if (property.bathrooms != null && property.bathrooms > 0) {
    details.push(`Banheiros: ${property.bathrooms}`)
  }
  if (property.suites != null && property.suites > 0) {
    details.push(`Suítes: ${property.suites}`)
  }
  if (property.garage_spots != null && property.garage_spots > 0) {
    details.push(`Vagas: ${property.garage_spots}`)
  }
  if (property.built_area != null && property.built_area > 0) {
    details.push(`Área Construída: ${property.built_area} m²`)
  }
  if (property.land_area != null && property.land_area > 0) {
    details.push(`Área do Terreno: ${property.land_area} m²`)
  }
  if (property.useful_area != null && property.useful_area > 0) {
    details.push(`Área Útil: ${property.useful_area} m²`)
  }
  if (property.total_area != null && property.total_area > 0) {
    details.push(`Área Total: ${property.total_area} m²`)
  }
  if (property.common_area != null && property.common_area > 0) {
    details.push(`Área Comum: ${property.common_area} m²`)
  }
  if (property.private_area != null && property.private_area > 0) {
    details.push(`Área Privada: ${property.private_area} m²`)
  }

  const priceSale = property.price_sale ?? property.sale_price
  const priceRent = property.price_rent ?? property.rent_price

  if (priceRent != null && priceRent > 0) {
    const formatted = Number(priceRent).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    })
    details.push(`Valor de Locação: ${formatted}`)
  }

  if (priceSale != null && priceSale > 0) {
    const formatted = Number(priceSale).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    })
    details.push(`Valor de Venda: ${formatted}`)
  }

  if (details.length > 0) {
    lines.push(`*${details.join(' | ')}*`)
  }

  const propertyUrl = getPropertyUrl(property)
  if (propertyUrl) {
    lines.push(`LINK DO IMÓVEL: ${propertyUrl}`)
  }

  if (property.youtube_link) {
    lines.push(`VÍDEO: ${property.youtube_link}`)
  }

  return lines.join('\n')
}
