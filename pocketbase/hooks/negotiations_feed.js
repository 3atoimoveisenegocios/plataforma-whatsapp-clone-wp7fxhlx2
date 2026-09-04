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

    var res = null
    var isInternalSkipDomain = portalUrl.indexOf('.internal.goskip.dev') !== -1

    try {
      // 1. For internal .internal.goskip.dev domains, attempt curl -k first to tolerate self-signed/internal certs
      if (isInternalSkipDomain) {
        try {
          var curlCmd = $os.cmd(
            'curl',
            '-k',
            '-s',
            '--max-time',
            '20',
            '-H',
            'Authorization: Bearer ' + portalToken,
            '-H',
            'Accept: application/json',
            '-w',
            '\n%{http_code}',
            targetUrl,
          )
          var outBytes = curlCmd.output()
          var rawOut = ''
          try {
            if (typeof toString === 'function') {
              rawOut = toString(outBytes)
            } else if (outBytes) {
              rawOut = new TextDecoder().decode(outBytes)
            }
          } catch (_) {
            rawOut = String(outBytes || '')
          }

          var lastNewline = rawOut.lastIndexOf('\n')
          var bodyStr = lastNewline !== -1 ? rawOut.substring(0, lastNewline) : rawOut
          var statusStr = lastNewline !== -1 ? rawOut.substring(lastNewline + 1).trim() : '200'
          var statusCode = parseInt(statusStr, 10) || 200

          var parsedJson = null
          try {
            parsedJson = JSON.parse(bodyStr)
          } catch (_) {}

          res = {
            statusCode: statusCode,
            json: parsedJson,
            raw: bodyStr,
          }
        } catch (curlErr) {
          $app
            .logger()
            .warn('curl command failed, falling back to $http.send', 'error', String(curlErr))
          res = null
        }
      }

      // 2. If curl wasn't used or failed, use $http.send
      if (!res) {
        res = $http.send({
          url: targetUrl,
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + portalToken,
            Accept: 'application/json',
          },
          timeout: 20,
        })
      }
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
    $app
      .logger()
      .info(
        'Negotiations feed successfully fetched from portal (200 OK)',
        'count',
        (data.negotiations ? data.negotiations.length : data.count) || 0,
      )
    return e.json(200, data)
  },
  $apis.requireAuth(),
)
