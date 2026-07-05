import type { Property } from '@/services/properties'

export function formatPropertyMessage(property: Property): string {
  const lines: string[] = []
  lines.push(`*${property.name}*`)
  lines.push(
    `*Quartos: ${property.bedrooms} | Banheiros: ${property.bathrooms} | Suítes: ${property.suites} | Vagas: ${property.garage_spots}*`,
  )
  if (property.description) {
    lines.push(property.description)
  }
  return lines.join('\n')
}
