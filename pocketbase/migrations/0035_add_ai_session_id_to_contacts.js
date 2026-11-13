migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (!col.fields.getByName('ai_session_id')) {
      col.fields.add(
        new TextField({
          name: 'ai_session_id',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (col.fields.getByName('ai_session_id')) {
      col.fields.removeByName('ai_session_id')
      app.save(col)
    }
  },
)
