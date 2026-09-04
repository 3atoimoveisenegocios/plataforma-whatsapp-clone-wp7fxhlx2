routerAdd(
  'GET',
  '/backend/v1/negotiations/feed',
  (e) => {
    var portalUrl = $secrets.get('PORTAL_API_URL') || $os.getenv('PORTAL_API_URL') || ''
    var portalToken = $secrets.get('PORTAL_API_TOKEN') || $os.getenv('PORTAL_API_TOKEN') || ''

    if (!portalUrl) {
      portalUrl = 'https://portal-do-cliente-imobiliario-904e4.shrd00.internal.goskip.dev'
    }
    if (portalUrl.endsWith('/')) {
      portalUrl = portalUrl.slice(0, -1)
    }

    if (!portalToken) {
      $app.logger().error('PORTAL_API_TOKEN secret is not configured')
      return e.json(500, { ok: false, error: 'Configuração de autenticação do portal ausente' })
    }

    // Get optional query params: broker and since
    var broker = e.requestInfo().query['broker'] || ''
    var since = e.requestInfo().query['since'] || ''

    var queryParts = []
    if (broker) {
      queryParts.push('broker=' + encodeURIComponent(broker))
    }
    if (since) {
      queryParts.push('since=' + encodeURIComponent(since))
    }

    var queryString = queryParts.length > 0 ? '?' + queryParts.join('&') : ''
    var targetUrl = portalUrl + '/api/custom/v1/negotiations/feed' + queryString

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
          Authorization: 'Bearer ' + portalToken,
          Accept: 'application/json',
        },
        timeout: 20,
      })
    } catch (netErr) {
      $app.logger().error('Negotiations feed HTTP error', 'error', String(netErr))
      return e.json(502, {
        ok: false,
        error: 'Falha de comunicação com o portal externo: ' + String(netErr),
      })
    }

    if (!res) {
      return e.json(502, { ok: false, error: 'Resposta vazia do portal externo' })
    }

    if (res.statusCode !== 200) {
      $app.logger().error('Negotiations feed returned non-200', 'statusCode', res.statusCode)
      var errMsg = 'Erro retornado pelo portal (' + res.statusCode + ')'
      if (res.json && res.json.error) {
        errMsg = res.json.error
      }
      return e.json(res.statusCode, { ok: false, error: errMsg })
    }

    var data = res.json || {}
    return e.json(200, data)
  },
  $apis.requireAuth(),
)
