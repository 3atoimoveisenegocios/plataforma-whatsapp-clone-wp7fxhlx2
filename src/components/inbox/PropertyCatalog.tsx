import { useEffect, useState, useMemo, useCallback, type SyntheticEvent } from 'react'
import { toast } from 'sonner'
import { getProperties, refreshProperties, type Property } from '@/services/properties'
import { useRealtime } from '@/hooks/use-realtime'
import { clearPropertiesCache } from '@/services/properties'
import {
  formatPropertyMessage,
  getPropertyImageUrl,
  getPropertyUrl,
  getYouTubeVideoId,
} from '@/lib/property-message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  BedDouble,
  Bath,
  BedSingle,
  Car,
  Send,
  MapPin,
  Search,
  RotateCw,
  Ruler,
  Maximize,
  Maximize2,
  Layers,
  Building2,
  Lock,
  Youtube,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContactSelector } from '@/components/inbox/ContactSelector'
import { sendMessage } from '@/services/whatsapp'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'

const PLACEHOLDER_IMAGE = 'https://img.usecurling.com/p/400/300?q=real%20estate%20house'
const PAGE_SIZE = 24

interface PropertyCatalogProps {
  onSendProperty: (property: Property, message: string, contactId?: string) => void
  hasSelectedContact?: boolean
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

export function PropertyCatalog({
  onSendProperty,
  hasSelectedContact = false,
}: PropertyCatalogProps) {
  const [properties, setProperties] = useState<Property[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedContact, setSelectedContact] = useState<any | null>(null)

  const loadProperties = useCallback(async () => {
    try {
      const data = await getProperties()
      setProperties(data)
    } catch (e) {
      console.error('Failed to fetch properties', e)
    } finally {
      setLoading(false)
    }
  }, [])

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

  useRealtime('properties', () => {
    clearPropertiesCache()
    loadProperties()
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const data = await refreshProperties()
      setProperties(data)
      setVisibleCount(PAGE_SIZE)
      toast.success('Lista de imóveis atualizada com sucesso!')
    } catch (err) {
      console.error('Failed to refresh properties', err)
      toast.error('Erro ao atualizar a lista de imóveis. Tente novamente.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleSend = async (property: Property) => {
    if (!selectedContact && !hasSelectedContact) {
      toast.error('Selecione um contato antes de enviar.')
      return
    }
    setSendingId(property.id)
    const message = formatPropertyMessage(property)
    if (selectedContact) {
      const imageUrl = getPropertyImageUrl(property)
      let file: File | undefined
      let base64: string | undefined

      if (imageUrl) {
        try {
          const response = await fetch(imageUrl)
          const blob = await response.blob()
          file = new File([blob], 'property-image.jpg', {
            type: blob.type || 'image/jpeg',
          })
          base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              resolve(result.split(',')[1])
            }
            reader.readAsDataURL(file!)
          })
        } catch (e) {
          console.error('Failed to fetch property image', e)
        }
      }

      try {
        await sendMessage(selectedContact.id, {
          text: message,
          file,
          type: file ? 'image' : 'text',
          base64,
          instance_id: selectedContact.instance_id,
          remote_jid: selectedContact.remote_jid,
        })
        toast.success('Imóvel enviado com sucesso!')
      } catch (e) {
        toast.error('Erro ao enviar imóvel. Tente novamente.')
      } finally {
        setTimeout(() => setSendingId(null), 2000)
      }
    } else {
      onSendProperty(property, message)
      setTimeout(() => setSendingId(null), 2000)
    }
  }

  const filteredProperties = useMemo(
    () => properties.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [properties, search],
  )

