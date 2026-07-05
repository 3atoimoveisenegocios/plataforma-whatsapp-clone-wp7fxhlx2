migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'romario@usecurling.com')
      return
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('romario@usecurling.com')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Admin')
    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'romario@usecurling.com')
      app.delete(record)
    } catch (_) {}
  },
)
