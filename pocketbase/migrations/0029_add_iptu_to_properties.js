migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('properties')
    if (!col.fields.getByName('iptu_value')) {
      col.fields.add(new NumberField({ name: 'iptu_value', min: 0 }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('properties')
    col.fields.removeByName('iptu_value')
    app.save(col)
  },
)
