// Fluxo do /anuncio em Components V2: formulário, pré-visualização, publicação.

import { anexosParaManter, baixarImagens, nomesDosAnexos, validarImagensDoModal } from '../anexos.js';
import { lerAutora } from '../autora.js';
import { lerCamposDoModal } from '../componentes/comum.js';
import {
  ACAO,
  CAMPO_IMAGENS,
  IDS,
  emojiDaReacao,
  lerAcao,
  lerCartao,
  mencaoParaPublicar,
  montarCartao,
  montarErro,
  montarModalImagens,
  montarModalTexto,
  textoDaPrevia,
  valoresParaOModal,
} from '../componentes/anuncio-componentes.js';
import { FLAG_V2, texto } from '../componentes/v2.js';
import { lerDataBrasilia } from '../datas.js';
import {
  caminhoDaRespostaOriginal,
  enviarArquivos,
  linkDaMensagem,
  reagir,
} from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { TIPO_RESPOSTA, json, mensagemEfemera, modal } from '../respostas.js';
import { FLAGS_PREVIA, atualizarPrevia, concluirV2, respostaV2 } from './previa-v2.js';
import { acharModelo, campoPorPapel } from '../modelos.js';
import { validarLink } from '../validacao.js';

// Pré-visualização inteira: a linha de apoio em cima e o card com os controles.
const previa = (modelo, estado) => [
  texto(textoDaPrevia(estado.escolha), IDS.APOIO),
  ...montarCartao({ modelo, controles: true, ...estado }),
];

// Envio de qualquer um dos formulários.
export function tratarEnvioDoModal(interacao, env, ctx) {
  const { acao, modelo: nome } = lerAcao(interacao.data?.custom_id);
  const modelo = acharModelo(nome);
  if (!modelo) return mensagemEfemera('Esse formulário é de uma versão antiga do bot, use /anuncio de novo.');

  if (acao === ACAO.MODAL_IMAGENS) return tratarEnvioDeImagens(interacao, ctx, modelo);
  return tratarEnvioDeTexto(interacao, modelo, ctx);
}

function tratarEnvioDeTexto(interacao, modelo, ctx) {
  const campos = lerCamposDoModal(interacao.data?.components);
  const autora = lerAutora(interacao);
  const anterior = interacao.message ? lerCartao(modelo, interacao.message.components) : null;

  const valores = {};
  for (const campo of modelo.campos) valores[campo.id] = campos[campo.id] ?? '';

  const faltando = modelo.campos.find((campo) => campo.obrigatorio && !valores[campo.id]);
  if (faltando) {
    return respostaV2(TIPO_RESPOSTA.MENSAGEM, montarErro({
      modelo, autora, valores,
      frase: `Falta preencher ${faltando.rotulo.toLowerCase()}, é um campo obrigatório.`,
    }));
  }

  const campoDeLink = campoPorPapel(modelo, 'link');
  if (campoDeLink) {
    const resultado = validarLink(valores[campoDeLink.id], { obrigatorio: campoDeLink.obrigatorio });
    if (resultado.erro) {
      return respostaV2(TIPO_RESPOSTA.MENSAGEM, montarErro({ modelo, autora, valores, frase: resultado.erro }));
    }
    valores[campoDeLink.id] = resultado.link ?? '';
  }

  const campoDeData = campoPorPapel(modelo, 'data');
  if (campoDeData && valores[campoDeData.id]) {
    const resultado = lerDataBrasilia(valores[campoDeData.id]);
    if (resultado.erro) {
      return respostaV2(TIPO_RESPOSTA.MENSAGEM, montarErro({ modelo, autora, valores, frase: resultado.erro }));
    }
    // No card a data vira timestamp, e é como unix que ela fica guardada.
    valores[campoDeData.id] = String(resultado.unix);
  }

  const componentes = previa(modelo, {
    valores,
    autora,
    // Editar texto nunca apaga imagem nem desfaz as escolhas dos menus.
    // Os nomes vêm dos anexos da mensagem, na ordem em que estão nela.
    imagens: nomesDosAnexos(interacao.message),
    escolha: anterior?.escolha ?? null,
    reacao: anterior?.reacao,
  });

  if (!interacao.message) {
    return respostaV2(TIPO_RESPOSTA.MENSAGEM, componentes);
  }

  // Edição de mensagem V2 também passa pelo endpoint de edição.
  ctx.waitUntil(atualizarPrevia(interacao, componentes, { attachments: anexosParaManter(interacao.message) }));
  return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
}

