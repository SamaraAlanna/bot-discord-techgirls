// Montagem do modal, do card e dos componentes do fluxo de vaga.
// Como no anúncio, a pré-visualização carrega o estado (seção 7 do CLAUDE.md).

import { CORES, RODAPE, TAGS_AREA, TAGS_MODALIDADE, TAGS_SENIORIDADE } from '../config.js';
import { validarLink } from '../validacao.js';
import {
  CURTO,
  PARAGRAFO,
  autoriaDoEmbed,
  campoDeTexto,
  linhaDeBotoes,
  menuDeSelecao,
  opcoesDaLista,
} from './comum.js';

export const ID_MODAL = 'vaga:modal';
export const ID_PUBLICAR = 'vaga:publicar';
export const ID_CANCELAR = 'vaga:cancelar';

// Nomes dos campos do embed. São também as chaves do estado, então mudar um
// nome aqui invalida as pré-visualizações que estiverem abertas.
const CAMPO_EMPRESA = 'Empresa';
const CAMPO_LOCAL = 'Localização';
const CAMPO_LINK = 'Link';

const SEM_ESCOLHA = 'Ainda não escolhido';

/**
 * As três seleções, cada uma ligada à sua lista de tags do config.js.
 * A ordem aqui é a ordem dos menus na tela.
 */
export const SELECOES = [
  { chave: 'area', id: 'vaga:area', campo: 'Área', convite: 'Qual é a área?', lista: TAGS_AREA },
  {
    chave: 'senioridade',
    id: 'vaga:senioridade',
    campo: 'Senioridade',
    convite: 'Qual é a senioridade?',
    lista: TAGS_SENIORIDADE,
  },
  {
    chave: 'modalidade',
    id: 'vaga:modalidade',
    campo: 'Modalidade',
    convite: 'É remoto, híbrido ou presencial?',
    lista: TAGS_MODALIDADE,
  },
];

// O título do cargo vira o nome do post no fórum, que aceita de 1 a 100 caracteres.
const MAXIMO_TITULO = 100;

export function montarModal() {
  return {
    custom_id: ID_MODAL,
    title: 'Nova vaga',
    components: [
      campoDeTexto({
        rotulo: 'Título do cargo', id: 'titulo', estilo: CURTO, obrigatorio: true, maximo: MAXIMO_TITULO,
        exemplo: 'Pessoa Desenvolvedora Back-end',
      }),
      campoDeTexto({
        rotulo: 'Empresa', id: 'empresa', estilo: CURTO, obrigatorio: true, maximo: 100,
      }),
      campoDeTexto({
        rotulo: 'Link da vaga', id: 'link', estilo: CURTO, obrigatorio: true, maximo: 500,
        descricao: 'Precisa começar com https://.',
        exemplo: 'https://',
      }),
      campoDeTexto({
        rotulo: 'Localização', id: 'local', estilo: CURTO, obrigatorio: true, maximo: 100,
        exemplo: 'São Paulo, SP ou Brasil',
      }),
      campoDeTexto({
        rotulo: 'Descrição curta', id: 'descricao', estilo: PARAGRAFO, obrigatorio: true, maximo: 1500,
        descricao: 'O suficiente para decidir se vale candidatar-se.',
      }),
    ],
  };
}

// Rótulo que aparece no card para cada seleção, e o caminho de volta.
function rotuloDaEscolha(lista, valor) {
  return lista.find((item) => item.valor === valor)?.rotulo ?? SEM_ESCOLHA;
}

function escolhaDoRotulo(lista, rotulo) {
  return lista.find((item) => item.rotulo === rotulo)?.valor ?? null;
}

// O emoji fica junto do título para o card ficar igual ao formato da seção 9.5.
const tituloDoCard = (titulo) => `💼 ${titulo}`;

