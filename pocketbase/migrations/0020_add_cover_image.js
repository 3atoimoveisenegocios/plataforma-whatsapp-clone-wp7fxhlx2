migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      if (!col.fields.getByName('cover_image')) {
        col.fields.add(new TextField({ name: 'cover_image' }))
      }
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      const field = col.fields.getByName('cover_image')
      if (field) {
        col.fields.remove(field.getId())
        app.save(col)
      }
    } catch (_) {}
  },
)
