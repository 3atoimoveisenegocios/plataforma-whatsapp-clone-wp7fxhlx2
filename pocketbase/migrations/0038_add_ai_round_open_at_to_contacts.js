// v0.0.92 — campo ai_round_open_at (date, opcional) em whatsapp_contacts.
// Marca persistente de "rodada da IA aberta agora" — usada pelo hook e pelo cron
// de segurança (ai_queue_safety_sweep.js) para não drenar (duas vezes) uma fila
// cuja rodada acabou de começar. Expira sozinha: o dreno ignora a marca quando
// tem mais de ROUND_OPEN_STALE_MS (4 min) — nunca prende a fila.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (!col.fields.getByName('ai_round_open_at')) {
      col.fields.add(
        new DateField({
          name: 'ai_round_open_at',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_contacts')
    if (col.fields.getByName('ai_round_open_at')) {
      col.fields.removeByName('ai_round_open_at')
    }
    app.save(col)
  },
)
