migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      if (!col.fields.getByName('price_sale')) {
        col.fields.add(new NumberField({ name: 'price_sale', min: 0 }))
      }
      if (!col.fields.getByName('price_rent')) {
        col.fields.add(new NumberField({ name: 'price_rent', min: 0 }))
      }
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('properties')
      var sale = col.fields.getByName('price_sale')
      if (sale) col.fields.remove(sale.getId())
      var rent = col.fields.getByName('price_rent')
      if (rent) col.fields.remove(rent.getId())
      app.save(col)
    } catch (_) {}
  },
)
