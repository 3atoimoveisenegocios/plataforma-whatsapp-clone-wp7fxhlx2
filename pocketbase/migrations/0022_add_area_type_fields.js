migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      if (!col.fields.getByName('useful_area')) {
        col.fields.add(new NumberField({ name: 'useful_area', min: 0 }))
      }
      if (!col.fields.getByName('total_area')) {
        col.fields.add(new NumberField({ name: 'total_area', min: 0 }))
      }
      if (!col.fields.getByName('common_area')) {
        col.fields.add(new NumberField({ name: 'common_area', min: 0 }))
      }
      if (!col.fields.getByName('private_area')) {
        col.fields.add(new NumberField({ name: 'private_area', min: 0 }))
      }
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      var useful = col.fields.getByName('useful_area')
      if (useful) col.fields.remove(useful.getId())
      var total = col.fields.getByName('total_area')
      if (total) col.fields.remove(total.getId())
      var common = col.fields.getByName('common_area')
      if (common) col.fields.remove(common.getId())
      var priv = col.fields.getByName('private_area')
      if (priv) col.fields.remove(priv.getId())
      app.save(col)
    } catch (_) {}
  },
)
