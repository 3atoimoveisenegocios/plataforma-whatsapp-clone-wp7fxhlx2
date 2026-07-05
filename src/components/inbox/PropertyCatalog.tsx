import { useEffect, useState, type SyntheticEvent } from 'react'
import { toast } from 'sonner'
import { getProperties, refreshProperties, type Property } from '@/services/properties'
import { formatPropertyMessage } from '@/lib/property-message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BedDouble, Bath, BedSingle, Car, Send, MapPin, Search, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'

const PLACEHOLDER_IMAGE = 'https://img.usecurling.com/p/400/300?q=real%20estate%20house'

interface PropertyCatalogProps {
  onSendProperty: (property: Property, message: string) => void
  hasSelectedContact: boolean
}

const formatPrice = (value: number | null | undefined): string | null => {
  if (!value) return null
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  })
}

function getEffectiveImages(property: Property): string[] {
  if (property.images.length > 0) return property.images
  if (property.cover_image) return [property.cover_image]
  return []
}

function handleImageError(
  e: SyntheticEvent<HTMLImageElement>,
  property: Property,
  effectiveImages: string[],
) {
  const target = e.currentTarget
  const coverInList = property.cover_image && effectiveImages.includes(property.cover_image)

  if (property.cover_image && !coverInList && target.dataset.triedCover !== 'true') {
    target.src = property.cover_image
    target.dataset.triedCover = 'true'
  } else {
    target.src = PLACEHOLDER_IMAGE
  }
}

export function PropertyCatalog({ onSendProperty, hasSelectedContact }: PropertyCatalogProps) {
  const [properties, setProperties] = useState<Property[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const data = await refreshProperties()
      setProperties(data)
      toast.success('Lista de imóveis atualizada com sucesso!')
    } catch (err) {
      console.error('Failed to refresh properties', err)
      toast.error('Erro ao atualizar a lista de imóveis. Tente novamente.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleSend = (property: Property) => {
    setSendingId(property.id)
    onSendProperty(property, formatPropertyMessage(property))
    setTimeout(() => setSendingId(null), 2000)
  }

  const filteredProperties = properties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
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
          <div className="px-5 pb-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-[13px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-700"
              disabled
            >
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />
              Atualizar Imóveis
            </Button>
          </div>
        </ScrollArea className="flex-1">
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
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 mt-2 text-[13px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-700"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RotateCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
          {refreshing ? 'Atualizando...' : 'Atualizar Imóveis'}
        </Button>
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
              const effectiveImages = getEffectiveImages(property)
              const hasImages = effectiveImages.length > 0
              return (
                <div
                  key={property.id}
                  className="rounded-xl overflow-hidden ring-1 ring-zinc-200/70 bg-white hover:ring-violet-200 transition-all duration-200 flex flex-col"
                >
                  {hasImages ? (
                    <Carousel className="w-full relative group">
                      <CarouselContent>
                        {effectiveImages.map((photo, idx) => (
                          <CarouselItem key={idx}>
                            <div className="relative h-48 bg-zinc-100">
                              <img
                                src={photo}
                                alt={`${property.name} - Foto ${idx + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => handleImageError(e, property, effectiveImages)}
                              />
                            </div>
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      {effectiveImages.length > 1 && (
                        <>
                          <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 bg-white/80 hover:bg-white" />
                          <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 bg-white/80 hover:bg-white" />
                        </>
                      )}
                    </Carousel>
                  ) : (
                    <div className="h-48 bg-zinc-100 flex items-center justify-center overflow-hidden">
                      <img
                        src={PLACEHOLDER_IMAGE}
                        alt={property.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-3 space-y-2">
                    <h3
                      className="text-sm font-semibold text-zinc-900 line-clamp-1"
                      title={property.name}
                    >
                      {property.name}
                    </h3>

                    {(property.sale_price || property.rent_price) && (
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
                    )}

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
                      {property.garage_spots > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Car className="h-3.5 w-3.5 text-zinc-400" />
                          {property.garage_spots}
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
