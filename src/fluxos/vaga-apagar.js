// Fluxo do /vaga apagar: pergunta com o título e, só no botão, o apagamento.
//
// Apagar um post não tem volta: a doc diz "Deleting a guild channel cannot be
// undone". Por isso o comando só pergunta, mostrando o título, e quem apaga é o
// botão Apagar, que ainda relê o post antes de tocar nele.

import { ACAO, montarPerguntaDeApagar } from '../componentes/vaga-componentes.js';
import { TAG_ENCERRADA_ID } from '../config.js';
import { apagarCanal, buscarCanal } from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { TIPO_RESPOSTA, json, mensagemEfemera } from '../respostas.js';
import { adiarMensagem, atualizarPrevia, concluirV2, registrarEtapa, registrarFalha } from './previa-v2.js';

const FLUXO = 'vaga apagar';

const ONDE_USAR = 'Use este comando dentro do post da vaga que você quer apagar.';

const noForumDeVagas = (canal, env) => canal?.parent_id === env.CANAL_VAGAS_ID;

/** O comando: só dentro de um post do fórum de vagas, e só pergunta. */
export function tratarApagar(interacao, env, ctx) {
  const canal = interacao.channel;

  if (!noForumDeVagas(canal, env)) {
    registrarFalha(FLUXO, 'checagem do canal', `canal ${canal?.id} tem pai ${canal?.parent_id}`);
    return mensagemEfemera(ONDE_USAR);
  }
  registrarEtapa(FLUXO, 'checagem do canal', `post ${canal.id}`);

  // O canal da interação é parcial e não traz as tags: o post precisa ser lido.
  ctx.waitUntil(perguntar(interacao, env));
  return adiarMensagem();
}

async function perguntar(interacao, env) {
  const post = await lerPost(interacao, env);
  if (!post) return;

  const encerrada = (post.applied_tags ?? []).includes(TAG_ENCERRADA_ID);
  const mostrou = await atualizarPrevia(interacao, montarPerguntaDeApagar({ titulo: post.name, encerrada }), {}, FLUXO);
  if (mostrou) registrarEtapa(FLUXO, 'pergunta', encerrada ? 'vaga encerrada' : 'vaga ainda aberta, com aviso');
}

/** Botões Apagar e Cancelar da pergunta, encaminhados pelo fluxo do /vaga. */
export function tratarComponenteDeApagar(interacao, env, ctx, acao) {
  if (acao === ACAO.APAGAR_CANCELAR) {
    ctx.waitUntil(cancelar(interacao));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  // A pergunta mora dentro do post, então o canal do clique é o próprio post.
  if (!noForumDeVagas(interacao.channel, env)) {
    registrarFalha(FLUXO, 'checagem do canal no Apagar', `canal ${interacao.channel?.id}`);
    return mensagemEfemera(ONDE_USAR);
  }

  ctx.waitUntil(apagar(interacao, env));
  return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
}

async function cancelar(interacao) {
  await concluirV2(interacao, 'Nada foi apagado.', FLUXO);
  registrarEtapa(FLUXO, 'cancelado', 'o post não foi tocado');
}

/**
 * Lê o post de novo antes de apagar: confirma que ele ainda existe e que é do
 * fórum de vagas, e pega o título atual, que é o que vai para o log.
 */
async function apagar(interacao, env) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;

  const post = await lerPost(interacao, env);
  if (!post) return;

  try {
    await apagarCanal(post.id, env.DISCORD_TOKEN);
    registrarEtapa(FLUXO, 'apagamento', `post ${post.id}, "${post.name}"`);
  } catch (erro) {
    registrarFalha(FLUXO, 'apagamento', erro);
    await concluirV2(interacao, 'Não consegui apagar a vaga, tente de novo em instantes.', FLUXO);
    return;
  }

  // Sem link para registrar, o log guarda o título e quem apagou.
  const registrou = await registrarNoLog(env, { acao: 'Vaga apagada', adminId, detalhe: `"${post.name}"` });
  if (registrou) registrarEtapa(FLUXO, 'log', `"${post.name}"`);

  // A pergunta era efêmera e morava dentro do post que acabou de sumir, então
  // esta frase pode não ter onde aparecer. A prova do apagamento é a linha do log.
  await concluirV2(interacao, 'Vaga apagada.', FLUXO);
  registrarEtapa(FLUXO, 'fechamento da interação', 'frase enviada');
}

// Lê o post pela API. Devolve null, já com a frase para a admin, se não der.
async function lerPost(interacao, env) {
  const postId = interacao.channel.id;

  let post;
  try {
    post = await buscarCanal(postId, env.DISCORD_TOKEN);
  } catch (erro) {
    registrarFalha(FLUXO, 'leitura do post', erro);
    await concluirV2(interacao, 'Não consegui ler esse post, tente de novo em instantes.', FLUXO);
    return null;
  }

  // O canal da interação já foi conferido; o que a API diz é a palavra final.
  if (!noForumDeVagas(post, env)) {
    registrarFalha(FLUXO, 'leitura do post', `post ${postId} tem pai ${post.parent_id}`);
    await concluirV2(interacao, ONDE_USAR, FLUXO);
    return null;
  }

  registrarEtapa(FLUXO, 'leitura do post', `"${post.name}", tags: ${(post.applied_tags ?? []).join(',') || 'nenhuma'}`);
  return post;
}
