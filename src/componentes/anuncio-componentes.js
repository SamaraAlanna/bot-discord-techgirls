// Montagem do /anuncio em Components V2: formulários, card e controles.
//
// O estado mora nos próprios componentes da pré-visualização (seção 7 do CLAUDE.md).
// Para não depender do texto visível, cada peça leva um `id` numérico fixo, definido
// aqui, e a leitura procura por esse id. O modelo escolhido viaja no custom_id.

import { MAXIMO_DE_IMAGENS, MAXIMO_EM_MB } from '../anexos.js';
import { CORES, MENCOES, MENCOES_AMPLAS, REACAO_PADRAO, REACOES } from '../config.js';
import { formatarBrasilia, lerUnixDoTexto, textoDeQuando } from '../datas.js';
import { campoPorPapel, camposDoCard } from '../modelos.js';
import { campoDeTexto, campoDeUpload, menuDeSelecao, opcoesDaLista } from './comum.js';
import {
  BOTAO_VERDE,
  BOTAO_VERMELHO,
  botao,
  botaoDeLink,
  container,
  galeria,
  linha,
  porId,
  texto,
} from './v2.js';

// Ações. O terceiro pedaço do custom_id é sempre o modelo.
export const ACAO = {
  MODAL_TEXTO: 'texto',
  MODAL_IMAGENS: 'imagens',
  EDITAR_TEXTO: 'editar-texto',
  EDITAR_IMAGENS: 'editar-imagens',
  MENCAO: 'mencao',
  REACAO: 'reacao',
  PUBLICAR: 'publicar',
  CANCELAR: 'cancelar',
  CORRIGIR: 'corrigir',
};

export const idDaAcao = (acao, modelo) => `anuncio:${acao}:${modelo}`;

export function lerAcao(customId) {
  const [, acao, modelo] = String(customId ?? '').split(':');
  return { acao, modelo };
}

// Ids numéricos dos componentes do card, fixos por posição.
// Fora do container vêm menção, título e descrição; dentro, os dados do modelo,
// a galeria, o botão e a autora no fim.
export const IDS = {
  MENCAO: 1,
  TITULO: 2,
  DESCRICAO: 3,
  CONTAINER: 4,
  GALERIA: 5,
  BOTAO_LINK: 6,
  AUTORA: 7,
  APOIO: 8,
  FRASE: 9,
  // Os campos do modelo começam no 10, na ordem de `ordemNoCard`.
  campo: (posicao) => 10 + posicao,
};

// Campo do modal de imagens.
export const CAMPO_IMAGENS = 'imagens';

/** Formulário do modelo, já preenchido quando é edição. */
export function montarModalTexto(modelo, valores = {}) {
  return {
    custom_id: idDaAcao(ACAO.MODAL_TEXTO, modelo.valor),
    title: modelo.tituloDoModal,
    components: modelo.campos.map((campo) => campoDeTexto({
      rotulo: campo.rotulo,
      id: campo.id,
      estilo: campo.estilo,
      obrigatorio: campo.obrigatorio,
      maximo: campo.maximo,
      ...(campo.descricao ? { descricao: campo.descricao } : {}),
      ...(campo.exemplo ? { exemplo: campo.exemplo } : {}),
      ...(valores[campo.id] ? { valor: valores[campo.id] } : {}),
    })),
  };
}

/**
 * Formulário de imagens: um campo só, o upload.
 * O que for enviado substitui todas as imagens do anúncio, e enviar vazio tira todas.
 * Nada de menu de remoção: ele era o único componente novo neste modal quando o
 * Discord passou a recusar a tela (seção 12).
 */
export function montarModalImagens(modelo) {
  return {
    custom_id: idDaAcao(ACAO.MODAL_IMAGENS, modelo.valor),
    title: 'Imagens do anúncio',
    components: [
      campoDeUpload({
        rotulo: 'Imagens',
        id: CAMPO_IMAGENS,
        obrigatorio: false,
        minimo: 0,
        maximo: MAXIMO_DE_IMAGENS,
        descricao: `Opcional. Até ${MAXIMO_DE_IMAGENS} imagens de até ${MAXIMO_EM_MB} MB. As novas substituem as atuais.`,
      }),
    ],
  };
}

// "📅 **Quando:** " na frente do valor. É por esse prefixo que o valor é relido.
const prefixoDoCampo = (campo) => `${campo.marca} **${campo.nome}:** `;

