migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')

    if (!col.fields.getByName('business_hours_enabled')) {
      col.fields.add(new BoolField({ name: 'business_hours_enabled' }))
    }

    if (!col.fields.getByName('operating_days')) {
      col.fields.add(new JSONField({ name: 'operating_days' }))
    }

    if (!col.fields.getByName('start_time')) {
      col.fields.add(new TextField({ name: 'start_time' }))
    }

    if (!col.fields.getByName('end_time')) {
      col.fields.add(new TextField({ name: 'end_time' }))
    }

    if (!col.fields.getByName('out_of_hours_message')) {
      col.fields.add(new TextField({ name: 'out_of_hours_message' }))
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')
    col.fields.removeByName('business_hours_enabled')
    col.fields.removeByName('operating_days')
    col.fields.removeByName('start_time')
    col.fields.removeByName('end_time')
    col.fields.removeByName('out_of_hours_message')
    app.save(col)
  },
)