// Envio do formulário de imagens: o que veio substitui tudo que havia antes.
function tratarEnvioDeImagens(interacao, ctx, modelo) {
  const campos = lerCamposDoModal(interacao.data?.components);
  const atual = lerCartao(modelo, interacao.message?.components ?? []);

  const novas = validarImagensDoModal(interacao, campos[CAMPO_IMAGENS]);
  if (novas.erro) return mensagemEfemera(novas.erro);

  // Sem arquivo nenhum: o anúncio fica sem imagens, e isso não precisa de rede.
  if (!novas.imagens.length) {
    if (!nomesDosAnexos(interacao.message).length) return mensagemEfemera('Nada mudou nas imagens.');

    ctx.waitUntil(atualizarPrevia(interacao, previa(modelo, { ...atual, imagens: [] }), { attachments: [] }));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  ctx.waitUntil(trocarImagens(interacao, modelo, atual, novas.imagens));
  return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
}

async function trocarImagens(interacao, modelo, atual, novas) {
  const caminho = caminhoDaRespostaOriginal(interacao.application_id, interacao.token);

  try {
    const arquivos = await baixarImagens(novas);

    await enviarArquivos(caminho, {
      metodo: 'PATCH',
      arquivos,
      payload: {
        flags: FLAGS_PREVIA,
        // Texto e escolhas continuam como estavam: mexer em imagem não mexe no resto.
        components: previa(modelo, { ...atual, imagens: arquivos.map((arquivo) => arquivo.nome) }),
        // Só os arquivos novos entram na lista: os antigos saem da mensagem.
        attachments: arquivos.map((arquivo, indice) => ({ id: indice, filename: arquivo.nome })),
        allowed_mentions: { parse: [] },
      },
    });
  } catch (erro) {
    console.error('Falha ao trocar as imagens:', erro);
    await concluirV2(interacao, 'Não consegui carregar as imagens. Use /anuncio de novo.');
  }
}

// Menus e botões da pré-visualização.
export function tratarComponente(interacao, env, ctx) {
  const { acao, modelo: nome } = lerAcao(interacao.data?.custom_id);
  const modelo = acharModelo(nome);
  if (!modelo) return mensagemEfemera('Essa tela é de uma versão antiga do bot, use /anuncio de novo.');

  const componentes = interacao.message?.components ?? [];

  if (acao === ACAO.CANCELAR) {
    ctx.waitUntil(atualizarPrevia(interacao, [texto('Publicação cancelada.', IDS.FRASE)], { attachments: [] }));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  // O modal de imagens não depende do estado: responde direto, sem ler nada e sem rede.
  if (acao === ACAO.EDITAR_IMAGENS) {
    return modal(montarModalImagens(modelo));
  }

  const atual = lerCartao(modelo, componentes);

  if (acao === ACAO.EDITAR_TEXTO || acao === ACAO.CORRIGIR) {
    return modal(montarModalTexto(modelo, valoresParaOModal(modelo, atual.valores)));
  }

  if (acao === ACAO.MENCAO || acao === ACAO.REACAO) {
    const valor = interacao.data?.values?.[0];
    const escolha = acao === ACAO.MENCAO ? valor : atual.escolha;
    const reacao = acao === ACAO.REACAO ? valor : atual.reacao;

    ctx.waitUntil(atualizarPrevia(
      interacao,
      previa(modelo, {
        valores: atual.valores,
        autora: atual.autora,
        // A galeria é remontada a partir dos anexos que a mensagem já tem.
        imagens: nomesDosAnexos(interacao.message),
        escolha,
        reacao,
      }),
      { attachments: anexosParaManter(interacao.message) },
    ));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  if (acao === ACAO.PUBLICAR) {
    if (!atual.escolha) return mensagemEfemera('Escolha no menu quem deve ser avisada antes de publicar.');

    ctx.waitUntil(publicar(interacao, env, modelo, atual));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  return mensagemEfemera('Esse botão não existe mais, use /anuncio de novo.');
}

// Roda depois da resposta adiada: publica, reage, registra no log e fecha.
async function publicar(interacao, env, modelo, atual) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;
  const anexos = interacao.message?.attachments ?? [];

  let mensagem;
  try {
    // As imagens vêm dos anexos da interação do clique, que são mídia efêmera.
    const arquivos = anexos.length ? await baixarImagens(anexos) : [];

    mensagem = await enviarArquivos(`/channels/${env.CANAL_ANUNCIOS_ID}/messages`, {
      token: env.DISCORD_TOKEN,
      arquivos,
      payload: {
        flags: FLAG_V2,
        components: montarCartao({
          modelo,
          valores: atual.valores,
          autora: atual.autora,
          imagens: arquivos.map((arquivo) => arquivo.nome),
          escolha: atual.escolha,
          controles: false,
        }),
        allowed_mentions: mencaoParaPublicar(atual.escolha),
        ...(arquivos.length
          ? { attachments: arquivos.map((arquivo, indice) => ({ id: indice, filename: arquivo.nome })) }
          : {}),
      },
    });
  } catch (erro) {
    console.error('Falha ao publicar o anúncio:', erro);
    await concluirV2(interacao, 'Não consegui publicar o anúncio, tente de novo em instantes.');
    return;
  }

  // Daqui para baixo o anúncio já está no ar: nada pode desfazer isso.
  await deixarReacao(env, mensagem.id, atual.reacao);

  const link = linkDaMensagem(env.GUILD_ID, env.CANAL_ANUNCIOS_ID, mensagem.id);
  await registrarNoLog(env, { acao: 'Anúncio publicado', adminId, link });

  await concluirV2(interacao, `Anúncio publicado: ${link}`);
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
