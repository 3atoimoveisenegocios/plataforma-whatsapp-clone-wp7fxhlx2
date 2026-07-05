migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      if (!col.fields.getByName('built_area')) {
        col.fields.add(new NumberField({ name: 'built_area', min: 0 }))
      }
      if (!col.fields.getByName('land_area')) {
        col.fields.add(new NumberField({ name: 'land_area', min: 0 }))
      }
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      var built = col.fields.getByName('built_area')
      if (built) col.fields.remove(built.getId())
      var land = col.fields.getByName('land_area')
      if (land) col.fields.remove(land.getId())
      app.save(col)
    } catch (_) {}
  },
)
