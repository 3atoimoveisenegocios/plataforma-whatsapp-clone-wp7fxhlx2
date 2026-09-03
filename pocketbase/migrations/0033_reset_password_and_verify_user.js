migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', '3atoimoveis@gmail.com')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      app.save(record)
    } catch (err) {
      // If user does not exist, create it
      const record = new Record(users)
      record.setEmail('3atoimoveis@gmail.com')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', '3° ATO IMÓVEIS E NEGÓCIOS')
      app.save(record)
    }
  },
  (app) => {
    // down migration
  },
)
