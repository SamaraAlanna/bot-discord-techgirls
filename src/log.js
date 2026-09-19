// Registro das publicações no canal de log (seção 10 do CLAUDE.md).

import { criarMensagem } from './discord-api.js';

/**
 * Escreve uma linha no canal de log. Nunca lança: falhar aqui não pode
 * impedir uma publicação que já aconteceu, então o erro só vai para o console.
 * Hoje `detalhe` é sempre o link do post, como pede a seção 10.
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
  } catch (erro) {
    console.error('Falha ao registrar no log, a publicação seguiu normalmente:', erro);
  }
}
