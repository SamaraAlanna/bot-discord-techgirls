// Fluxo do /anuncio: envio do modal, escolha do cargo, publicar e cancelar.

import {
  ID_CANCELAR,
  ID_MENU_CARGO,
  ID_PUBLICAR,
  cargoDaEscolha,
  lerCamposDoModal,
  lerEmbedPrevia,
  montarComponentes,
  montarEmbedPrevia,
  montarEmbedPublicado,
} from '../componentes/anuncio-componentes.js';
import { criarMensagem, editarRespostaOriginal, linkDaMensagem } from '../discord-api.js';
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
    aviso: campos.aviso || null,
    // Sem escolha ainda: o botão Publicar nasce desabilitado.
    cargo: undefined,
  });

  return json({
    type: TIPO_RESPOSTA.MENSAGEM,
    data: {
      content: 'Confira como vai ficar e escolha quem deve ser avisada.',
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

  if (acao === ID_MENU_CARGO) {
    const escolha = interacao.data?.values?.[0];
    const dados = lerEmbedPrevia(embed);

    return atualizarMensagem({
      embeds: [montarEmbedPrevia({ ...dados, cargo: cargoDaEscolha(escolha) })],
      components: montarComponentes({ escolha }),
    });
  }

  if (acao === ID_PUBLICAR) {
    const dados = lerEmbedPrevia(embed);
    if (!dados.escolheuCargo) {
      return mensagemEfemera('Escolha no menu quem deve ser avisada antes de publicar.');
    }

    // Publicar chama a API, o que não cabe nos 3 segundos da primeira resposta.
    ctx.waitUntil(publicar(interacao, env, dados));
    return adiarAtualizacao();
  }

  return mensagemEfemera('Esse botão não existe mais, use /anuncio de novo.');
}

// Roda depois da resposta adiada: publica, registra no log e fecha a interação.
async function publicar(interacao, env, dados) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;

  try {
    const mensagem = await criarMensagem(
      env.CANAL_ANUNCIOS_ID,
      {
        // A menção precisa estar no conteúdo: menção dentro de embed não notifica.
        ...(dados.cargoId ? { content: `<@&${dados.cargoId}>` } : {}),
        embeds: [montarEmbedPublicado(dados)],
        // parse vazio derruba @everyone e @here. A lista de cargos libera só o escolhido.
        allowed_mentions: dados.cargoId ? { parse: [], roles: [dados.cargoId] } : { parse: [] },
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
