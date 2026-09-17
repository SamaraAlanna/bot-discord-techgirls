// Montagem do /vaga em Components V2: formulário, card e controles.
//
// Como no /anuncio, o estado mora nos próprios componentes e cada peça leva um `id`
// numérico fixo. As três escolhas ficam marcadas como `default` nos próprios menus.

import { CORES, TAGS_AREA, TAGS_MODALIDADE, TAGS_SENIORIDADE } from '../config.js';
import { validarLink } from '../validacao.js';
import { CURTO, PARAGRAFO, campoDeTexto, menuDeSelecao, opcoesDaLista } from './comum.js';
import {
  BOTAO_VERDE,
  BOTAO_VERMELHO,
  assinatura,
  botao,
  botaoDeLink,
  container,
  linha,
  linhaDeDado,
  lerIdDaAutora,
  porId,
  semPrefixo,
  texto,
} from './v2.js';

export const ACAO = {
  MODAL: 'nova',
  CORRIGIR: 'corrigir',
  PUBLICAR: 'publicar',
  CANCELAR: 'cancelar',
};

export const idDaAcao = (acao) => `vaga:${acao}`;

export function lerAcao(customId) {
  const [, acao] = String(customId ?? '').split(':');
  return { acao };
}

// Ids fixos: fora do container o título, a empresa e a descrição; dentro os dados,
// a linha do domínio, o botão e a assinatura.
export const IDS = {
  TITULO: 1,
  EMPRESA: 2,
  DESCRICAO: 3,
  CONTAINER: 4,
  DOMINIO: 5,
  BOTAO_LINK: 6,
  AUTORA: 7,
  AREA: 10,
  SENIORIDADE: 11,
  MODALIDADE: 12,
  LOCAL: 13,
};

const SEM_ESCOLHA = 'Ainda não escolhido';

// Mesmo id de frase avulsa usado pelo /anuncio, definido em fluxos/previa-v2.js.
const ID_FRASE = 9;

// As três seleções, cada uma ligada à sua lista de tags do config.js.
export const SELECOES = [
  { chave: 'area', acao: 'area', marca: '🧭', rotulo: 'Área', convite: 'Qual é a área?', lista: TAGS_AREA, id: 10 },
  {
    chave: 'senioridade',
    acao: 'senioridade',
    marca: '📊',
    rotulo: 'Senioridade',
    convite: 'Qual é a senioridade?',
    lista: TAGS_SENIORIDADE,
    id: 11,
  },
  {
    chave: 'modalidade',
    acao: 'modalidade',
    marca: '🏠',
    rotulo: 'Modalidade',
    convite: 'É remoto, híbrido ou presencial?',
    lista: TAGS_MODALIDADE,
    id: 12,
  },
];

// O título do cargo vira o nome do post no fórum, que aceita de 1 a 100 caracteres.
export const MAXIMO_TITULO = 100;

export function montarModal(valores = {}) {
  const campo = (id, rotulo, estilo, obrigatorio, maximo, extras = {}) => campoDeTexto({
    rotulo, id, estilo, obrigatorio, maximo,
    ...extras,
    ...(valores[id] ? { valor: valores[id] } : {}),
  });

  return {
    custom_id: idDaAcao(ACAO.MODAL),
    title: 'Nova vaga',
    components: [
      campo('titulo', 'Título do cargo', CURTO, true, MAXIMO_TITULO, { exemplo: 'Pessoa Desenvolvedora Back-end' }),
      campo('empresa', 'Empresa', CURTO, true, 100),
      campo('link', 'Link da vaga', CURTO, true, 500, {
        descricao: 'Precisa começar com https://.',
        exemplo: 'https://',
      }),
      campo('local', 'Localização (opcional)', CURTO, false, 100, {
        descricao: 'Opcional para remoto. Se for híbrido ou presencial, informe a cidade.',
        exemplo: 'São Paulo, SP',
      }),
      campo('descricao', 'Descrição curta (opcional)', PARAGRAFO, false, 1500, {
        descricao: 'O suficiente para decidir se vale candidatar-se.',
      }),
    ],
  };
}

const rotuloDaEscolha = (lista, valor) => lista.find((item) => item.valor === valor)?.rotulo ?? SEM_ESCOLHA;

/**
 * Card da vaga, no formato da seção 9.5.
 * `controles` liga os menus e botões da pré-visualização.
 */
