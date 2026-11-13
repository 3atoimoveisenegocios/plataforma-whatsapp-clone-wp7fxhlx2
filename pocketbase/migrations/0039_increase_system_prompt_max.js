// 0039: expande o limite do campo system_prompt da coleção ai_agents de 5000
// para 50000 caracteres. O prompt completo da assistente (Iris) tem mais de
// 7000 caracteres e era rejeitado pela validação do PocketBase.
// Idempotente: apenas ajusta o `max` do campo existente — nenhum dado é
// apagado nem reescrito (aumentar o limite nunca invalida o valor atual).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')
    const field = col.fields.getByName('system_prompt')
    if (field) {
      field.max = 50000
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ai_agents')
    const field = col.fields.getByName('system_prompt')
    if (field) {
      field.max = 5000
      app.save(col)
    }
  },
)
