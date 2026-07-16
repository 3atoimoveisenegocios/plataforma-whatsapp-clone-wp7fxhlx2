migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')
    if (!col.fields.getByName('welcome_enabled')) {
      col.fields.add(new BoolField({ name: 'welcome_enabled' }))
    }
    if (!col.fields.getByName('welcome_message')) {
      col.fields.add(new TextField({ name: 'welcome_message' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')
    col.fields.removeByName('welcome_enabled')
    col.fields.removeByName('welcome_message')
    app.save(col)
  },
)
