// Montagem do /vaga em Components V2: formulário, card e controles.
//
// Como no /anuncio, o estado mora nos próprios componentes e cada peça leva um `id`
// numérico fixo. As escolhas ficam marcadas como `default` nos próprios menus.

import {
  CORES,
  FUNCAO_NAO_ESPECIFICADA,
  FUNCOES_POR_AREA,
  TAGS_AREA,
  TAGS_MODALIDADE,
  TAGS_SENIORIDADE,
} from '../config.js';
import { validarLink } from '../validacao.js';
import { CURTO, PARAGRAFO, campoDeTexto, menuDeSelecao, opcoesDaLista } from './comum.js';
import {
  BOTAO_VERDE,
  BOTAO_VERMELHO,
  CONTAINER,
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
  FUNCAO: 'funcao',
  // Limpar só pergunta; quem esvazia é o Confirmar, e o Voltar desfaz a pergunta.
  LIMPAR: 'limpar',
  LIMPAR_CONFIRMAR: 'limpar-confirmar',
  LIMPAR_VOLTAR: 'limpar-voltar',
  // Botões da pergunta do /vaga apagar, tratados em fluxos/vaga-apagar.js.
  APAGAR_CONFIRMAR: 'apagar-confirmar',
  APAGAR_CANCELAR: 'apagar-cancelar',
};

// A pergunta toma o lugar da linha de apoio enquanto a admin decide.
export const PERGUNTA_DE_LIMPEZA = 'Limpar todos os campos da vaga? As escolhas dos menus continuam.';

/**
 * Pergunta do /vaga apagar: o título da vaga, o aviso de que não tem volta e, se a
 * vaga ainda estiver aberta, o aviso disso. Quem apaga é o botão, nunca o comando.
 */
export function montarPerguntaDeApagar({ titulo, encerrada }) {
  const linhas = [`Apagar a vaga **${titulo}**? O post e todas as respostas somem, e isso não tem volta.`];
  if (!encerrada) {
    linhas.push('Atenção: essa vaga ainda está aberta, sem a tag Encerrada. Se ela só acabou, o /vaga encerrar guarda o histórico.');
  }

  return [
    texto(linhas.join('\n'), ID_FRASE),
    linha([
      botao({ id: idDaAcao(ACAO.APAGAR_CONFIRMAR), rotulo: 'Apagar', estilo: BOTAO_VERMELHO }),
      botao({ id: idDaAcao(ACAO.APAGAR_CANCELAR), rotulo: 'Cancelar' }),
    ]),
  ];
}

// O terceiro pedaço, quando existe, é só para deixar o custom_id único: a leitura o ignora.
export const idDaAcao = (acao, unico) => (unico ? `vaga:${acao}:${unico}` : `vaga:${acao}`);

export function lerAcao(customId) {
  const [, acao] = String(customId ?? '').split(':');
  return { acao };
}

