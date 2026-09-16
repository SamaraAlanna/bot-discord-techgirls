// Entrada do Worker: valida o método, confere a assinatura e roteia a interação.

import { verificarAssinatura } from './verificar.js';
import { json, mensagemEfemera, pong, TIPO_INTERACAO } from './respostas.js';

export default {
  async fetch(request, env, ctx) {
    // 1. Só POST. O Discord nunca usa outro método nesta URL.
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
    }

    // 2. Corpo bruto: a assinatura cobre o texto exato, então nada de parse antes da hora.
    const assinatura = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const corpoBruto = await request.text();

    // 3. Assinatura inválida ou ausente para a conversa aqui.
    const assinaturaValida = await verificarAssinatura({
      corpoBruto,
      assinatura,
      timestamp,
      chavePublicaHex: env.DISCORD_PUBLIC_KEY,
    });
    if (!assinaturaValida) {
      return new Response('Assinatura inválida.', { status: 401 });
    }

    let interacao;
    try {
      interacao = JSON.parse(corpoBruto);
    } catch {
      return new Response('Corpo inválido.', { status: 400 });
    }

    try {
      return await rotear(interacao, env, ctx);
    } catch (erro) {
      // 4. Erro interno: detalhe fica no log do Worker, a admin recebe um aviso curto.
      console.error('Erro ao tratar a interação:', erro);
      return mensagemEfemera('Algo quebrou aqui do meu lado. Tenta de novo em instantes.');
    }
  },
};

async function rotear(interacao, env, ctx) {
  switch (interacao.type) {
    // O Discord manda um PING ao salvar a URL no portal e de tempos em tempos depois disso.
    case TIPO_INTERACAO.PING:
      return pong();

    case TIPO_INTERACAO.COMANDO:
    case TIPO_INTERACAO.COMPONENTE:
    case TIPO_INTERACAO.ENVIO_DE_MODAL:
      // Os fluxos entram nas próximas etapas (seção 13 do CLAUDE.md).
      return mensagemEfemera('Esse comando ainda está sendo construído.');

    default:
      return json({ erro: 'Tipo de interação não suportado.' }, 400);
  }
}
