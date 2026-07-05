migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_messages')
    col.fields.add(
      new SelectField({
        name: 'type',
        maxSelect: 1,
        values: ['text', 'image', 'audio', 'document', 'video'],
      }),
    )
    col.fields.add(new FileField({ name: 'media_file', maxSelect: 1, maxSize: 52428800 })) // 50MB
    col.fields.add(new TextField({ name: 'caption' }))
    col.fields.add(new TextField({ name: 'file_name' }))
    col.fields.add(new TextField({ name: 'mime_type' }))
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_messages')
    col.fields.removeByName('type')
    col.fields.removeByName('media_file')
    col.fields.removeByName('caption')
    col.fields.removeByName('file_name')
    col.fields.removeByName('mime_type')
    app.save(col)
  },
)