// Ids fixos: fora do container a menção, o título, a empresa e a descrição; dentro
// os dados, o botão e a assinatura.
// O 5 era a linha "Candidatar-se em domínio", que saiu do card: fica aposentado e não
// deve ser reaproveitado, para um card antigo nunca ser lido como outra coisa.
export const IDS = {
  TITULO: 1,
  EMPRESA: 2,
  DESCRICAO: 3,
  CONTAINER: 4,
  BOTAO_LINK: 6,
  AUTORA: 7,
  AREA: 10,
  SENIORIDADE: 11,
  MODALIDADE: 12,
  LOCAL: 13,
  MENCAO: 14,
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

/**
 * Limite de cada campo do formulário (seção 9.9). Quem aperta é o texto simples
 * que cria o post, porque `content` aceita até 2000 caracteres e leva tudo junto:
 * menção, título, empresa, descrição, escolhas, local e link. Um teste monta o pior
 * caso com estes valores e confere que cabe.
 */
export const MAXIMOS = {
  titulo: MAXIMO_TITULO,
  empresa: 100,
  // O destino do botão aceita até 512.
  link: 500,
  local: 100,
  descricao: 1000,
};

// Campos sem os quais não dá para publicar.
const OBRIGATORIOS = [
  { chave: 'titulo', nome: 'título do cargo' },
  { chave: 'empresa', nome: 'empresa' },
  { chave: 'link', nome: 'link' },
];

// `unico` entra no custom_id para cada formulário aberto ser diferente do anterior.
export function montarModal(valores = {}, unico = null) {
  const campo = (id, rotulo, estilo, obrigatorio, extras = {}) => campoDeTexto({
    rotulo, id, estilo, obrigatorio, maximo: MAXIMOS[id],
    ...extras,
    ...(valores[id] ? { valor: valores[id] } : {}),
  });

  return {
    custom_id: idDaAcao(ACAO.MODAL, unico),
    title: 'Nova vaga',
    components: [
      campo('titulo', 'Título do cargo', CURTO, true, { exemplo: 'Pessoa Desenvolvedora Back-end' }),
      campo('empresa', 'Empresa', CURTO, true),
      campo('link', 'Link da vaga', CURTO, true, {
        descricao: 'Precisa começar com https://.',
        exemplo: 'https://',
      }),
      campo('local', 'Localização (opcional)', CURTO, false, {
        descricao: 'Opcional para remoto. Se for híbrido ou presencial, informe a cidade.',
        exemplo: 'São Paulo, SP',
      }),
      campo('descricao', 'Descrição curta (opcional)', PARAGRAFO, false, {
        descricao: 'O suficiente para decidir se vale candidatar-se.',
      }),
    ],
  };
}

/** Os obrigatórios que estão vazios, no jeito de escrever numa frase. */
export const faltaPreencher = (valores = {}) => OBRIGATORIOS.filter((campo) => !valores[campo.chave]).map((campo) => campo.nome);

/** Rascunho sem nada escrito, como fica depois do Limpar. */
export const estaEmBranco = (valores = {}) => Object.keys(MAXIMOS).every((chave) => !valores[chave]);

export const RASCUNHO_EM_BRANCO = Object.freeze({ titulo: '', empresa: '', link: '', local: '', descricao: '' });

const rotuloDaEscolha = (lista, valor) => lista.find((item) => item.valor === valor)?.rotulo ?? SEM_ESCOLHA;

// A doc limita o rótulo do botão a 80 caracteres (seção 12).
export const MAXIMO_ROTULO_DO_BOTAO = 80;
const PREFIXO_DO_BOTAO = 'Candidatar-se em ';

/**
 * "Candidatar-se em {domínio}". Se passar do limite, quem encolhe é o domínio, com
 * reticências no fim, e o começo do texto fica inteiro. Sem domínio, só "Candidatar-se".
 */
export function rotuloDoBotao(dominio) {
  if (!dominio) return 'Candidatar-se';

  const espaco = MAXIMO_ROTULO_DO_BOTAO - PREFIXO_DO_BOTAO.length;
  const cabe = dominio.length <= espaco ? dominio : `${dominio.slice(0, espaco - 1)}…`;
  return `${PREFIXO_DO_BOTAO}${cabe}`;
}

/**
 * Card da vaga, no formato da seção 9.5.
 * `controles` liga os menus e botões da pré-visualização.
 * `cargos` são os mencionados acima do card. Por padrão saem das escolhas; na
 * publicação vêm já conferidos contra os cargos que existem no servidor.
 * `confirmandoLimpeza` troca os botões por Confirmar e Voltar e trava os menus. O
 * card e os menus continuam na mensagem porque são eles que guardam o estado: é
 * deles que o Voltar remonta a pré-visualização.
 */
export function montarCartao({
  valores,
  escolhas = {},
  autora,
  controles = true,
  confirmandoLimpeza = false,
  cargos = cargosDaVaga(escolhas).cargos,
}) {
  const dentro = SELECOES.map((selecao) => linhaDeDado(
    selecao.marca,
    selecao.rotulo,
    rotuloDaEscolha(selecao.lista, escolhas[selecao.chave]),
    selecao.id,
  ));

  if (valores.local) dentro.push(linhaDeDado('📍', 'Local', valores.local, IDS.LOCAL));

  // O domínio no rótulo ajuda a identificar golpe; o destino é o link completo,
  // exatamente como foi digitado.
  if (valores.link) {
    dentro.push(linha([botaoDeLink(rotuloDoBotao(validarLink(valores.link).dominio), valores.link, IDS.BOTAO_LINK)]));
  }

  dentro.push(assinatura(autora?.id, IDS.AUTORA));

  const cartao = [];
  // A menção fica acima de tudo, fora do container, como no /anuncio.
  if (cargos.length) cartao.push(texto(textoDaMencao(cargos), IDS.MENCAO));
  // Rascunho limpo não tem título nem empresa: as linhas somem em vez de virar
  // texto vazio, que o Discord recusa.
  if (valores.titulo) cartao.push(texto(`# 💼 ${valores.titulo}`, IDS.TITULO));
  if (valores.empresa) cartao.push(texto(`**${valores.empresa}**`, IDS.EMPRESA));
  if (valores.descricao) cartao.push(texto(valores.descricao, IDS.DESCRICAO));
  cartao.push(container(CORES.VAGA, dentro, IDS.CONTAINER));

  if (!controles) return cartao;

  // Menu travado continua com a opção marcada como `default`, então a leitura não muda.
  const menus = SELECOES.map((selecao) => menuDeSelecao({
    id: idDaAcao(selecao.acao),
    convite: selecao.convite,
    opcoes: opcoesDaLista(selecao.lista, escolhas[selecao.chave]),
    desabilitado: confirmandoLimpeza,
  }));
  // A função depende da área, então o menu dela vem logo depois do da área.
  menus.splice(1, 0, menuDeFuncao(escolhas, confirmandoLimpeza));

  if (confirmandoLimpeza) {
    return [
      ...cartao,
      ...menus,
      linha([
        botao({ id: idDaAcao(ACAO.LIMPAR_CONFIRMAR), rotulo: 'Confirmar', estilo: BOTAO_VERMELHO }),
        botao({ id: idDaAcao(ACAO.LIMPAR_VOLTAR), rotulo: 'Voltar' }),
      ]),
    ];
  }

  const emBranco = estaEmBranco(valores);

  return [
    ...cartao,
    ...menus,
    linha([
      // O /vaga não tem Editar texto: sem este botão, um rascunho limpo seria um beco.
      ...(emBranco ? [botao({ id: idDaAcao(ACAO.CORRIGIR), rotulo: 'Preencher', estilo: BOTAO_VERDE })] : []),
      botao({
        id: idDaAcao(ACAO.PUBLICAR),
        rotulo: 'Publicar',
        estilo: BOTAO_VERDE,
        desabilitado: faltaEscolher(escolhas).length > 0 || faltaPreencher(valores).length > 0,
      }),
      botao({ id: idDaAcao(ACAO.LIMPAR), rotulo: 'Limpar', desabilitado: emBranco }),
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
  escolhas.funcao = funcaoDaArea(escolhas.area, escolhaDoMenu(componentes, ACAO.FUNCAO));

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
export function textoSimples({ valores, escolhas, cargos = cargosDaVaga(escolhas).cargos }) {
  const linhas = [
    // É esta linha que notifica: menção acrescentada depois, na edição para o
    // card, não avisa ninguém (seção 12).
    ...(cargos.length ? [textoDaMencao(cargos), ''] : []),
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

/**
 * Troca a cor do container do card publicado, mantendo o resto como está.
 * Recolorir no lugar é mais seguro que remontar: não depende de reler o estado
 * de um post que pode ser antigo.
 */
export function recolorir(componentes, cor) {
  let achou = false;

  const copiar = (lista) => (lista ?? []).map((item) => {
    const copia = { ...item };
    if (copia.type === CONTAINER) {
      copia.accent_color = cor;
      achou = true;
    }
    if (copia.components) copia.components = copiar(copia.components);
    return copia;
  });

  return { componentes: copiar(componentes), achou };
}

// Linha de apoio acima do card, que vai encurtando conforme as escolhas são feitas.
// Com a área escolhida, diz também quem vai ser avisada, para a admin conferir.
export function textoDaPrevia(escolhas = {}, valores = null) {
  const falta = faltaEscolher(escolhas);
  let primeira;
  if (valores && estaEmBranco(valores)) {
    primeira = 'Rascunho em branco. Toque em Preencher para escrever a vaga de novo.';
  } else if (falta.length) {
    primeira = `Confira como vai ficar e escolha ainda: ${falta.join(', ')}.`;
  } else {
    primeira = 'Confira como vai ficar e publique quando estiver boa.';
  }

  if (!escolhas.area) return primeira;
  return `${primeira}\n${textoDeQuemSeraAvisada(cargosDaVaga(escolhas))}`;
}

function textoDeQuemSeraAvisada({ cargos, semCargo }) {
  const avisadas = cargos.length
    ? `🔔 Vai avisar quem tem ${cargos.length > 1 ? 'os cargos' : 'o cargo'} ${emLista(cargos.map((cargo) => `**${cargo.rotulo}**`))}.`
    : '🔔 Não vai avisar ninguém.';
  if (!semCargo.length) return avisadas;

  const plural = semCargo.length > 1;
  return `${avisadas} ${plural ? 'Os cargos' : 'O cargo'} ${emLista(semCargo)} não ${plural ? 'existem' : 'existe'} no servidor.`;
}

// "A", "A e B", "A, B e C".
const emLista = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0] ?? '');

/** Funções da área, na ordem do config.js. Sem área, nenhuma. */
export const funcoesDaArea = (area) => FUNCOES_POR_AREA[area] ?? [];

/**
 * A função só vale se for da área escolhida. Qualquer outra coisa, inclusive uma
 * função de uma área anterior, volta para "Não especificar".
 */
export function funcaoDaArea(area, funcao) {
  return funcoesDaArea(area).some((item) => item.valor === funcao) ? funcao : FUNCAO_NAO_ESPECIFICADA.valor;
}

// Só lista as funções da área escolhida. Sem área, fica travado com a opção padrão.
function menuDeFuncao(escolhas, travado = false) {
  const funcoes = funcoesDaArea(escolhas.area);
  return menuDeSelecao({
    id: idDaAcao(ACAO.FUNCAO),
    convite: funcoes.length ? 'Qual é a função? (opcional)' : 'Escolha a área primeiro.',
    opcoes: opcoesDaLista([FUNCAO_NAO_ESPECIFICADA, ...funcoes], funcaoDaArea(escolhas.area, escolhas.funcao)),
    desabilitado: travado || !funcoes.length,
  });
}

/**
 * Cargos que a vaga menciona: o da área e, se houver, o da função. Senioridade e
 * modalidade não mencionam. `semCargo` traz os nomes que não têm cargo no config.js.
 */
export function cargosDaVaga(escolhas = {}) {
  const area = TAGS_AREA.find((item) => item.valor === escolhas.area);
  const funcao = funcoesDaArea(escolhas.area).find((item) => item.valor === escolhas.funcao);

  const cargos = [];
  const semCargo = [];
  for (const item of [area, funcao].filter(Boolean)) {
    if (item.cargoId) cargos.push({ rotulo: item.rotulo, id: item.cargoId });
    else semCargo.push(item.rotulo);
  }
  return { cargos, semCargo };
}

export const textoDaMencao = (cargos) => cargos.map((cargo) => `<@&${cargo.id}>`).join(' ');

/**
 * allowed_mentions da criação do post: só os cargos da vaga.
 * `parse` vazio garante que nunca saem @everyone, @here nem a menção da autora.
 */
export const mencoesDaVaga = (cargos) => ({ parse: [], roles: cargos.map((cargo) => cargo.id) });
