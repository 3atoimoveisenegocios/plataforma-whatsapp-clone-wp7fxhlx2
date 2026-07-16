migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      const imagesField = col.fields.getByName('images')
      if (imagesField) {
        col.fields.remove(imagesField.getId())
      }
      col.fields.add(
        new FileField({
          name: 'images',
          maxSelect: 50,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
        }),
      )
      app.save(col)
    } catch (err) {
      console.log('Failed to update images maxSelect:', String(err))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      const imagesField = col.fields.getByName('images')
      if (imagesField) {
        col.fields.remove(imagesField.getId())
      }
      col.fields.add(
        new FileField({
          name: 'images',
          maxSelect: 10,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        }),
      )
      app.save(col)
    } catch (_) {}
  },
)
