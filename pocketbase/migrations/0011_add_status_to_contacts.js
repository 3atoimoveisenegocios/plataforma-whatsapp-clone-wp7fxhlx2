migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')

    if (!col.fields.getByName('status')) {
      col.fields.add(
        new SelectField({
          name: 'status',
          values: ['in_conversation', 'waiting', 'resolved', 'lost'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    col.addIndex('idx_wc_status', false, 'status', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    col.fields.removeByName('status')
    col.removeIndex('idx_wc_status')
    app.save(col)
  },
)
