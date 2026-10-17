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
  // Limpar só pergunta; quem esvazia é o Confirmar, e o Voltar desfaz a pergunta.
  LIMPAR: 'limpar',
  LIMPAR_CONFIRMAR: 'limpar-confirmar',
  LIMPAR_VOLTAR: 'limpar-voltar',
};

// A pergunta toma o lugar da linha de apoio enquanto a admin decide.
export const PERGUNTA_DE_LIMPEZA = 'Limpar todos os campos e as imagens? Menção e reação continuam.';

// O quarto pedaço, quando existe, é só para deixar o custom_id único: a leitura o ignora.
export const idDaAcao = (acao, modelo, unico) => `anuncio:${acao}:${modelo}${unico ? `:${unico}` : ''}`;

export function lerAcao(customId) {
  const [, acao, modelo] = String(customId ?? '').split(':');
  return { acao, modelo };
}

// Ids numéricos dos componentes do card, fixos por posição.
// Fora do container vêm menção, título, descrição e os campos marcados com
// `foraDoContainer` (o desconto e o cupom da parceria); dentro, os outros dados do
// modelo, a galeria, o botão e a autora no fim.
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

/**
 * Formulário do modelo, já preenchido quando é edição.
 * `unico` entra no custom_id para cada formulário aberto ser diferente do anterior.
 */
export function montarModalTexto(modelo, valores = {}, unico = null) {
  return {
    custom_id: idDaAcao(ACAO.MODAL_TEXTO, modelo.valor, unico),
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
export function montarModalImagens(modelo, unico = null) {
  return {
    custom_id: idDaAcao(ACAO.MODAL_IMAGENS, modelo.valor, unico),
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

  // O código vai sozinho num bloco de código, que facilita copiar. A crase tripla fica
  // em linhas próprias: colada no código, a primeira palavra viraria nome de linguagem.
  if (campo.formato === 'cupom') {
    return texto(`\`\`\`\n${valor}\n\`\`\``, id);
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
 * `confirmandoLimpeza` troca os botões por Confirmar e Voltar e trava os menus. O
 * card, a galeria e os menus continuam na mensagem porque são eles que guardam o
 * estado: é deles que o Voltar remonta a pré-visualização.
 */
export function montarCartao({
  modelo,
  valores,
  imagens = [],
  autora,
  escolha,
  reacao,
  controles = true,
  confirmandoLimpeza = false,
}) {
  // A posição em `ordemNoCard` define o id, esteja o campo dentro ou fora do container.
  const linhas = camposDoCard(modelo)
    .map((campo, posicao) => (valores[campo.id] ? { campo, linha: linhaDoCampo(campo, valores[campo.id], posicao) } : null))
    .filter(Boolean);
  const fora = linhas.filter((item) => item.campo.foraDoContainer).map((item) => item.linha);
  const dentro = linhas.filter((item) => !item.campo.foraDoContainer).map((item) => item.linha);

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

  // Fora do container: título, descrição e os campos que moram fora, nesta ordem.
  // Rascunho limpo não tem título: a linha some em vez de virar um "# " vazio.
  if (valores.titulo) cartao.push(texto(`# ${valores.titulo}`, IDS.TITULO));

  const campoDeDescricao = campoPorPapel(modelo, 'descricao');
  if (campoDeDescricao && valores[campoDeDescricao.id]) {
    cartao.push(texto(valores[campoDeDescricao.id], IDS.DESCRICAO));
  }

  cartao.push(...fora);
  cartao.push(container(CORES.ANUNCIO, dentro, IDS.CONTAINER));

  if (!controles) return cartao;

  // Menu travado continua com a opção marcada como `default`, então a leitura não muda.
  const menus = [
    menuDeSelecao({
      id: idDaAcao(ACAO.MENCAO, modelo.valor),
      convite: 'Quem deve ser avisada?',
      opcoes: opcoesDaLista(MENCOES, escolha),
      desabilitado: confirmandoLimpeza,
    }),
    menuDeSelecao({
      id: idDaAcao(ACAO.REACAO, modelo.valor),
      convite: 'Deixo alguma reação no anúncio?',
      opcoes: opcoesDaLista(REACOES, reacao ?? REACAO_PADRAO),
      desabilitado: confirmandoLimpeza,
    }),
  ];

  if (confirmandoLimpeza) {
    return [
      ...cartao,
      ...menus,
      linha([
        botao({ id: idDaAcao(ACAO.LIMPAR_CONFIRMAR, modelo.valor), rotulo: 'Confirmar', estilo: BOTAO_VERMELHO }),
        botao({ id: idDaAcao(ACAO.LIMPAR_VOLTAR, modelo.valor), rotulo: 'Voltar' }),
      ]),
    ];
  }

  const emBranco = estaEmBranco(modelo, valores) && !imagens.length;

  return [
    ...cartao,
    ...menus,
    linha([
      botao({ id: idDaAcao(ACAO.EDITAR_TEXTO, modelo.valor), rotulo: 'Editar texto' }),
      // A ação continua "editar-imagens": muda só o rótulo, e uma pré-visualização
      // aberta antes da troca segue funcionando. "Trocar" porque o que for enviado
      // substitui todas as imagens.
      botao({ id: idDaAcao(ACAO.EDITAR_IMAGENS, modelo.valor), rotulo: 'Trocar imagens' }),
      botao({
        id: idDaAcao(ACAO.PUBLICAR, modelo.valor),
        rotulo: 'Publicar',
        estilo: BOTAO_VERDE,
        desabilitado: !escolha || faltaPreencher(modelo, valores).length > 0,
      }),
      botao({ id: idDaAcao(ACAO.LIMPAR, modelo.valor), rotulo: 'Limpar', desabilitado: emBranco }),
      botao({ id: idDaAcao(ACAO.CANCELAR, modelo.valor), rotulo: 'Cancelar', estilo: BOTAO_VERMELHO }),
    ]),
  ];
}

/** Rótulos dos obrigatórios que estão vazios. */
export const faltaPreencher = (modelo, valores = {}) => modelo.campos
  .filter((campo) => campo.obrigatorio && !valores[campo.id])
  .map((campo) => campo.rotulo.toLowerCase());

/** Nenhum campo do modelo tem texto, como fica depois do Limpar. */
export const estaEmBranco = (modelo, valores = {}) => modelo.campos.every((campo) => !valores[campo.id]);

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
      // Lê o formato atual (só o bloco) e o antigo, que tinha "🎟️ **Use o código**"
      // numa linha antes do bloco, para uma pré-visualização aberta antes da troca.
      valores[campo.id] = conteudo
        .replace(/^(?!```)[^\n]*\n/, '')
        .replace(/^```\n?/, '')
        .replace(/\n?```$/, '');
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
// Com o rascunho em branco, ela diz como recomeçar, sem perder o aviso.
export function textoDaPrevia(escolha, { emBranco = false } = {}) {
  const aviso = escolha === 'here'
    ? 'Atenção: isso vai notificar todas as pessoas que estão online agora.'
    : 'Atenção: isso vai notificar todas as pessoas do servidor.';
  const ampla = MENCOES_AMPLAS.includes(escolha);

  if (emBranco) {
    const recomeco = 'Rascunho em branco. Toque em Editar texto para escrever o anúncio de novo.';
    return ampla ? `${recomeco}\n${aviso}` : recomeco;
  }
  return ampla ? aviso : 'Confira como vai ficar e escolha quem deve ser avisada.';
}
