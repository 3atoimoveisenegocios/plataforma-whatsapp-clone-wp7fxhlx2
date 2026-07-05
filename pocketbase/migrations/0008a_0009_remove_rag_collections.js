migrate(
  (app) => {
    try {
      const chunks = app.findCollectionByNameOrId('agent_document_chunks')
      app.delete(chunks)
    } catch (_) {}

    try {
      const docs = app.findCollectionByNameOrId('agent_documents')
      app.delete(docs)
    } catch (_) {}
  },
  (app) => {
    // Revert is not implemented as data is dropped.
  },
)
