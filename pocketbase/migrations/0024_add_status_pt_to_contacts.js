migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')

    var existing = col.fields.getByName('status')
    if (existing) {
      col.fields.remove(existing.getId())
    }

    col.fields.add(
      new SelectField({
        name: 'status',
        values: ['em_conversa', 'aguardando', 'resolvido', 'perdido'],
        maxSelect: 1,
        required: false,
      }),
    )

    col.addIndex('idx_wc_status', false, 'status', '')
    app.save(col)

    app
      .db()
      .newQuery(
        "UPDATE whatsapp_contacts SET status = 'em_conversa' WHERE status = 'in_conversation' OR status IS NULL OR status = ''",
      )
      .execute()
    app
      .db()
      .newQuery("UPDATE whatsapp_contacts SET status = 'aguardando' WHERE status = 'waiting'")
      .execute()
    app
      .db()
      .newQuery("UPDATE whatsapp_contacts SET status = 'resolvido' WHERE status = 'resolved'")
      .execute()
    app
      .db()
      .newQuery("UPDATE whatsapp_contacts SET status = 'perdido' WHERE status = 'lost'")
      .execute()
  },
  (app) => {
    var col = app.findCollectionByNameOrId('whatsapp_contacts')
    var statusField = col.fields.getByName('status')
    if (statusField) {
      col.fields.remove(statusField.getId())
    }
    col.removeIndex('idx_wc_status')
    app.save(col)
  },
)
