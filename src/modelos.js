// Modelos prontos do /anuncio: evento, parceria e aviso.
//
// Cada modelo define o formulário (no máximo 5 campos, limite do modal) e a ordem
// em que os campos aparecem no card. `papel` diz como o campo é tratado:
//   titulo     vira o título, fora do container
//   descricao  o texto corrido, também fora do container
//   data       validada como horário de Brasília e mostrada como timestamp nativo
//   link       validado com https e vira o botão do card
//   texto      o resto, que aparece dentro do container

import { CURTO, PARAGRAFO } from './componentes/comum.js';

const DESCRICAO_DA_DATA = 'Formato DD/MM/AAAA HH:MM. A hora é lida como horário de Brasília.';
const EXEMPLO_DE_DATA = '15/10/2026 19:00';

export const MODELOS = {
  evento: {
    valor: 'evento',
    rotulo: 'Evento',
    tituloDoModal: 'Novo evento',
    rotuloDoBotao: 'Inscreva-se',
    descricaoDoComando: 'Publicar um evento da comunidade',
    campos: [
      { id: 'titulo', papel: 'titulo', rotulo: 'Título', estilo: CURTO, obrigatorio: true, maximo: 200 },
      { id: 'oque', papel: 'descricao', rotulo: 'Descrição', estilo: PARAGRAFO, obrigatorio: true, maximo: 1500 },
      {
        id: 'quando', papel: 'data', rotulo: 'Quando', estilo: CURTO, obrigatorio: true, maximo: 20,
        marca: '📅', nome: 'Quando', descricao: DESCRICAO_DA_DATA, exemplo: EXEMPLO_DE_DATA,
      },
      {
        id: 'onde', papel: 'texto', rotulo: 'Onde', estilo: CURTO, obrigatorio: true, maximo: 100,
        marca: '📍', nome: 'Onde', exemplo: 'Canal de voz Sala 1',
      },
      {
        id: 'link', papel: 'link', rotulo: 'Link de inscrição (opcional)', estilo: CURTO,
        obrigatorio: false, maximo: 500, exemplo: 'https://',
      },
    ],
    // Ordem do conteúdo dentro do container, que também define os ids fixos:
    // o primeiro campo é o id 10, o segundo é o 11, e a leitura segue a mesma ordem.
    ordemNoCard: ['onde', 'quando'],
  },

  parceria: {
    valor: 'parceria',
    rotulo: 'Parceria e cupom',
    tituloDoModal: 'Nova parceria',
    rotuloDoBotao: 'Garantir desconto',
    descricaoDoComando: 'Publicar uma parceria com cupom de desconto',
    campos: [
      { id: 'titulo', papel: 'titulo', rotulo: 'Título', estilo: CURTO, obrigatorio: true, maximo: 200 },
      { id: 'texto', papel: 'descricao', rotulo: 'Descrição', estilo: PARAGRAFO, obrigatorio: true, maximo: 1500 },
      {
        id: 'cupom', papel: 'texto', rotulo: 'Código do cupom', estilo: CURTO, obrigatorio: true, maximo: 50,
        formato: 'cupom', exemplo: 'TECHGIRLS20',
      },
      {
        id: 'desconto', papel: 'texto', rotulo: 'Desconto e condições', estilo: CURTO, obrigatorio: true,
        maximo: 200, exemplo: '20% de desconto até 30/11',
      },
      {
        id: 'link', papel: 'link', rotulo: 'Link (opcional)', estilo: CURTO, obrigatorio: false,
        maximo: 500, exemplo: 'https://',
      },
    ],
    ordemNoCard: ['desconto', 'cupom'],
  },

  aviso: {
    valor: 'aviso',
    rotulo: 'Aviso geral',
    tituloDoModal: 'Novo aviso',
    rotuloDoBotao: 'Saiba mais',
    descricaoDoComando: 'Publicar um aviso para a comunidade',
    campos: [
      { id: 'titulo', papel: 'titulo', rotulo: 'Título', estilo: CURTO, obrigatorio: true, maximo: 200 },
      { id: 'texto', papel: 'descricao', rotulo: 'Descrição', estilo: PARAGRAFO, obrigatorio: true, maximo: 1500 },
      {
        id: 'link', papel: 'link', rotulo: 'Link (opcional)', estilo: CURTO, obrigatorio: false,
        maximo: 500, exemplo: 'https://',
      },
      {
        id: 'quando', papel: 'data', rotulo: 'Quando (opcional)', estilo: CURTO, obrigatorio: false,
        maximo: 20, marca: '📅', nome: 'Quando', descricao: DESCRICAO_DA_DATA, exemplo: EXEMPLO_DE_DATA,
      },
    ],
    ordemNoCard: ['quando'],
  },
};

export const NOMES_DOS_MODELOS = Object.keys(MODELOS);

export function acharModelo(nome) {
  return MODELOS[nome] ?? null;
}

// Campos do card, na ordem de exibição, já sem os que não aparecem como texto.
export function camposDoCard(modelo) {
  return modelo.ordemNoCard.map((id) => modelo.campos.find((campo) => campo.id === id));
}

export const campoDoModelo = (modelo, id) => modelo.campos.find((campo) => campo.id === id) ?? null;

export const campoPorPapel = (modelo, papel) => modelo.campos.find((campo) => campo.papel === papel) ?? null;
