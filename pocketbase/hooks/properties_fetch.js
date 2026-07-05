routerAdd(
  'GET',
  '/backend/v1/properties',
  (e) => {
    var localBaseUrl = $secrets.get('PB_INSTANCE_URL') || ''
    if (localBaseUrl.endsWith('/')) localBaseUrl = localBaseUrl.slice(0, -1)

    var externalBaseUrl = 'https://site-imobiliario-completo-3ecff.shrd00.internal.goskip.dev'
    var externalUrl = externalBaseUrl + '/api/collections/properties/records'

    var allProperties = []
    var seenKeys = {}

    var dedupKey = function (id, name) {
      var key = (name || '').toLowerCase().trim()
      if (key) return 'name_' + key
      return 'id_' + (id || '')
    }

    var parseNumber = function (val) {
      if (val == null) return null
      if (typeof val === 'number') return isNaN(val) ? null : val
      var str = String(val).trim()
      if (!str) return null
      str = str.replace(/[^\d,.\-]/g, '')
      if (str.indexOf(',') !== -1 && str.indexOf('.') !== -1) {
        str = str.replace(/\./g, '').replace(',', '.')
      } else if (str.indexOf(',') !== -1) {
        str = str.replace(',', '.')
      }
      var num = Number(str)
      return isNaN(num) ? null : num
    }

    var getFirstDefined = function (obj, keys) {
      for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]]
        if (v != null && v !== '') return v
      }
      return undefined
    }

    // --- 1. Fetch from local properties collection ---
    try {
      var userId = e.auth ? e.auth.id : ''
      if (userId) {
        var localRecords = $app.findRecordsByFilter(
          'properties',
          'user_id = "' + userId + '"',
          '-created',
          500,
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

          var dKey = dedupKey(record.id, record.getString('name'))
          if (seenKeys[dKey]) continue
          seenKeys[dKey] = true

          allProperties.push({
            id: record.id,
            name: record.getString('name') || 'Imóvel',
            description: record.getString('description') || '',
            bedrooms: Number(record.get('bedrooms')) || 0,
            bathrooms: Number(record.get('bathrooms')) || 0,
            suites: Number(record.get('suites')) || 0,
            garage_spots: Number(record.get('garage_spots')) || 0,
            built_area: parseNumber(record.get('built_area')),
            land_area: parseNumber(record.get('land_area')),
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

    // --- 2. Fetch from external API (paginated, perPage=200) ---
    var page = 1
    var totalPages = 1
    var maxPages = 10

    while (page <= totalPages && page <= maxPages) {
      var res
      try {
        res = $http.send({
          url: externalUrl + '?perPage=200&page=' + page,
          method: 'GET',
          timeout: 15,
        })
      } catch (err) {
        $app.logger().error('Properties fetch exception', 'error', String(err), 'page', page)
        break
      }

      if (res.statusCode !== 200) {
        $app.logger().error('Properties fetch failed', 'statusCode', res.statusCode, 'page', page)
        break
      }

      var data = res.json
      if (!data) break

      var items = []
      if (Array.isArray(data)) {
        items = data
      } else if (data.items && Array.isArray(data.items)) {
        items = data.items
      }

      if (data.totalPages) {
        totalPages = data.totalPages
      } else if (data.totalPages === 0) {
        totalPages = 1
      }

      if (page === 1) {
        $app
          .logger()
          .info('External properties fetched', 'count', items.length, 'totalPages', totalPages)
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

        var itemName = item.name || item.title || item.headline || 'Imóvel'
        var extDKey = dedupKey(item.id, itemName)
        if (seenKeys[extDKey]) continue
        seenKeys[extDKey] = true

        allProperties.push({
          id: item.id || '',
          name: itemName,
          description: item.description || '',
          bedrooms: Number(item.bedrooms) || 0,
          bathrooms: Number(item.bathrooms) || 0,
          suites: Number(item.suites) || 0,
          garage_spots: Number(item.garage_spots || item.parking_spots) || 0,
          built_area: parseNumber(
            getFirstDefined(item, [
              'built_area',
              'constructed_area',
              'builtArea',
              'area_construida',
              'areaConstruida',
              'Área Construída (m²)',
              'Área Construída',
            ]),
          ),
          land_area: parseNumber(
            getFirstDefined(item, [
              'land_area',
              'total_area',
              'landArea',
              'area_terreno',
              'areaTerreno',
              'Área do Terreno (m²)',
              'Área do Terreno',
            ]),
          ),
          images: photoUrls,
          cover_image: extCoverImage,
          external_link: item.external_link || item.link || item.url || '',
          sale_price: item.sale_price || null,
          rent_price: item.rent_price || null,
          source: 'external',
        })
      }

      page++
    }

    $app.logger().info('Total properties after merge', 'count', allProperties.length)
    return e.json(200, allProperties)
  },
  $apis.requireAuth(),
)
