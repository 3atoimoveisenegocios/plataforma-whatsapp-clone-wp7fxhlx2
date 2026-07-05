migrate(
  (app) => {
    const docCol = app.findCollectionByNameOrId('agent_documents')

    if (!docCol.fields.getByName('status')) {
      docCol.fields.add(
        new SelectField({
          name: 'status',
          values: ['pending', 'processing', 'ready', 'error'],
          maxSelect: 1,
        }),
      )
    }

    if (!docCol.fields.getByName('error_message')) {
      docCol.fields.add(
        new TextField({
          name: 'error_message',
        }),
      )
    }

    app.save(docCol)

    let chunkCol
    try {
      chunkCol = app.findCollectionByNameOrId('agent_document_chunks')
    } catch (_) {
      chunkCol = new Collection({
        name: 'agent_document_chunks',
        type: 'base',
        listRule: "@request.auth.id != '' && document_id.user_id = @request.auth.id",
        viewRule: "@request.auth.id != '' && document_id.user_id = @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'document_id',
            type: 'relation',
            required: true,
            collectionId: docCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'content', type: 'text', required: true },
          { name: 'chunk_index', type: 'number' },
          { name: 'vector', type: 'vector', dimensions: 1536, distance: 'cosine' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_agent_document_chunks_doc_id ON agent_document_chunks (document_id)',
        ],
      })
      app.save(chunkCol)
    }
  },
  (app) => {
    try {
      const chunkCol = app.findCollectionByNameOrId('agent_document_chunks')
      app.delete(chunkCol)
    } catch (_) {}

    const docCol = app.findCollectionByNameOrId('agent_documents')
    if (docCol.fields.getByName('status')) {
      docCol.fields.removeByName('status')
    }
    if (docCol.fields.getByName('error_message')) {
      docCol.fields.removeByName('error_message')
    }
    app.save(docCol)
  },
)
