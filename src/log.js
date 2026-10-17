// Registro das publicações, encerramentos e apagamentos no canal de log.

import { criarMensagem } from './discord-api.js';

/**
 * Escreve uma linha no canal de log. Nunca lança: falhar aqui não pode
 * impedir uma publicação que já aconteceu, então o erro só vai para o console.
 * `detalhe` é o link do post, menos no /vaga apagar, em que o link deixa de
 * existir e vai o título da vaga. Devolve se a linha foi escrita.
 */
export async function registrarNoLog(env, { acao, adminId, detalhe }) {
  try {
    const agora = Math.floor(Date.now() / 1000);
    await criarMensagem(
      env.CANAL_LOG_ID,
      {
        content: `${acao} por <@${adminId}> · ${detalhe} · <t:${agora}:f>`,
        // Log não notifica ninguém, nem a admin citada.
        allowed_mentions: { parse: [] },
      },
      env.DISCORD_TOKEN,
    );
    return true;
  } catch (erro) {
    console.error('Falha ao registrar no log, a publicação seguiu normalmente:', erro);
    return false;
  }
}
