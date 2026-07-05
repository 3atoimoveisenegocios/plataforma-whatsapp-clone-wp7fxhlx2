routerAdd(
  'GET',
  '/backend/v1/properties',
  (e) => {
    const externalBaseUrl = 'https://site-imobiliario-completo-3ecff.shrd00.internal.goskip.dev'
    const externalUrl = externalBaseUrl + '/api/collections/properties/records'

    let res
    try {
      res = $http.send({
        url: externalUrl,
        method: 'GET',
        timeout: 15,
      })
    } catch (err) {
      $app.logger().error('Properties fetch exception', 'error', String(err))
      return e.internalServerError('Failed to fetch properties')
    }

    if (res.statusCode !== 200) {
      $app.logger().error('Properties fetch failed', 'statusCode', res.statusCode)
      return e.internalServerError('Failed to fetch properties')
    }

    let data = res.json
    if (!data) {
      return e.json(200, [])
    }

    let items = []
    if (Array.isArray(data)) {
      items = data
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items
    }

    let properties = []
    for (let i = 0; i < items.length; i++) {
      var item = items[i]

      var photoUrls = []
      var rawPhotos = item.photos || item.images || item.pictures || []
      if (typeof rawPhotos === 'string') rawPhotos = [rawPhotos]

      if (Array.isArray(rawPhotos)) {
        for (var j = 0; j < rawPhotos.length; j++) {
          var p = rawPhotos[j]
          if (typeof p !== 'string') continue
          if (p.startsWith('http')) {
            photoUrls.push(p)
          } else {
            photoUrls.push(
              externalBaseUrl + '/api/files/' + item.collectionId + '/' + item.id + '/' + p,
            )
          }
        }
      }

      properties.push({
        id: item.id || '',
        title: item.title || item.headline || item.name || 'Imóvel',
        sale_price: item.sale_price || null,
        rent_price: item.rent_price || null,
        description: item.description || '',
        bedrooms: item.bedrooms || 0,
        bathrooms: item.bathrooms || 0,
        suites: item.suites || 0,
        parking_spots: item.parking_spots || 0,
        photos: photoUrls,
        link: item.link || item.url || '',
      })
    }

    return e.json(200, properties)
  },
  $apis.requireAuth(),
)
