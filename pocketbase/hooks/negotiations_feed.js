routerAdd(
  'GET',
  '/backend/v1/negotiations/feed',
  (e) => {
    var token = $secrets.get('PORTAL_API_TOKEN') || ''
    var base = $secrets.get('PORTAL_API_URL') || ''

    if (!token || !base) {
      $app
        .logger()
        .error('Portal API secrets not configured', 'hasToken', !!token, 'hasBase', !!base)
      return e.json(500, { ok: false, error: 'Portal API secrets not configured' })
    }

    if (base.endsWith('/')) {
      base = base.slice(0, -1)
    }

    var targetUrl = base + '/api/custom/v1/negotiations/feed'

    var broker = ''
    var since = ''
    try {
      var reqInfo = e.requestInfo()
      if (reqInfo && reqInfo.query) {
        broker = reqInfo.query['broker'] || ''
        since = reqInfo.query['since'] || ''
      }
    } catch (_) {
      try {
        if (e.request && e.request.url && e.request.url.query) {
          broker = e.request.url.query().get('broker') || ''
          since = e.request.url.query().get('since') || ''
        }
      } catch (_) {}
    }

    var queryParts = []
    if (broker) {
      queryParts.push('broker=' + broker)
    }
    if (since) {
      queryParts.push('since=' + since)
    }

    if (queryParts.length > 0) {
      targetUrl = targetUrl + '?' + queryParts.join('&')
    }

    $app
      .logger()
      .info(
        'Fetching negotiations feed from portal',
        'url',
        targetUrl,
        'broker',
        broker,
        'since',
        since,
      )

    var res
    try {
      res = $http.send({
        url: targetUrl,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
        },
        timeout: 20,
      })
    } catch (netErr) {
      $app.logger().error('Negotiations feed HTTP send exception', 'error', String(netErr))
      return e.json(502, {
        ok: false,
        error: 'Failed to communicate with portal: ' + String(netErr),
      })
    }

    if (res.statusCode !== 200) {
      $app
        .logger()
        .error(
          'negotiations_feed: portal responded with status ' + res.statusCode,
          'statusCode',
          res.statusCode,
        )
      var errMsg = 'Portal responded with status ' + res.statusCode
      if (res.json && (res.json.error || res.json.message)) {
        errMsg = res.json.error || res.json.message
      }
      return e.json(res.statusCode, { ok: false, error: errMsg })
    }

    $app.logger().info('Negotiations feed successfully fetched from portal (200 OK)')
    return e.json(200, res.json)
  },
  $apis.requireAuth(),
)
