// Montagem do modal, do card e dos componentes do fluxo de anúncio.
// A pré-visualização é também o lugar onde o estado mora (seção 7 do CLAUDE.md):
// o que está no embed é o que vai ser publicado.

import { CORES, MENCOES, MENCOES_AMPLAS, RODAPE } from '../config.js';
import { lerUnixDoTexto, textoDeQuando } from '../datas.js';

// Tipos de componente da API.
const ACTION_ROW = 1;
const BOTAO = 2;
const MENU_DE_TEXTO = 3;
const CAMPO_DE_TEXTO = 4;
const LABEL = 18;

// Estilos de campo de texto e de botão.
const CURTO = 1;
const PARAGRAFO = 2;
const BOTAO_VERDE = 3;
const BOTAO_VERMELHO = 4;

export const ID_MODAL = 'anuncio:modal';
export const ID_MENU_MENCAO = 'anuncio:mencao';
export const ID_PUBLICAR = 'anuncio:publicar';
export const ID_CANCELAR = 'anuncio:cancelar';

// Nomes dos campos do embed. São também as chaves do estado, então mudar um
// nome aqui invalida as pré-visualizações que estiverem abertas.
const CAMPO_LINK = 'Link';
const CAMPO_QUANDO = 'Quando';
const CAMPO_AVISO = 'Aviso de conteúdo';
const CAMPO_MENCAO = 'Mencionar';

const SEM_ESCOLHA = 'Ainda não escolhido';

/**
 * Subtexto do Discord: deixa a linha menor e cinza.
 * Se não renderizar dentro do embed (seção 12), trocar por itálico aqui:
 * `(texto) => `*${texto}*``. É o único lugar que precisa mudar.
 */
const discreto = (texto) => `-# ${texto}`;

// Um campo de texto do modal, embrulhado no Label (type 18).
// O `label` do próprio campo de texto está deprecated, por isso ele vem do Label.
function campoDeTexto({ rotulo, descricao, id, estilo, obrigatorio, exemplo, maximo }) {
  return {
    type: LABEL,
    label: rotulo,
    ...(descricao ? { description: descricao } : {}),
    component: {
      type: CAMPO_DE_TEXTO,
      custom_id: id,
      style: estilo,
      required: obrigatorio,
      ...(exemplo ? { placeholder: exemplo } : {}),
      ...(maximo ? { max_length: maximo } : {}),
    },
  };
}

// O modal aceita no máximo 5 componentes de topo, e são exatamente 5 campos.
export function montarModal() {
  return {
    custom_id: ID_MODAL,
    title: 'Novo anúncio',
    components: [
      campoDeTexto({
        rotulo: 'Título', id: 'titulo', estilo: CURTO, obrigatorio: true, maximo: 200,
        exemplo: 'Mentoria de carreira em abril',
      }),
      campoDeTexto({
        rotulo: 'Texto', id: 'texto', estilo: PARAGRAFO, obrigatorio: true, maximo: 3000,
        descricao: 'O corpo do anúncio, do jeito que as membras vão ler.',
      }),
      campoDeTexto({
        rotulo: 'Link (opcional)', id: 'link', estilo: CURTO, obrigatorio: false, maximo: 500,
        exemplo: 'https://',
      }),
      campoDeTexto({
        rotulo: 'Data e hora (opcional)', id: 'quando', estilo: CURTO, obrigatorio: false, maximo: 20,
        descricao: 'Formato DD/MM/AAAA HH:MM, horário de Brasília.',
        exemplo: '15/10/2026 19:00',
      }),
      campoDeTexto({
        rotulo: 'Aviso de conteúdo (opcional)', id: 'aviso', estilo: CURTO, obrigatorio: false, maximo: 200,
        descricao: 'Aparece antes do texto, para quem precisa escolher se quer ler.',
      }),
    ],
  };
}

/**
 * Lê os valores enviados no modal. A doc mostra o campo de texto aninhado dentro
 * do Label, mas percorremos a árvore inteira: se o formato mudar, continua funcionando.
 */
export function lerCamposDoModal(componentes, destino = {}) {
  for (const componente of componentes ?? []) {
    if (componente.custom_id && typeof componente.value === 'string') {
      destino[componente.custom_id] = componente.value.trim();
    }
    if (componente.component) lerCamposDoModal([componente.component], destino);
    if (componente.components) lerCamposDoModal(componente.components, destino);
  }
  return destino;
}

// Texto que representa cada escolha dentro do card. É daqui que a escolha é relida
// na hora de publicar. Menção dentro de embed não notifica ninguém.
function textoDaEscolha(escolha) {
  const opcao = MENCOES.find((item) => item.valor === escolha);
  if (!opcao) return SEM_ESCOLHA;
  if (opcao.id) return `<@&${opcao.id}>`;
  return opcao.rotulo;
}

