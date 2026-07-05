routerAdd(
  'GET',
  '/backend/v1/instance/{id}/qr',
  (e) => {
    const id = e.request.pathValue('id')
    let instance
    try {
      instance = $app.findRecordById('whatsapp_instances', id)
    } catch (_) {
      return e.notFoundError('Instance not found')
    }

    if (instance.getString('user_id') !== e.auth?.id) {
      return e.forbiddenError('Access denied')
    }

    let evoUrl = $secrets.get('EVOLUTION_API_URL')
    const evoKey = $secrets.get('EVOLUTION_API_KEY')
    const instanceName = instance.getString('instance_name')

    if (!evoUrl || !evoKey) {
      return e.internalServerError('Evolution API configuration missing')
    }

    if (evoUrl.endsWith('/')) {
      evoUrl = evoUrl.slice(0, -1)
    }

    try {
      const res = $http.send({
        url: evoUrl + '/instance/connect/' + instanceName,
        method: 'GET',
        headers: { apikey: evoKey },
        timeout: 15,
      })

      if (res.statusCode === 200 && res.json) {
        if (res.json.base64) {
          instance.set('qrcode', res.json.base64)
          instance.set('status', 'connecting')
        } else if (res.json.instance?.state === 'open') {
          instance.set('status', 'connected')
        }
        $app.saveNoValidate(instance)
      }
    } catch (err) {
      $app.logger().error('Evolution QR Error', 'error', String(err))
    }

    return e.json(200, {
      status: instance.getString('status'),
      qrcode: instance.getString('qrcode'),
    })
  },
  $apis.requireAuth(),
)
