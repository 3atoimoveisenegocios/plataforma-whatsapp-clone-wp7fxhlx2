migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (!col.fields.getByName('agent_paused')) {
      col.fields.add(new BoolField({ name: 'agent_paused' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    col.fields.removeByName('agent_paused')
    app.save(col)
  },
)
