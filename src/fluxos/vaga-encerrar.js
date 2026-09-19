// Fluxo do /vaga encerrar (seção 8.2 do CLAUDE.md).
//
// Ordem importa: tag e trancamento primeiro, depois a cor do card, e arquivar por
// último, porque a doc diz que uma thread arquivada só aceita edição se a própria
// edição a desarquivar (seção 12).

import { recolorir } from '../componentes/vaga-componentes.js';
import { FLAG_V2 } from '../componentes/v2.js';
import { CORES, TAG_ENCERRADA_ID } from '../config.js';
import { buscarCanal, buscarMensagem, editarCanal, editarMensagem, linkDoPost } from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { TIPO_RESPOSTA, json, mensagemEfemera } from '../respostas.js';
import { EFEMERA } from '../respostas.js';
import { concluirV2, registrarEtapa, registrarFalha } from './previa-v2.js';

const FLUXO = 'vaga encerrar';

// Um post de fórum aceita no máximo 5 tags (seção 12).
const MAXIMO_DE_TAGS = 5;

/** Só faz sentido dentro de um post do fórum de vagas. */
export function tratarEncerrar(interacao, env, ctx) {
  const canal = interacao.channel;

  if (canal?.parent_id !== env.CANAL_VAGAS_ID) {
    registrarFalha(FLUXO, 'checagem do canal', `canal ${canal?.id} tem pai ${canal?.parent_id}`);
    return mensagemEfemera('Use este comando dentro do post da vaga que você quer encerrar.');
  }

  ctx.waitUntil(encerrar(interacao, env));
  return json({ type: TIPO_RESPOSTA.MENSAGEM_ADIADA, data: { flags: EFEMERA } });
}

/**
 * Acrescenta a Encerrada às tags que já estão no post.
 * Se o post estiver no limite, nenhuma tag é removida: tirar uma tag que a admin
 * escolheu seria pior que ficar sem a Encerrada. O resto do encerramento acontece
 * do mesmo jeito, e a admin fica sabendo.
 */
function tagsComEncerrada(atuais = []) {
  if (atuais.length >= MAXIMO_DE_TAGS) {
    registrarFalha(FLUXO, 'tags', `post no limite de ${MAXIMO_DE_TAGS} tags, a Encerrada não coube`);
    return { coube: false };
  }
  return { coube: true, tags: [...atuais, TAG_ENCERRADA_ID] };
}

async function encerrar(interacao, env) {
  const postId = interacao.channel.id;
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;

  let post;
  try {
    // O canal que vem na interação é parcial e não traz as tags aplicadas.
    post = await buscarCanal(postId, env.DISCORD_TOKEN);
  } catch (erro) {
    registrarFalha(FLUXO, 'leitura do post', erro);
    await concluirV2(interacao, 'Não consegui ler esse post, tente de novo em instantes.', FLUXO);
    return;
  }

  registrarEtapa(FLUXO, 'leitura do post', `tags atuais: ${(post.applied_tags ?? []).join(',') || 'nenhuma'}`);

  if ((post.applied_tags ?? []).includes(TAG_ENCERRADA_ID)) {
    await concluirV2(interacao, 'Essa vaga já está encerrada.', FLUXO);
    return;
  }

  const marcacao = tagsComEncerrada(post.applied_tags ?? []);

  try {
    // Tag e trancamento juntos: até aqui nada é irreversível para a admin.
    await editarCanal(
      postId,
      { ...(marcacao.coube ? { applied_tags: marcacao.tags } : {}), locked: true },
      env.DISCORD_TOKEN,
    );
    registrarEtapa(FLUXO, 'tag e trancamento', marcacao.coube ? 'tag aplicada' : 'sem espaço para a tag');
  } catch (erro) {
    registrarFalha(FLUXO, 'tag e trancamento', erro);
    await concluirV2(interacao, 'Não consegui encerrar a vaga, tente de novo em instantes.', FLUXO);
    return;
  }

  // Daqui para baixo a vaga já está encerrada: nada desfaz isso.
  const cartaoRecolorido = await recolorirOCartao(env, postId);
  registrarEtapa(FLUXO, 'cor do card', cartaoRecolorido ? 'recolorido' : 'não recolorido');

  const link = linkDoPost(env.GUILD_ID, postId);
  await registrarNoLog(env, { acao: 'Vaga encerrada', adminId, detalhe: link });
  registrarEtapa(FLUXO, 'log', link);

  const arquivado = await arquivar(env, postId);
  registrarEtapa(FLUXO, 'arquivamento', arquivado ? 'arquivado' : 'não arquivado');

  await concluirV2(interacao, textoDoFim({ marcada: marcacao.coube, cartaoRecolorido, arquivado }), FLUXO);
  registrarEtapa(FLUXO, 'fechamento da interação', 'frase enviada');
}

// A primeira mensagem de um post de fórum tem o mesmo id do post.
async function recolorirOCartao(env, postId) {
  try {
    const mensagem = await buscarMensagem(postId, postId, env.DISCORD_TOKEN);
    const originais = mensagem.components ?? [];
    const { componentes, achou } = recolorir(originais, CORES.ENCERRADA);

    // Editar sem componentes, ou sem o container, apagaria o conteúdo do post.
    // Antes de tocar na mensagem publicada, o que vai sair tem que bater com o que entrou.
    if (!originais.length || !achou || componentes.length !== originais.length) {
      registrarFalha(FLUXO, 'cor do card', `nada seguro para editar: ${originais.length} componentes, container ${achou}`);
      return false;
    }

    // A flag precisa ir em toda edição de mensagem V2: sem ela os componentes
    // são descartados e a mensagem fica vazia (seção 12).
    await editarMensagem(postId, postId, { flags: FLAG_V2, components: componentes }, env.DISCORD_TOKEN);
    return true;
  } catch (erro) {
    registrarFalha(FLUXO, 'cor do card', erro);
    return false;
  }
}

// Arquivar é o último passo: post arquivado recusa edição.
async function arquivar(env, postId) {
  try {
    await editarCanal(postId, { archived: true }, env.DISCORD_TOKEN);
    return true;
  } catch (erro) {
    registrarFalha(FLUXO, 'arquivamento', erro);
    return false;
  }
}

function textoDoFim({ marcada, cartaoRecolorido, arquivado }) {
  if (!marcada) return 'Vaga encerrada, mas o post está no limite de tags e ficou sem a tag Encerrada.';
  if (!cartaoRecolorido) return 'Vaga encerrada, mas o card ficou com a cor antiga.';
  if (!arquivado) return 'Vaga encerrada, mas o post continua aberto na lista.';
  return 'Vaga encerrada.';
}
