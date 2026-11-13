migrate(
  (app) => {
    // Campos de desfecho da rodada da IA em whatsapp_messages (usados pelo painel
    // "Logs da IA" do /inbox). O hook de IA passa a preencher — apenas registro,
    // nada na lógica muda.
    const col = app.findCollectionByNameOrId('whatsapp_messages')
    if (!col.fields.getByName('ai_status')) {
      col.fields.add(
        new SelectField({
          name: 'ai_status',
          values: ['enviada', 'falhou', 'descartada'],
          maxSelect: 1,
        }),
      )
    }
    if (!col.fields.getByName('ai_reason')) {
      col.fields.add(new TextField({ name: 'ai_reason' }))
    }
    if (!col.fields.getByName('ai_session_id')) {
      col.addIndex('idx_wm_ai_session', false, 'ai_session_id', '')
      col.fields.add(new TextField({ name: 'ai_session_id' }))
    }
    if (!col.fields.getByName('ai_turn_id')) {
      col.fields.add(new TextField({ name: 'ai_turn_id' }))
    }
    if (!col.fields.getByName('ai_source_ids')) {
      col.fields.add(new JSONField({ name: 'ai_source_ids', maxSize: 2000000 }))
    }
    if (!col.fields.getByName('ai_trigger_body')) {
      col.fields.add(new TextField({ name: 'ai_trigger_body' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_messages')
    for (const name of [
      'ai_status',
      'ai_reason',
      'ai_session_id',
      'ai_turn_id',
      'ai_source_ids',
      'ai_trigger_body',
    ]) {
      const f = col.fields.getByName(name)
      if (f) col.fields.removeByName(name)
    }
    col.removeIndex('idx_wm_ai_session')
    app.save(col)
  },
)
