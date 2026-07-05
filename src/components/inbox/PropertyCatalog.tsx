import { useEffect, useState } from 'react'
import { getProperties, type Property } from '@/services/properties'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BedDouble, Bath, BedSingle, Car, Send, MapPin, Search } from 'lucide-react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'

interface PropertyCatalogProps {
  onSendProperty: (property: Property) => void
  hasSelectedContact: boolean
}

const formatPrice = (value: number | null): string | null => {
  if (!value) return null
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  })
}

export function PropertyCatalog({ onSendProperty, hasSelectedContact }: PropertyCatalogProps) {
  const [properties, setProperties] = useState<Property[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await getProperties()
        if (!cancelled) setProperties(data)
      } catch (e) {
        console.error('Failed to fetch properties', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSend = (property: Property) => {
    setSendingId(property.id)
    onSendProperty(property)
    setTimeout(() => setSendingId(null), 2000)
  }

  const filteredProperties = properties.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-zinc-200/70 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-zinc-400 pointer-events-none" />
            <Input
              placeholder="Buscar por nome..."
              className="pl-9 h-9 bg-zinc-50/80 border-zinc-200/70 text-[13.5px] placeholder:text-zinc-400 focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-300"
              disabled
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden ring-1 ring-zinc-200/70">
                <Skeleton className="h-48 w-full rounded-none" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-3">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-zinc-200/70 bg-white shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-zinc-50/80 border-zinc-200/70 text-[13.5px] placeholder:text-zinc-400 focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-300"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filteredProperties.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
            <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
              <MapPin className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-700">Nenhum imóvel encontrado</p>
            <p className="text-xs text-zinc-500 mt-1">
              Os imóveis aparecerão aqui quando disponíveis
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {filteredProperties.map((property) => {
              const hasPhotos = property.photos && property.photos.length > 0
              return (
                <div
                  key={property.id}
                  className="rounded-xl overflow-hidden ring-1 ring-zinc-200/70 bg-white hover:ring-violet-200 transition-all duration-200 flex flex-col"
                >
                  {hasPhotos ? (
                    <Carousel className="w-full relative group">
                      <CarouselContent>
                        {property.photos.map((photo, idx) => (
                          <CarouselItem key={idx}>
                            <div className="relative h-48 bg-zinc-100">
                              <img
                                src={photo}
                                alt={`${property.title} - Foto ${idx + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.currentTarget
                                  target.style.display = 'none'
                                  const parent = target.parentElement
                                  if (parent) {
                                    parent.className =
                                      'h-48 bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center'
                                    parent.innerHTML =
                                      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-300"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>'
                                  }
                                }}
                              />
                            </div>
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      {property.photos.length > 1 && (
                        <>
                          <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 bg-white/80 hover:bg-white" />
                          <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 bg-white/80 hover:bg-white" />
                        </>
                      )}
                    </Carousel>
                  ) : (
                    <div className="h-48 bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
                      <MapPin className="h-8 w-8 text-zinc-300" />
                    </div>
                  )}

                  <div className="p-3 space-y-2">
                    <h3
                      className="text-sm font-semibold text-zinc-900 line-clamp-1"
                      title={property.title}
                    >
                      {property.title}
                    </h3>

                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {property.sale_price ? (
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                            Venda
                          </span>
                          <p className="text-sm font-bold text-emerald-600">
                            {formatPrice(property.sale_price)}
                          </p>
                        </div>
                      ) : null}
                      {property.rent_price ? (
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                            Locação
                          </span>
                          <p className="text-sm font-bold text-violet-600">
                            {formatPrice(property.rent_price)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {property.description && (
                      <p className="text-xs text-zinc-600 line-clamp-3 leading-relaxed">
                        {property.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 py-1">
                      {property.bedrooms > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <BedDouble className="h-3.5 w-3.5 text-zinc-400" />
                          {property.bedrooms}
                        </span>
                      )}
                      {property.bathrooms > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Bath className="h-3.5 w-3.5 text-zinc-400" />
                          {property.bathrooms}
                        </span>
                      )}
                      {property.suites > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <BedSingle className="h-3.5 w-3.5 text-zinc-400" />
                          {property.suites}
                        </span>
                      )}
                      {property.parking_spots > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Car className="h-3.5 w-3.5 text-zinc-400" />
                          {property.parking_spots}
                        </span>
                      )}
                    </div>

                    <Button
                      size="sm"
                      className="w-full h-8 text-xs font-medium bg-violet-600 hover:bg-violet-700"
                      onClick={() => handleSend(property)}
                      disabled={!hasSelectedContact || sendingId === property.id}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {sendingId === property.id ? 'Enviando...' : 'Enviar no chat'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
