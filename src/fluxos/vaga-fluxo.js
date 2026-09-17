// Fluxo do /vaga nova em Components V2: formulário, pré-visualização, publicação.

import { lerAutora } from '../autora.js';
import { lerCamposDoModal } from '../componentes/comum.js';
import {
  ACAO,
  MAXIMO_TITULO,
  SELECOES,
  faltaEscolher,
  lerAcao,
  lerCartao,
  montarCartao,
  montarErro,
  montarModal,
  tagsDasEscolhas,
  textoDaPrevia,
  textoSimples,
} from '../componentes/vaga-componentes.js';
import { FLAG_V2, texto } from '../componentes/v2.js';
import { criarPostNoForum, editarMensagem, linkDoPost } from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { TIPO_RESPOSTA, json, mensagemEfemera, modal } from '../respostas.js';
import { validarLink } from '../validacao.js';
import { ID_FRASE, adiarMensagem, atualizarPrevia, concluirV2, registrarFalha } from './previa-v2.js';

// Pré-visualização inteira: a linha de apoio em cima e o card com os controles.
const ID_APOIO = 8;

const previa = (estado) => [
  texto(textoDaPrevia(estado.escolhas), ID_APOIO),
  ...montarCartao({ controles: true, ...estado }),
];

const FLUXO = 'vaga';

// Adia e cria a pré-visualização pela edição da resposta original: mensagem em
// Components V2 não nasce pelo callback da interação (seção 12).
function criarPrevia(interacao, ctx, componentes) {
  ctx.waitUntil(atualizarPrevia(interacao, componentes, {}, FLUXO));
  return adiarMensagem();
}

// Envio do formulário.
export function tratarEnvioDoModal(interacao, env, ctx) {
  const campos = lerCamposDoModal(interacao.data?.components);
  const autora = lerAutora(interacao);

  const valores = {
    titulo: campos.titulo ?? '',
    empresa: campos.empresa ?? '',
    link: campos.link ?? '',
    local: campos.local ?? '',
    descricao: campos.descricao ?? '',
  };

  if (!valores.titulo || !valores.empresa) {
    registrarFalha(FLUXO, 'envio do formulário', 'título ou empresa em branco');
    return criarPrevia(interacao, ctx, montarErro({
      valores, autora,
      frase: 'Título do cargo e empresa são obrigatórios.',
    }));
  }

  const resultado = validarLink(valores.link, { obrigatorio: true });
  if (resultado.erro) {
    registrarFalha(FLUXO, 'envio do formulário', `link recusado: ${valores.link}`);
    return criarPrevia(interacao, ctx, montarErro({ valores, autora, frase: resultado.erro }));
  }
  valores.link = resultado.link;

  return criarPrevia(interacao, ctx, previa({ valores, escolhas: {}, autora }));
}

// Menus e botões da pré-visualização.
export function tratarComponente(interacao, env, ctx) {
  const { acao } = lerAcao(interacao.data?.custom_id);
  const componentes = interacao.message?.components ?? [];

  if (acao === ACAO.CANCELAR) {
    ctx.waitUntil(atualizarPrevia(interacao, [texto('Publicação cancelada.', ID_FRASE)], {}, FLUXO));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  const atual = lerCartao(componentes);

  if (acao === ACAO.CORRIGIR) {
    return modal(montarModal(atual.valores));
  }

  const selecao = SELECOES.find((item) => item.acao === acao);
  if (selecao) {
    const escolhas = { ...atual.escolhas, [selecao.chave]: interacao.data?.values?.[0] };

    ctx.waitUntil(atualizarPrevia(interacao, previa({ ...atual, escolhas }), {}, FLUXO));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  if (acao === ACAO.PUBLICAR) {
    const falta = faltaEscolher(atual.escolhas);
    if (falta.length) {
      registrarFalha(FLUXO, 'publicar', `escolhas faltando: ${falta.join(', ')}`);
      return mensagemEfemera(`Escolha ainda ${falta.join(', ')} antes de publicar.`);
    }

    // A autora da vaga é quem clicou em Publicar, conferida agora.
    ctx.waitUntil(publicar(interacao, env, { ...atual, autora: lerAutora(interacao) }));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  registrarFalha(FLUXO, 'componente', `ação desconhecida: ${interacao.data?.custom_id}`);
  return mensagemEfemera('Esse botão não existe mais, use /vaga nova de novo.');
}

/**
 * Cria o post no fórum e registra no log.
 * O post nasce com o texto simples, porque a criação não aceita a flag de
 * Components V2 (seção 12), e logo depois a primeira mensagem é editada para o card.
 */
async function publicar(interacao, env, estado) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;

  let post;
  try {
    post = await criarPostNoForum(
      env.CANAL_VAGAS_ID,
      {
        name: estado.valores.titulo.slice(0, MAXIMO_TITULO),
        applied_tags: tagsDasEscolhas(estado.escolhas),
        message: {
          content: textoSimples(estado),
          // Vaga não menciona ninguém.
          allowed_mentions: { parse: [] },
        },
      },
      env.DISCORD_TOKEN,
    );
  } catch (erro) {
    registrarFalha(FLUXO, 'criação do post no fórum', erro);
    await concluirV2(interacao, 'Não consegui publicar a vaga, tente de novo em instantes.', FLUXO);
    return;
  }

  // A partir daqui a vaga já está no ar: nada pode desfazer isso.
  const virouCartao = await trocarPeloCartao(env, post, estado);

  const link = linkDoPost(env.GUILD_ID, post.id);
  await registrarNoLog(env, { acao: 'Vaga publicada', adminId, link });

  await concluirV2(interacao, virouCartao
    ? `Vaga publicada: ${link}`
    : `Vaga publicada, mas ficou com o visual simples: ${link}`, FLUXO);
}

// Liga os componentes V2 na primeira mensagem do post. Falhar aqui não desfaz a vaga:
// o texto simples que foi publicado continua completo.
async function trocarPeloCartao(env, post, estado) {
  try {
    await editarMensagem(
      post.id,
      post.message?.id ?? post.id,
      {
        flags: FLAG_V2,
        components: montarCartao({ ...estado, controles: false }),
        // Ligando o V2, o conteúdo antigo precisa sair.
        content: null,
        embeds: [],
        allowed_mentions: { parse: [] },
      },
      env.DISCORD_TOKEN,
    );
    return true;
  } catch (erro) {
    registrarFalha(FLUXO, 'troca do post pelo card V2', erro);
    return false;
  }
}
