// Fluxo do /anuncio: envio do modal, escolha de menção e reação, publicar e cancelar.

import { anexosParaManter, baixarImagens, validarImagensDoModal } from '../anexos.js';
import { lerAutora } from '../autora.js';
import {
  ID_CAMPO_IMAGENS,
  ID_CANCELAR,
  ID_MENU_MENCAO,
  ID_MENU_REACAO,
  ID_PUBLICAR,
  emojiDaReacao,
  lerCamposDoModal,
  lerEmbedPrevia,
  mencaoParaPublicar,
  montarComponentes,
  montarEmbedPrevia,
  montarEmbedPublicado,
  textoDaPrevia,
} from '../componentes/anuncio-componentes.js';
import { lerDataBrasilia } from '../datas.js';
import {
  caminhoDeAcompanhamento,
  concluirInteracao,
  criarMensagem,
  enviarArquivos,
  linkDaMensagem,
  reagir,
} from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { EFEMERA, TIPO_RESPOSTA, adiarAtualizacao, atualizarMensagem, json, mensagemEfemera } from '../respostas.js';
import { validarLink } from '../validacao.js';

// Envio do modal: valida e responde com a pré-visualização efêmera.
export function tratarEnvioDoModal(interacao, env, ctx) {
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

  // Tipo, tamanho e quantidade vêm no payload, então dá para recusar antes de baixar nada.
  const resultadoImagens = validarImagensDoModal(interacao, campos[ID_CAMPO_IMAGENS]);
  if (resultadoImagens.erro) return mensagemEfemera(resultadoImagens.erro);

  const dados = {
    titulo,
    texto,
    link: resultadoLink.link,
    unix,
    // Sem escolha de menção ainda: o botão Publicar nasce desabilitado.
    escolha: null,
    autora: lerAutora(interacao),
  };

  if (!resultadoImagens.imagens.length) {
    return json({
      type: TIPO_RESPOSTA.MENSAGEM,
      data: {
        content: textoDaPrevia(null),
        embeds: [montarEmbedPrevia(dados)],
        components: montarComponentes({}),
        flags: EFEMERA,
        allowed_mentions: { parse: [] },
      },
    });
  }

  // Com imagens é preciso baixar os arquivos, o que não cabe nos 3 segundos.
  // A pré-visualização vai como mensagem de acompanhamento, em multipart.
  ctx.waitUntil(enviarPreviaComImagens(interacao, dados, resultadoImagens.imagens));
  return json({ type: TIPO_RESPOSTA.MENSAGEM_ADIADA, data: { flags: EFEMERA } });
}

async function enviarPreviaComImagens(interacao, dados, imagens) {
  const caminho = caminhoDeAcompanhamento(interacao.application_id, interacao.token);

  try {
    const arquivos = await baixarImagens(imagens);

    await enviarArquivos(caminho, {
      payload: {
        content: textoDaPrevia(null),
        embeds: [montarEmbedPrevia(dados)],
        components: montarComponentes({}),
        flags: EFEMERA,
        allowed_mentions: { parse: [] },
        attachments: arquivos.map((arquivo, indice) => ({ id: indice, filename: arquivo.nome })),
      },
      arquivos,
    });
  } catch (erro) {
    console.error('Falha ao preparar a pré-visualização com imagens:', erro);
    await concluirInteracao(interacao, 'Não consegui carregar as imagens. Use /anuncio de novo.');
  }
}