export function montarCartao({ valores, escolhas = {}, autora, controles = true }) {
  const dentro = SELECOES.map((selecao) => linhaDeDado(
    selecao.marca,
    selecao.rotulo,
    rotuloDaEscolha(selecao.lista, escolhas[selecao.chave]),
    selecao.id,
  ));

  if (valores.local) dentro.push(linhaDeDado('📍', 'Local', valores.local, IDS.LOCAL));

  // O domínio em destaque ajuda a identificar golpe; o link completo fica no botão.
  const dominio = validarLink(valores.link).dominio;
  if (dominio) dentro.push(texto(`🔗 Candidatar-se em **${dominio}**`, IDS.DOMINIO));
  if (valores.link) dentro.push(linha([botaoDeLink('Candidatar-se', valores.link, IDS.BOTAO_LINK)]));

  dentro.push(assinatura(autora?.id, IDS.AUTORA));

  const cartao = [
    texto(`# 💼 ${valores.titulo}`, IDS.TITULO),
    texto(`**${valores.empresa}**`, IDS.EMPRESA),
  ];
  if (valores.descricao) cartao.push(texto(valores.descricao, IDS.DESCRICAO));
  cartao.push(container(CORES.VAGA, dentro, IDS.CONTAINER));

  if (!controles) return cartao;

  return [
    ...cartao,
    ...SELECOES.map((selecao) => menuDeSelecao({
      id: idDaAcao(selecao.acao),
      convite: selecao.convite,
      opcoes: opcoesDaLista(selecao.lista, escolhas[selecao.chave]),
    })),
    linha([
      botao({
        id: idDaAcao(ACAO.PUBLICAR),
        rotulo: 'Publicar',
        estilo: BOTAO_VERDE,
        desabilitado: faltaEscolher(escolhas).length > 0,
      }),
      botao({ id: idDaAcao(ACAO.CANCELAR), rotulo: 'Cancelar', estilo: BOTAO_VERMELHO }),
    ]),
  ];
}

/** Card de erro: a frase, o rascunho do jeito que ficaria e o botão Corrigir. */
export function montarErro({ frase, valores, autora }) {
  return [
    texto(frase, ID_FRASE),
    ...montarCartao({ valores, autora, controles: false }),
    linha([botao({ id: idDaAcao(ACAO.CORRIGIR), rotulo: 'Corrigir', estilo: BOTAO_VERDE })]),
  ];
}

/** Relê o estado dos componentes: texto pelos ids, escolhas pelo `default` dos menus. */
export function lerCartao(componentes) {
  const indice = porId(componentes, new Map());
  const conteudoDe = (id) => indice.get(id)?.content ?? null;

  const valores = {
    titulo: (conteudoDe(IDS.TITULO) ?? '').replace(/^# 💼 /, ''),
    empresa: (conteudoDe(IDS.EMPRESA) ?? '').replace(/^\*\*|\*\*$/g, ''),
    descricao: conteudoDe(IDS.DESCRICAO) ?? '',
    local: semPrefixo(conteudoDe(IDS.LOCAL), '📍', 'Local'),
    link: indice.get(IDS.BOTAO_LINK)?.url ?? '',
  };

  const escolhas = {};
  for (const selecao of SELECOES) {
    escolhas[selecao.chave] = escolhaDoMenu(componentes, selecao.acao);
  }

  return { valores, escolhas, autora: { id: lerIdDaAutora(conteudoDe(IDS.AUTORA)) } };
}

function escolhaDoMenu(componentes, acao) {
  const achados = [];
  const visitar = (lista) => {
    for (const item of lista ?? []) {
      if (item.custom_id === idDaAcao(acao)) achados.push(item);
      if (item.components) visitar(item.components);
    }
  };
  visitar(componentes);

  return achados[0]?.options?.find((opcao) => opcao.default)?.value ?? null;
}

// Só falta escolher o quê? Serve para travar o botão e para o texto de apoio.
export function faltaEscolher(escolhas = {}) {
  return SELECOES.filter((selecao) => !escolhas[selecao.chave]).map((selecao) => selecao.rotulo.toLowerCase());
}

// As tags vão por ID, nunca por nome: renomear a tag no servidor não pode quebrar o post.
export function tagsDasEscolhas(escolhas = {}) {
  return SELECOES
    .map((selecao) => selecao.lista.find((item) => item.valor === escolhas[selecao.chave])?.id)
    .filter(Boolean);
}

/**
 * Texto simples da vaga, usado na criação do post.
 * A criação de post em fórum não aceita a flag de Components V2 (seção 12), então o
 * post nasce com este texto e logo depois é editado para o card. Se a edição falhar,
 * isto é o que fica publicado, e continua completo.
 */
export function textoSimples({ valores, escolhas }) {
  const linhas = [
    `💼 **${valores.titulo}**`,
    `**${valores.empresa}**`,
    '',
    ...(valores.descricao ? [valores.descricao, ''] : []),
    SELECOES.map((selecao) => `${selecao.marca} ${rotuloDaEscolha(selecao.lista, escolhas[selecao.chave])}`).join(' · '),
    ...(valores.local ? [`📍 ${valores.local}`] : []),
    `🔗 Candidatar-se: ${valores.link}`,
  ];
  return linhas.join('\n');
}

// Linha de apoio acima do card, que vai encurtando conforme as escolhas são feitas.
export function textoDaPrevia(escolhas = {}) {
  const falta = faltaEscolher(escolhas);
  if (!falta.length) return 'Confira como vai ficar e publique quando estiver boa.';

  return `Confira como vai ficar e escolha ainda: ${falta.join(', ')}.`;
}
