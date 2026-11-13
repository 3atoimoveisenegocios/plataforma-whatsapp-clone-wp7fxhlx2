migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (!col.fields.getByName('ai_processed_ids')) {
      col.fields.add(
        new JSONField({
          name: 'ai_processed_ids',
          required: false,
          maxSize: 50000,
        }),
      )
      app.save(col)
    }
    if (!col.fields.getByName('ai_pending_ids')) {
      col.fields.add(
        new JSONField({
          name: 'ai_pending_ids',
          required: false,
          maxSize: 50000,
        }),
      )
      app.save(col)
    }
    if (!col.fields.getByName('ai_pending_at')) {
      col.fields.add(
        new DateField({
          name: 'ai_pending_at',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (col.fields.getByName('ai_pending_at')) {
      col.fields.removeByName('ai_pending_at')
    }
    if (col.fields.getByName('ai_pending_ids')) {
      col.fields.removeByName('ai_pending_ids')
    }
    if (col.fields.getByName('ai_processed_ids')) {
      col.fields.removeByName('ai_processed_ids')
    }
    app.save(col)
  },
)