// Uma linha de conteúdo do card. Campo com marca ganha o rótulo na frente.
function linhaDoCampo(campo, valor, posicao) {
  const id = IDS.campo(posicao);

  if (campo.formato === 'cupom') {
    return texto(`🎟️ **Use o código**\n\`\`\`\n${valor}\n\`\`\``, id);
  }
  if (campo.papel === 'data') {
    // No card de erro a data pode estar ainda como a admin digitou, porque a
    // validação parou antes. Nesse caso ela aparece como texto mesmo.
    const conteudo = /^[0-9]+$/.test(valor) ? textoDeQuando(Number(valor)) : valor;
    return texto(`${prefixoDoCampo(campo)}${conteudo}`, id);
  }
  if (campo.marca) {
    return texto(`${prefixoDoCampo(campo)}${valor}`, id);
  }
  return texto(valor, id);
}

/**
 * Card do anúncio. `controles` liga os menus e botões da pré-visualização.
 * A menção fica num texto acima do container: numa mensagem V2 não existe `content`,
 * então é esse texto que notifica.
 */
export function montarCartao({ modelo, valores, imagens = [], autora, escolha, reacao, controles = true }) {
  const dentro = camposDoCard(modelo)
    .map((campo, posicao) => (valores[campo.id] ? linhaDoCampo(campo, valores[campo.id], posicao) : null))
    .filter(Boolean);

  if (imagens.length) dentro.push(galeria(imagens, IDS.GALERIA));

  const campoDeLink = campoPorPapel(modelo, 'link');
  // O botão vem logo depois do que veio antes, sem divisória nenhuma.
  if (campoDeLink && valores[campoDeLink.id]) {
    dentro.push(linha([botaoDeLink(modelo.rotuloDoBotao, valores[campoDeLink.id], IDS.BOTAO_LINK)]));
  }

  // A assinatura fecha o container. Components V2 não tem alinhamento (seção 12),
  // então ela fica à esquerda mesmo, só menor.
  dentro.push(texto(`-# Autora: <@${autora?.id ?? '0'}>`, IDS.AUTORA));

  const cartao = [];
  const mencao = MENCOES.find((item) => item.valor === escolha);
  if (mencao && escolha !== 'ninguem') {
    cartao.push(texto(mencao.id ? `<@&${mencao.id}>` : mencao.rotulo, IDS.MENCAO));
  }

  // Fora do container: título e descrição, nesta ordem.
  cartao.push(texto(`# ${valores.titulo}`, IDS.TITULO));

  const campoDeDescricao = campoPorPapel(modelo, 'descricao');
  if (campoDeDescricao && valores[campoDeDescricao.id]) {
    cartao.push(texto(valores[campoDeDescricao.id], IDS.DESCRICAO));
  }

  cartao.push(container(CORES.ANUNCIO, dentro, IDS.CONTAINER));

  if (!controles) return cartao;

  return [
    ...cartao,
    menuDeSelecao({
      id: idDaAcao(ACAO.MENCAO, modelo.valor),
      convite: 'Quem deve ser avisada?',
      opcoes: opcoesDaLista(MENCOES, escolha),
    }),
    menuDeSelecao({
      id: idDaAcao(ACAO.REACAO, modelo.valor),
      convite: 'Deixo alguma reação no anúncio?',
      opcoes: opcoesDaLista(REACOES, reacao ?? REACAO_PADRAO),
    }),
    linha([
      botao({ id: idDaAcao(ACAO.EDITAR_TEXTO, modelo.valor), rotulo: 'Editar texto' }),
      botao({ id: idDaAcao(ACAO.EDITAR_IMAGENS, modelo.valor), rotulo: 'Editar imagens' }),
      botao({
        id: idDaAcao(ACAO.PUBLICAR, modelo.valor),
        rotulo: 'Publicar',
        estilo: BOTAO_VERDE,
        desabilitado: !escolha,
      }),
      botao({ id: idDaAcao(ACAO.CANCELAR, modelo.valor), rotulo: 'Cancelar', estilo: BOTAO_VERMELHO }),
    ]),
  ];
}

// O card tem galeria? Serve para saber se há o que remover, sem precisar dos nomes.
export function temGaleria(componentes) {
  return Boolean(porId(componentes, new Map()).get(IDS.GALERIA));
}

/**
 * Endereços das imagens que a pré-visualização já tem.
 * Numa mensagem em Components V2 o arquivo apontado por um componente sai da lista
 * `attachments`, que volta sempre vazia: a galeria é a única fonte da verdade
 * sobre as imagens (seção 12). Aqui só se lê o endereço, nunca um nome de arquivo.
 */
export function urlsDaGaleria(componentes) {
  const galeriaAtual = porId(componentes, new Map()).get(IDS.GALERIA);
  return (galeriaAtual?.items ?? []).map((item) => item?.media?.url).filter(Boolean);
}

