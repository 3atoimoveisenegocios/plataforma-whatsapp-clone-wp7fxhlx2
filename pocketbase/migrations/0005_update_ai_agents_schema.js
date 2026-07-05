migrate(
  (app) => {
    try {
      app
        .db()
        .newQuery(
          "UPDATE ai_agents SET provider = 'openai', api_key = 'sk-placeholder' WHERE provider IS NULL OR provider = ''",
        )
        .execute()
    } catch (err) {
      console.log('Failed to update existing agent default values', err)
    }

    const col = app.findCollectionByNameOrId('ai_agents')

    if (!col.fields.getByName('provider')) {
      col.fields.add(
        new SelectField({
          name: 'provider',
          required: true,
          values: ['gemini', 'openai'],
        }),
      )
    }

    if (!col.fields.getByName('api_key')) {
      col.fields.add(
        new TextField({
          name: 'api_key',
          required: true,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')
    col.fields.removeByName('provider')
    col.fields.removeByName('api_key')
    app.save(col)
  },
)