  const visibleProperties = useMemo(
    () => filteredProperties.slice(0, visibleCount),
    [filteredProperties, visibleCount],
  )

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search])

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-zinc-200/70 bg-white">
          <div className="mb-2">
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
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
        <div className="mb-2">
          <ContactSelector selectedContact={selectedContact} onSelect={setSelectedContact} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-zinc-50/80 border-zinc-200/70 text-[13.5px] placeholder:text-zinc-400 focus-visible:ring-violet-500/30 focus-visible:ring-offset-0 focus-visible:border-violet-300"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 text-[13px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-700"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RotateCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Atualizando...' : 'Atualizar Imóveis'}
          </Button>
          <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap shrink-0">
            {filteredProperties.length} imóveis
          </span>
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
            {visibleProperties.map((property) => {
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

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1">
                      {property.bedrooms > 0 && (
                        <span
                          className="flex items-center gap-1 text-[11px] text-zinc-600"
                          title="Quartos"
                        >
                          <BedDouble className="h-3.5 w-3.5 text-zinc-400" />
                          {property.bedrooms}
                        </span>
                      )}
                      {property.bathrooms > 0 && (
                        <span
                          className="flex items-center gap-1 text-[11px] text-zinc-600"
                          title="Banheiros"
                        >
                          <Bath className="h-3.5 w-3.5 text-zinc-400" />
                          {property.bathrooms}
                        </span>
                      )}
                      {property.suites > 0 && (
                        <span
                          className="flex items-center gap-1 text-[11px] text-zinc-600"
                          title="Suítes"
                        >
                          <BedSingle className="h-3.5 w-3.5 text-zinc-400" />
                          {property.suites}
                        </span>
                      )}
                      {property.garage_spots > 0 && (
                        <span
                          className="flex items-center gap-1 text-[11px] text-zinc-600"
                          title="Vagas"
                        >
                          <Car className="h-3.5 w-3.5 text-zinc-400" />
                          {property.garage_spots}
                        </span>
                      )}
                      {property.built_area != null && property.built_area > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Ruler className="h-3.5 w-3.5 text-zinc-400" />
                          {property.built_area} m²
                        </span>
                      )}
                      {property.land_area != null && property.land_area > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Maximize className="h-3.5 w-3.5 text-zinc-400" />
                          {property.land_area} m²
                        </span>
                      )}
                      {property.useful_area != null && property.useful_area > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Maximize2 className="h-3.5 w-3.5 text-zinc-400" />
                          {property.useful_area} m²
                        </span>
                      )}
                      {property.total_area != null && property.total_area > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Layers className="h-3.5 w-3.5 text-zinc-400" />
                          {property.total_area} m²
                        </span>
                      )}
                      {property.common_area != null && property.common_area > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                          {property.common_area} m²
                        </span>
                      )}
                      {property.private_area != null && property.private_area > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Lock className="h-3.5 w-3.5 text-zinc-400" />
                          {property.private_area} m²
                        </span>
                      )}
                    </div>

                    {(() => {
                      const priceSale = property.price_sale ?? property.sale_price
                      const priceRent = property.price_rent ?? property.rent_price
                      if (!priceSale && !priceRent) return null
                      return (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {priceRent ? (
                            <div>
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                                Locação
                              </span>
                              <p className="text-sm font-bold text-violet-600">
                                {formatPrice(priceRent)}
                              </p>
                            </div>
                          ) : null}
                          {priceSale ? (
                            <div>
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                                Venda
                              </span>
                              <p className="text-sm font-bold text-emerald-600">
                                {formatPrice(priceSale)}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })()}

                    <Button
                      size="sm"
                      className="w-full h-8 text-xs font-medium bg-violet-600 hover:bg-violet-700"
                      onClick={() => handleSend(property)}
                      disabled={
                        (!hasSelectedContact && !selectedContact) || sendingId === property.id
                      }
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {sendingId === property.id ? 'Enviando...' : 'Enviar no chat'}
                    </Button>
                    {(() => {
                      const url = getPropertyUrl(property)
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-8 flex items-center justify-center text-xs font-medium text-violet-600 hover:text-violet-700 border border-violet-200 rounded-md hover:bg-violet-50 transition-colors"
                        >
                          LINK DO IMÓVEL
                        </a>
                      ) : null
                    })()}
                    {property.youtube_link &&
                      (() => {
                        const videoId = getYouTubeVideoId(property.youtube_link)
                        if (videoId) {
                          return (
                            <a
                              href={property.youtube_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative block w-full h-32 rounded-lg overflow-hidden ring-1 ring-red-200 group/youtube"
                            >
                              <img
                                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                                alt="YouTube preview"
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/youtube:bg-black/40 transition-colors">
                                <div className="h-10 w-10 rounded-full bg-red-600 flex items-center justify-center group-hover/youtube:scale-110 transition-transform">
                                  <Youtube className="h-5 w-5 text-white" />
                                </div>
                              </div>
                              <span className="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/60 px-2 py-0.5 rounded">
                                Assistir Vídeo
                              </span>
                            </a>
                          )
                        }
                        return (
                          <a
                            href={property.youtube_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                          >
                            <Youtube className="h-3.5 w-3.5" />
                            ASSISTIR VÍDEO
                          </a>
                        )
                      })()}
                  </div>
                </div>
              )
            })}
            {visibleCount < filteredProperties.length && (
              <div className="pt-2 pb-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-[13px] font-medium border-zinc-200/70 hover:bg-zinc-50 hover:border-violet-300 text-zinc-700"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                >
                  Carregar mais imóveis
                  <span className="text-[11px] text-zinc-400 ml-1.5">
                    ({visibleCount} de {filteredProperties.length})
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
