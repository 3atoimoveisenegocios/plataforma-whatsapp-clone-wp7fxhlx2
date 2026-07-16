migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (!col.fields.getByName('tags')) {
      col.fields.add(new JSONField({ name: 'tags' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    col.fields.removeByName('tags')
    app.save(col)
  },
)
