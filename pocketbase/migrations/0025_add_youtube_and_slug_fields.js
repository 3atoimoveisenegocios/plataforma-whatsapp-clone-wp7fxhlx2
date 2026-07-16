migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')

      if (!col.fields.getByName('youtube_link')) {
        col.fields.add(new TextField({ name: 'youtube_link' }))
      }
      if (!col.fields.getByName('slug')) {
        col.fields.add(new TextField({ name: 'slug' }))
      }

      app.save(col)

      col.addIndex('idx_properties_slug', true, 'slug', "slug != ''")
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')

      col.removeIndex('idx_properties_slug')

      var yt = col.fields.getByName('youtube_link')
      if (yt) col.fields.remove(yt.getId())

      var slug = col.fields.getByName('slug')
      if (slug) col.fields.remove(slug.getId())

      app.save(col)
    } catch (_) {}
  },
)
