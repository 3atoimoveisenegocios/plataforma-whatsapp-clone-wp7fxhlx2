/**
 * v0.0.93 — pausa da IA limpa a fila de pendências do contato.
 *
 * Relato do usuário: "quando um contato tem a IA desativada (agent_paused=true)
 * e o contato manda uma mensagem e depois reativamos a IA, a IA vai responder
 * dessas mensagens? Pois não é para a IA responder quando reativa a IA, só
 * quando o contato manda mensagem com a IA ativada."
 *
 * Vazamento comprovado: mensagens gravadas em ai_pending_ids ANTES de
 * agent_paused virar true sobrevivem à pausa — e o cron de segurança
 * (ai_queue_safety_sweep) as drena DEPOIS da reativação, respondendo mensagens
 * enviadas com a IA desativada. O caminho comum já era correto (o hook
 * on_message_create_ai sai cedo quando agent_paused — mensagens que CHEGAM
 * durante a pausa nunca entram na fila); o vazamento era só da fila antiga.
 *
 * Correção 1 (este arquivo): no momento da pausa (agent_paused passando de
 * false/ausente para true em whatsapp_contacts), a fila é limpa —
 * ai_pending_ids = [] e ai_pending_at = ''. NADA mais muda: os outros campos
 * do contato (ai_processed_ids, ai_session_id, tags, ...) seguem intactos e
 * nenhuma mensagem é apagada.
 *
 * Correção 2 (ai_queue_safety_sweep.js): além de pular contatos pausados, o
 * dreno ignora pendências gravadas antes do instante da reativação (compara
 * ai_pending_at com o `updated` do contato — que a pausa da Correção 1
 * atualiza; qualquer reativação posterior também).
 *
 * Nota JSVM: callback SÍNCRONO, sem declarações de topo — toda a lógica inline.
 */
onRecordBeforeUpdateSuccess((e) => {
  if (!e.record) return e.next()
  try {
    const wasPaused = e.record.original().getBool('agent_paused')
    const isPaused = e.record.getBool('agent_paused')
    if (!wasPaused && isPaused) {
      e.record.set('ai_pending_ids', '[]')
      e.record.set('ai_pending_at', '')
      $app.logger().info('AI pause: pending queue cleared', 'contact', e.record.id)
    }
  } catch (err) {
    $app.logger().warn('AI pause: failed to clear pending queue', 'error', String(err))
  }
  return e.next()
}, 'whatsapp_contacts')