function escolhaDoTexto(texto) {
  if (!texto || texto === SEM_ESCOLHA) return null;

  const porCargo = texto.match(/<@&(\d+)>/)?.[1];
  if (porCargo) return MENCOES.find((item) => item.id === porCargo)?.valor ?? null;

  return MENCOES.find((item) => !item.id && item.rotulo === texto)?.valor ?? null;
}

// Card de pré-visualização. Guarda tudo que o botão Publicar precisa depois.
export function montarEmbedPrevia({ titulo, texto, link, unix, aviso, escolha }) {
  const campos = [];

  if (link) campos.push({ name: CAMPO_LINK, value: link });
  if (unix) campos.push({ name: CAMPO_QUANDO, value: textoDeQuando(unix) });
  if (aviso) campos.push({ name: CAMPO_AVISO, value: aviso });
  campos.push({ name: CAMPO_MENCAO, value: textoDaEscolha(escolha) });

  return {
    color: CORES.ANUNCIO,
    title: titulo,
    description: texto,
    fields: campos,
    footer: RODAPE,
  };
}

// Caminho inverso: recupera o estado guardado no card.
export function lerEmbedPrevia(embed) {
  const valor = (nome) => embed.fields?.find((campo) => campo.name === nome)?.value ?? null;

  return {
    titulo: embed.title ?? '',
    texto: embed.description ?? '',
    link: valor(CAMPO_LINK),
    unix: lerUnixDoTexto(valor(CAMPO_QUANDO)),
    aviso: valor(CAMPO_AVISO),
    escolha: escolhaDoTexto(valor(CAMPO_MENCAO)),
  };
}

// Card que vai para o canal de avisos: sem o campo de controle "Mencionar",
// e com o aviso de conteúdo discreto, antes do texto.
export function montarEmbedPublicado({ titulo, texto, link, unix, aviso }) {
  const campos = [];
  if (link) campos.push({ name: CAMPO_LINK, value: link });
  if (unix) campos.push({ name: CAMPO_QUANDO, value: textoDeQuando(unix) });

  return {
    color: CORES.ANUNCIO,
    title: titulo,
    description: aviso ? `${discreto(`Este anúncio fala sobre: ${aviso}`)}\n\n${texto}` : texto,
    ...(campos.length ? { fields: campos } : {}),
    footer: RODAPE,
  };
}

// Menu de menção e botões. O Publicar só habilita depois de uma escolha explícita,
// para ninguém publicar achando que avisou alguém, nem notificar o servidor sem querer.
export function montarComponentes({ escolha } = {}) {
  const opcoes = MENCOES.map((item) => ({
    label: item.rotulo,
    value: item.valor,
    description: item.descricao,
    ...(item.emoji ? { emoji: { name: item.emoji } } : {}),
    default: escolha === item.valor,
  }));

  return [
    {
      type: ACTION_ROW,
      components: [{
        type: MENU_DE_TEXTO,
        custom_id: ID_MENU_MENCAO,
        placeholder: 'Quem deve ser avisada?',
        options: opcoes,
      }],
    },
    {
      type: ACTION_ROW,
      components: [
        {
          type: BOTAO,
          style: BOTAO_VERDE,
          custom_id: ID_PUBLICAR,
          label: 'Publicar',
          disabled: !escolha,
        },
        { type: BOTAO, style: BOTAO_VERMELHO, custom_id: ID_CANCELAR, label: 'Cancelar' },
      ],
    },
  ];
}

/**
 * Conteúdo e allowed_mentions da mensagem publicada.
 * O content carrega só a menção escolhida, e o allowed_mentions libera só ela:
 * as duas travas precisam concordar para ninguém ser notificado por engano.
 */
export function mencaoParaPublicar(escolha) {
  const opcao = MENCOES.find((item) => item.valor === escolha);

  if (opcao?.id) {
    return { content: `<@&${opcao.id}>`, allowed_mentions: { parse: [], roles: [opcao.id] } };
  }
  // O tipo "everyone" do parse cobre @everyone e @here, e o content tem só uma das duas.
  if (escolha === 'everyone') return { content: '@everyone', allowed_mentions: { parse: ['everyone'] } };
  if (escolha === 'here') return { content: '@here', allowed_mentions: { parse: ['everyone'] } };

  return { content: null, allowed_mentions: { parse: [] } };
}

// Linha que acompanha a pré-visualização. Avisa quando a escolha alcança o servidor inteiro.
export function textoDaPrevia(escolha) {
  if (!MENCOES_AMPLAS.includes(escolha)) {
    return 'Confira como vai ficar e escolha quem deve ser avisada.';
  }
  return escolha === 'here'
    ? 'Atenção: isso vai notificar todas as pessoas que estão online agora.'
    : 'Atenção: isso vai notificar todas as pessoas do servidor.';
}