// Card de pré-visualização: um campo por informação, para dar para reler tudo depois.
export function montarEmbedPrevia({ titulo, empresa, local, link, descricao, escolhas = {}, autora }) {
  const campos = [
    { name: CAMPO_EMPRESA, value: empresa, inline: true },
    { name: CAMPO_LOCAL, value: local, inline: true },
    { name: CAMPO_LINK, value: link },
    ...SELECOES.map((selecao) => ({
      name: selecao.campo,
      value: rotuloDaEscolha(selecao.lista, escolhas[selecao.chave]),
      inline: true,
    })),
  ];

  return {
    color: CORES.VAGA,
    title: tituloDoCard(titulo),
    description: descricao,
    fields: campos,
    ...autoriaDoEmbed(autora),
    footer: RODAPE,
  };
}

// Caminho inverso: recupera o estado guardado no card.
export function lerEmbedPrevia(embed) {
  const valor = (nome) => embed.fields?.find((campo) => campo.name === nome)?.value ?? null;
  const escolhas = {};
  for (const selecao of SELECOES) {
    escolhas[selecao.chave] = escolhaDoRotulo(selecao.lista, valor(selecao.campo));
  }

  return {
    titulo: (embed.title ?? '').replace(tituloDoCard(''), ''),
    descricao: embed.description ?? '',
    empresa: valor(CAMPO_EMPRESA),
    local: valor(CAMPO_LOCAL),
    link: valor(CAMPO_LINK),
    escolhas,
  };
}

// Só falta escolher o quê? Serve para habilitar o botão e para o texto de apoio.
export function faltaEscolher(escolhas = {}) {
  return SELECOES.filter((selecao) => !escolhas[selecao.chave]).map((selecao) => selecao.campo.toLowerCase());
}

/**
 * Card do post, no formato da seção 9.5. O domínio aparece em negrito para ajudar a
 * identificar golpe, e o link completo fica logo abaixo, clicável e igual ao digitado.
 */
export function montarEmbedPublicado({ titulo, empresa, local, link, descricao, escolhas, autora }) {
  const modalidade = rotuloDaEscolha(TAGS_MODALIDADE, escolhas.modalidade);
  const dominio = validarLink(link).dominio ?? link;

  const linhas = [
    `${empresa} · ${local} (${modalidade})`,
    '',
    descricao,
    '',
    `🔗 Candidatar-se: **${dominio}**`,
    link,
  ];

  return {
    color: CORES.VAGA,
    title: tituloDoCard(titulo),
    description: linhas.join('\n'),
    ...autoriaDoEmbed(autora),
    footer: RODAPE,
  };
}

// As tags vão por ID, nunca por nome: renomear a tag no servidor não pode quebrar o post.
export function tagsDasEscolhas(escolhas = {}) {
  return SELECOES
    .map((selecao) => selecao.lista.find((item) => item.valor === escolhas[selecao.chave])?.id)
    .filter(Boolean);
}

/**
 * Payload do post de fórum: nome do post, tags aplicadas e a primeira mensagem.
 * Vaga não menciona ninguém, então o allowed_mentions vai vazio.
 */
export function montarPost(dados) {
  return {
    name: dados.titulo.slice(0, MAXIMO_TITULO),
    applied_tags: tagsDasEscolhas(dados.escolhas),
    message: {
      embeds: [montarEmbedPublicado(dados)],
      allowed_mentions: { parse: [] },
    },
  };
}

// Três menus e a linha de botões. Publicar só habilita com as três escolhas feitas.
export function montarComponentes({ escolhas = {} } = {}) {
  return [
    ...SELECOES.map((selecao) => menuDeSelecao({
      id: selecao.id,
      convite: selecao.convite,
      opcoes: opcoesDaLista(selecao.lista, escolhas[selecao.chave]),
    })),
    linhaDeBotoes({
      idPublicar: ID_PUBLICAR,
      idCancelar: ID_CANCELAR,
      habilitado: faltaEscolher(escolhas).length === 0,
    }),
  ];
}

// Linha de apoio acima do card, que vai encurtando conforme as escolhas são feitas.
export function textoDaPrevia(escolhas = {}) {
  const falta = faltaEscolher(escolhas);
  if (!falta.length) return 'Confira como vai ficar e publique quando estiver boa.';

  return `Confira como vai ficar e escolha ainda: ${falta.join(', ')}.`;
}