// Menus e botões da pré-visualização.
export function tratarComponente(interacao, env, ctx) {
  const acao = interacao.data?.custom_id;

  if (acao === ID_CANCELAR) {
    return atualizarMensagem({ content: 'Publicação cancelada.', embeds: [], components: [], attachments: [] });
  }

  const embed = interacao.message?.embeds?.[0];
  if (!embed) {
    // A pré-visualização é o estado inteiro. Sem ela, não dá para publicar nada.
    return mensagemEfemera('Não consegui ler a pré-visualização, use /anuncio de novo.');
  }

  if (acao === ID_MENU_MENCAO || acao === ID_MENU_REACAO) {
    const dados = lerEmbedPrevia(embed);
    const valor = interacao.data?.values?.[0];
    const atualizados = acao === ID_MENU_MENCAO
      ? { ...dados, escolha: valor }
      : { ...dados, reacao: valor };

    return atualizarMensagem({
      // O conteúdo precisa ir junto: o que não é enviado no update fica como estava.
      content: textoDaPrevia(atualizados.escolha),
      // A autora é relida da interação a cada passo, nunca do card.
      embeds: [montarEmbedPrevia({ ...atualizados, autora: lerAutora(interacao) })],
      components: montarComponentes({ escolha: atualizados.escolha, reacao: atualizados.reacao }),
      // Sem repetir esta lista, a API v10 apaga as imagens já anexadas.
      attachments: anexosParaManter(interacao.message),
      allowed_mentions: { parse: [] },
    });
  }

  if (acao === ID_PUBLICAR) {
    const dados = lerEmbedPrevia(embed);
    if (!dados.escolha) {
      return mensagemEfemera('Escolha no menu quem deve ser avisada antes de publicar.');
    }

    // Publicar chama a API, o que não cabe nos 3 segundos da primeira resposta.
    ctx.waitUntil(publicar(interacao, env, { ...dados, autora: lerAutora(interacao) }));
    return adiarAtualizacao();
  }

  return mensagemEfemera('Esse botão não existe mais, use /anuncio de novo.');
}

// Roda depois da resposta adiada: publica, reage, registra no log e fecha a interação.
async function publicar(interacao, env, dados) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;
  const mencao = mencaoParaPublicar(dados.escolha);
  const anexos = interacao.message?.attachments ?? [];

  let mensagem;
  try {
    // As imagens vêm dos anexos da própria pré-visualização, que são mídia efêmera.
    // Baixar antes de publicar garante que ou vai tudo, ou não vai nada.
    const arquivos = anexos.length ? await baixarImagens(anexos) : [];

    const payload = {
      // A menção precisa estar no conteúdo: menção dentro de embed não notifica.
      ...(mencao.content ? { content: mencao.content } : {}),
      embeds: [montarEmbedPublicado(dados)],
      allowed_mentions: mencao.allowed_mentions,
    };

    mensagem = arquivos.length
      ? await enviarArquivos(`/channels/${env.CANAL_ANUNCIOS_ID}/messages`, {
        token: env.DISCORD_TOKEN,
        payload: {
          ...payload,
          attachments: arquivos.map((arquivo, indice) => ({ id: indice, filename: arquivo.nome })),
        },
        arquivos,
      })
      : await criarMensagem(env.CANAL_ANUNCIOS_ID, payload, env.DISCORD_TOKEN);
  } catch (erro) {
    console.error('Falha ao publicar o anúncio:', erro);
    await concluirInteracao(interacao, 'Não consegui publicar o anúncio, tente de novo em instantes.');
    return;
  }

  // Daqui para baixo o anúncio já está no ar: nada pode desfazer isso.
  await deixarReacao(env, mensagem.id, dados.reacao);

  const link = linkDaMensagem(env.GUILD_ID, env.CANAL_ANUNCIOS_ID, mensagem.id);
  await registrarNoLog(env, { acao: 'Anúncio publicado', adminId, link });

  await concluirInteracao(interacao, `Anúncio publicado: ${link}`);
}

// Reagir é enfeite: falhar aqui não pode manchar uma publicação que deu certo.
async function deixarReacao(env, mensagemId, reacao) {
  const emoji = emojiDaReacao(reacao);
  if (!emoji) return;

  try {
    await reagir(env.CANAL_ANUNCIOS_ID, mensagemId, emoji, env.DISCORD_TOKEN);
  } catch (erro) {
    console.error('Falha ao reagir ao anúncio, a publicação seguiu normalmente:', erro);
  }
}
