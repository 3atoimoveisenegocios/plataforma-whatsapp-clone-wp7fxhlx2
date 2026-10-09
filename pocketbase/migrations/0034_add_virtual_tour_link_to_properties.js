migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('properties')
    if (!col.fields.getByName('virtual_tour_link')) {
      col.fields.add(new TextField({ name: 'virtual_tour_link' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('properties')
    col.fields.removeByName('virtual_tour_link')
    app.save(col)
  },
)
