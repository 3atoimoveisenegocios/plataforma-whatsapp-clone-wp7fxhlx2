routerAdd(
  'GET',
  '/backend/v1/properties',
  (e) => {
    var localBaseUrl = $secrets.get('PB_INSTANCE_URL') || ''
    if (localBaseUrl.endsWith('/')) localBaseUrl = localBaseUrl.slice(0, -1)

    var externalBaseUrl = 'https://site-imobiliario-completo-3ecff.shrd00.internal.goskip.dev'
    var externalUrl = externalBaseUrl + '/api/collections/properties/records'

    var allProperties = []

    // --- 1. Fetch from local properties collection ---
    try {
      var userId = e.auth ? e.auth.id : ''
      if (userId) {
        var localRecords = $app.findRecordsByFilter(
          'properties',
          'user_id = "' + userId + '"',
          '-created',
          100,
          0,
        )
        $app.logger().info('Local properties fetched', 'count', localRecords.length)

        for (var i = 0; i < localRecords.length; i++) {
          var record = localRecords[i]

          var imagesRaw = record.get('images')
          var imageFiles = []
          if (Array.isArray(imagesRaw)) {
            imageFiles = imagesRaw
          } else if (typeof imagesRaw === 'string' && imagesRaw) {
            try {
              var parsed = JSON.parse(imagesRaw)
              if (Array.isArray(parsed)) imageFiles = parsed
            } catch (_) {}
          }

          var imageUrls = []
          for (var j = 0; j < imageFiles.length; j++) {
            if (typeof imageFiles[j] === 'string' && imageFiles[j]) {
              imageUrls.push(
                localBaseUrl + '/api/files/properties/' + record.id + '/' + imageFiles[j],
              )
            }
          }

          var coverImage = record.getString('cover_image')
          var coverImageUrl = null
          if (coverImage) {
            if (coverImage.indexOf('http') === 0) {
              coverImageUrl = coverImage
            } else {
              coverImageUrl = localBaseUrl + '/api/files/properties/' + record.id + '/' + coverImage
            }
          }

          $app
            .logger()
            .info(
              'Local property mapped',
              'id',
              record.id,
              'imagesCount',
              imageUrls.length,
              'hasCoverImage',
              coverImageUrl !== null,
            )

          allProperties.push({
            id: record.id,
            name: record.getString('name') || 'Imóvel',
            description: record.getString('description') || '',
            bedrooms: Number(record.get('bedrooms')) || 0,
            bathrooms: Number(record.get('bathrooms')) || 0,
            suites: Number(record.get('suites')) || 0,
            garage_spots: Number(record.get('garage_spots')) || 0,
            images: imageUrls,
            cover_image: coverImageUrl,
            external_link: record.getString('external_link') || '',
            source: 'local',
          })
        }
      }
    } catch (err) {
      $app.logger().error('Local properties fetch failed', 'error', String(err))
    }

    // --- 2. Fetch from external API ---
    var res
    try {
      res = $http.send({
        url: externalUrl,
        method: 'GET',
        timeout: 15,
      })
    } catch (err) {
      $app.logger().error('Properties fetch exception', 'error', String(err))
      return e.json(200, allProperties)
    }

    if (res.statusCode !== 200) {
      $app.logger().error('Properties fetch failed', 'statusCode', res.statusCode)
      return e.json(200, allProperties)
    }

    var data = res.json
    if (!data) {
      return e.json(200, allProperties)
    }

    var items = []
    if (Array.isArray(data)) {
      items = data
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items
    }

    // Debug logs for external API data structure
    $app.logger().info('External properties fetched', 'count', items.length)
    if (items.length > 0) {
      var sample = items[0]
      var sampleImages = sample.images || sample.photos || sample.pictures || []
      $app
        .logger()
        .info(
          'External property sample structure',
          'hasImagesArray',
          Array.isArray(sample.images),
          'imagesArrayLength',
          Array.isArray(sample.images) ? sample.images.length : 0,
          'hasCoverImage',
          typeof sample.cover_image === 'string' && sample.cover_image !== '',
          'coverImageValue',
          sample.cover_image || '',
          'sampleKeys',
          Object.keys(sample).join(','),
        )
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i]

      var photoUrls = []
      var rawPhotos = item.images || item.photos || item.pictures || []
      if (typeof rawPhotos === 'string') rawPhotos = [rawPhotos]

      if (Array.isArray(rawPhotos)) {
        for (var j = 0; j < rawPhotos.length; j++) {
          var p = rawPhotos[j]
          if (typeof p !== 'string') continue
          if (p.indexOf('http') === 0) {
            photoUrls.push(p)
          } else {
            photoUrls.push(
              externalBaseUrl + '/api/files/' + item.collectionId + '/' + item.id + '/' + p,
            )
          }
        }
      }

      // Check for cover_image in external data
      var extCoverImage = null
      if (item.cover_image) {
        if (typeof item.cover_image === 'string' && item.cover_image.indexOf('http') === 0) {
          extCoverImage = item.cover_image
        } else if (typeof item.cover_image === 'string') {
          extCoverImage =
            externalBaseUrl +
            '/api/files/' +
            item.collectionId +
            '/' +
            item.id +
            '/' +
            item.cover_image
        }
      }

      $app
        .logger()
        .info(
          'External property mapped',
          'id',
          item.id || '',
          'imagesCount',
          photoUrls.length,
          'hasCoverImage',
          extCoverImage !== null,
        )

      allProperties.push({
        id: item.id || '',
        name: item.name || item.title || item.headline || 'Imóvel',
        description: item.description || '',
        bedrooms: Number(item.bedrooms) || 0,
        bathrooms: Number(item.bathrooms) || 0,
        suites: Number(item.suites) || 0,
        garage_spots: Number(item.garage_spots || item.parking_spots) || 0,
        images: photoUrls,
        cover_image: extCoverImage,
        external_link: item.external_link || item.link || item.url || '',
        sale_price: item.sale_price || null,
        rent_price: item.rent_price || null,
        source: 'external',
      })
    }

    return e.json(200, allProperties)
  },
  $apis.requireAuth(),
)
