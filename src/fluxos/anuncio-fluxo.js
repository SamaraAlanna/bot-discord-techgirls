// Fluxo do /anuncio: envio do modal, escolha da menção, publicar e cancelar.

import {
  ID_CANCELAR,
  ID_MENU_MENCAO,
  ID_PUBLICAR,
  lerCamposDoModal,
  lerEmbedPrevia,
  mencaoParaPublicar,
  montarComponentes,
  montarEmbedPrevia,
  montarEmbedPublicado,
  textoDaPrevia,
} from '../componentes/anuncio-componentes.js';
import { criarMensagem, editarRespostaOriginal, linkDaMensagem } from '../discord-api.js';
import { lerAutora } from '../autora.js';
import { lerDataBrasilia } from '../datas.js';
import { registrarNoLog } from '../log.js';
import { EFEMERA, TIPO_RESPOSTA, adiarAtualizacao, atualizarMensagem, json, mensagemEfemera } from '../respostas.js';
import { validarLink } from '../validacao.js';

// Envio do modal: valida e responde com a pré-visualização efêmera.
export function tratarEnvioDoModal(interacao) {
  const campos = lerCamposDoModal(interacao.data?.components);

  const titulo = campos.titulo ?? '';
  const texto = campos.texto ?? '';
  if (!titulo || !texto) {
    return mensagemEfemera('Título e texto são obrigatórios, use /anuncio de novo e preencha os dois.');
  }

  const resultadoLink = validarLink(campos.link);
  if (resultadoLink.erro) return mensagemEfemera(resultadoLink.erro);

  let unix = null;
  if (campos.quando) {
    const resultadoData = lerDataBrasilia(campos.quando);
    if (resultadoData.erro) return mensagemEfemera(resultadoData.erro);
    unix = resultadoData.unix;
  }

  const embed = montarEmbedPrevia({
    titulo,
    texto,
    link: resultadoLink.link,
    unix,
    // Sem escolha ainda: o botão Publicar nasce desabilitado.
    escolha: null,
    autora: lerAutora(interacao),
  });

  return json({
    type: TIPO_RESPOSTA.MENSAGEM,
    data: {
      content: textoDaPrevia(null),
      embeds: [embed],
      components: montarComponentes({}),
      flags: EFEMERA,
      allowed_mentions: { parse: [] },
    },
  });
}

// Botões e menu da pré-visualização.
export function tratarComponente(interacao, env, ctx) {
  const acao = interacao.data?.custom_id;

  if (acao === ID_CANCELAR) {
    return atualizarMensagem({ content: 'Publicação cancelada.', embeds: [], components: [] });
  }

  const embed = interacao.message?.embeds?.[0];
  if (!embed) {
    // A pré-visualização é o estado inteiro. Sem ela, não dá para publicar nada.
    return mensagemEfemera('Não consegui ler a pré-visualização, use /anuncio de novo.');
  }

  if (acao === ID_MENU_MENCAO) {
    const escolha = interacao.data?.values?.[0];
    const dados = lerEmbedPrevia(embed);

    return atualizarMensagem({
      // O conteúdo precisa ir junto: o que não é enviado no update fica como estava.
      content: textoDaPrevia(escolha),
      // A autora é relida da interação a cada passo, nunca do card.
      embeds: [montarEmbedPrevia({ ...dados, escolha, autora: lerAutora(interacao) })],
      components: montarComponentes({ escolha }),
      allowed_mentions: { parse: [] },
    });
  }

  if (acao === ID_PUBLICAR) {
    const dados = lerEmbedPrevia(embed);
    if (!dados.escolha) {
      return mensagemEfemera('Escolha no menu quem deve ser avisada antes de publicar.');
    }

    // Publicar chama a API, o que não cabe nos 3 segundos da primeira resposta.
    // A autora do anúncio é quem clicou em Publicar, conferida agora.
    ctx.waitUntil(publicar(interacao, env, { ...dados, autora: lerAutora(interacao) }));
    return adiarAtualizacao();
  }

  return mensagemEfemera('Esse botão não existe mais, use /anuncio de novo.');
}

// Roda depois da resposta adiada: publica, registra no log e fecha a interação.
async function publicar(interacao, env, dados) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;

  // A menção precisa estar no conteúdo: menção dentro de embed não notifica.
  const mencao = mencaoParaPublicar(dados.escolha);

  try {
    const mensagem = await criarMensagem(
      env.CANAL_ANUNCIOS_ID,
      {
        ...(mencao.content ? { content: mencao.content } : {}),
        embeds: [montarEmbedPublicado(dados)],
        allowed_mentions: mencao.allowed_mentions,
      },
      env.DISCORD_TOKEN,
    );

    const link = linkDaMensagem(env.GUILD_ID, env.CANAL_ANUNCIOS_ID, mensagem.id);

    // Log nunca interrompe: registrarNoLog trata o próprio erro.
    await registrarNoLog(env, { acao: 'Anúncio publicado', adminId, link });

    await concluir(interacao, `Anúncio publicado: ${link}`);
  } catch (erro) {
    console.error('Falha ao publicar o anúncio:', erro);
    await concluir(interacao, 'Não consegui publicar o anúncio, tente de novo em instantes.');
  }
}

async function concluir(interacao, conteudo) {
  try {
    await editarRespostaOriginal(interacao.application_id, interacao.token, {
      content: conteudo,
      embeds: [],
      components: [],
      allowed_mentions: { parse: [] },
    });
  } catch (erro) {
    console.error('Falha ao fechar a pré-visualização:', erro);
  }
}
