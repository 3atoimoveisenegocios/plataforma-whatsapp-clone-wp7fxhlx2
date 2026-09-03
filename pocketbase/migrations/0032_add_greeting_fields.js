migrate(
  (app) => {
    const agentsCol = app.findCollectionByNameOrId('ai_agents')
    if (!agentsCol.fields.getByName('greeting_keywords')) {
      agentsCol.fields.add(new JSONField({ name: 'greeting_keywords' }))
    }
    app.save(agentsCol)

    const msgsCol = app.findCollectionByNameOrId('whatsapp_messages')
    if (!msgsCol.fields.getByName('greeting_sent')) {
      msgsCol.fields.add(new BoolField({ name: 'greeting_sent' }))
    }
    if (!msgsCol.fields.getByName('automation_type')) {
      msgsCol.fields.add(new TextField({ name: 'automation_type' }))
    }
    app.save(msgsCol)
  },
  (app) => {
    const agentsCol = app.findCollectionByNameOrId('ai_agents')
    agentsCol.fields.removeByName('greeting_keywords')
    app.save(agentsCol)

    const msgsCol = app.findCollectionByNameOrId('whatsapp_messages')
    msgsCol.fields.removeByName('greeting_sent')
    msgsCol.fields.removeByName('automation_type')
    app.save(msgsCol)
  },
)
