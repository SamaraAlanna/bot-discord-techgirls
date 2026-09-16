// Entrada do Worker: valida o método, confere a assinatura e roteia a interação.

import { comandoAnuncio } from './comandos/anuncio.js';
import { comandoVaga } from './comandos/vaga.js';
import * as fluxoDeAnuncio from './fluxos/anuncio-fluxo.js';
import * as fluxoDeVaga from './fluxos/vaga-fluxo.js';
import { json, mensagemEfemera, pong, TIPO_INTERACAO } from './respostas.js';
import { verificarAssinatura } from './verificar.js';

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

// Exportado para teste: o roteamento é o que mais muda a cada comando novo.
export async function rotear(interacao, env, ctx) {
  switch (interacao.type) {
    // O Discord manda um PING ao salvar a URL no portal e de tempos em tempos depois disso.
    case TIPO_INTERACAO.PING:
      return pong();

    case TIPO_INTERACAO.COMANDO:
      return rotearComando(interacao);

    case TIPO_INTERACAO.COMPONENTE:
      return rotearPorPrefixo(interacao, (fluxo) => fluxo.tratarComponente(interacao, env, ctx));

    case TIPO_INTERACAO.ENVIO_DE_MODAL:
      return rotearPorPrefixo(interacao, (fluxo) => fluxo.tratarEnvioDoModal(interacao, env, ctx));

    default:
      return json({ erro: 'Tipo de interação não suportado.' }, 400);
  }
}

function rotearComando(interacao) {
  const nome = interacao.data?.name;

  if (nome === 'anuncio') return comandoAnuncio();
  if (nome === 'vaga') return comandoVaga(interacao);

  return mensagemEfemera('Não conheço esse comando, ele pode ter sido removido.');
}

// O custom_id sempre começa com o nome do fluxo, como em "anuncio:publicar" (seção 7).
const FLUXOS = {
  anuncio: fluxoDeAnuncio,
  vaga: fluxoDeVaga,
};

function rotearPorPrefixo(interacao, chamar) {
  const prefixo = String(interacao.data?.custom_id ?? '').split(':')[0];
  const fluxo = FLUXOS[prefixo];

  if (!fluxo) {
    return mensagemEfemera('Essa tela é de uma versão antiga do bot, use o comando de novo.');
  }
  return chamar(fluxo);
}