/** Card de erro: a frase, o rascunho do jeito que ficaria e o botão Corrigir. */
export function montarErro({ modelo, frase, valores, autora }) {
  return [
    texto(frase, IDS.FRASE),
    ...montarCartao({ modelo, valores, autora, controles: false }),
    linha([botao({ id: idDaAcao(ACAO.CORRIGIR, modelo.valor), rotulo: 'Corrigir', estilo: BOTAO_VERDE })]),
  ];
}

/**
 * Relê o estado a partir dos componentes, pelos ids numéricos.
 * O valor de cada campo vem sem o rótulo que o próprio código escreveu.
 * As imagens não saem daqui: elas vêm da própria galeria (`urlsDaGaleria`),
 * que o Discord devolve com o endereço do CDN já resolvido.
 */
export function lerCartao(modelo, componentes) {
  const indice = porId(componentes, new Map());
  const conteudoDe = (id) => indice.get(id)?.content ?? null;
  // O rótulo é montado pelo próprio código, então tirar o prefixo devolve o valor.
  const semPrefixo = (conteudo, campo) => String(conteudo ?? '').replace(prefixoDoCampo(campo), '');

  const valores = {};
  const titulo = conteudoDe(IDS.TITULO);
  if (titulo !== null) valores.titulo = titulo.replace(/^# /, '');

  const campoDeDescricao = campoPorPapel(modelo, 'descricao');
  if (campoDeDescricao) valores[campoDeDescricao.id] = conteudoDe(IDS.DESCRICAO) ?? '';

  camposDoCard(modelo).forEach((campo, posicao) => {
    const conteudo = conteudoDe(IDS.campo(posicao));
    if (conteudo === null) return;

    if (campo.formato === 'cupom') {
      valores[campo.id] = conteudo.replace(/^[^\n]*\n```\n?/, '').replace(/\n?```$/, '');
      return;
    }
    if (campo.papel === 'data') {
      const unix = lerUnixDoTexto(conteudo);
      valores[campo.id] = unix ? String(unix) : semPrefixo(conteudo, campo);
      return;
    }
    valores[campo.id] = campo.marca ? semPrefixo(conteudo, campo) : conteudo;
  });

  const campoDeLink = campoPorPapel(modelo, 'link');
  if (campoDeLink) valores[campoDeLink.id] = indice.get(IDS.BOTAO_LINK)?.url ?? '';

  return {
    valores,
    autora: lerAutora(indice),
    escolha: escolhaDoMenu(componentes, ACAO.MENCAO, modelo.valor),
    reacao: escolhaDoMenu(componentes, ACAO.REACAO, modelo.valor) ?? REACAO_PADRAO,
  };
}

function lerAutora(indice) {
  const conteudo = indice.get(IDS.AUTORA)?.content ?? '';
  return { id: conteudo.match(/<@(\d+)>/)?.[1] ?? null };
}

// A escolha dos menus fica marcada como `default` na própria opção.
function escolhaDoMenu(componentes, acao, modelo) {
  const procurados = [];
  const visitar = (lista) => {
    for (const item of lista ?? []) {
      if (item.custom_id === idDaAcao(acao, modelo)) procurados.push(item);
      if (item.components) visitar(item.components);
    }
  };
  visitar(componentes);

  return procurados[0]?.options?.find((opcao) => opcao.default)?.value ?? null;
}

// Valores do card traduzidos de volta para o formulário.
export function valoresParaOModal(modelo, valores) {
  const preenchidos = { ...valores };
  const campoDeData = campoPorPapel(modelo, 'data');

  if (campoDeData && /^\d+$/.test(preenchidos[campoDeData.id] ?? '')) {
    preenchidos[campoDeData.id] = formatarBrasilia(Number(preenchidos[campoDeData.id]));
  }
  return preenchidos;
}

/** allowed_mentions da publicação, liberando só a menção escolhida. */
export function mencaoParaPublicar(escolha) {
  const opcao = MENCOES.find((item) => item.valor === escolha);

  // "users" nunca entra no parse, então a menção da autora no card não notifica.
  if (opcao?.id) return { parse: [], roles: [opcao.id] };
  if (escolha === 'everyone' || escolha === 'here') return { parse: ['everyone'] };
  return { parse: [] };
}

export function emojiDaReacao(reacao) {
  return REACOES.find((item) => item.valor === reacao)?.caractere ?? null;
}

// Linha de apoio acima do card, com o aviso das menções que alcançam o servidor.
export function textoDaPrevia(escolha) {
  if (!MENCOES_AMPLAS.includes(escolha)) {
    return 'Confira como vai ficar e escolha quem deve ser avisada.';
  }
  return escolha === 'here'
    ? 'Atenção: isso vai notificar todas as pessoas que estão online agora.'
    : 'Atenção: isso vai notificar todas as pessoas do servidor.';
}
