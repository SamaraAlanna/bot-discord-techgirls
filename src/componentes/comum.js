// Peças de componente usadas pelos dois fluxos: campos de modal, menus, botões e autoria.

// Tipos de componente da API.
export const ACTION_ROW = 1;
export const BOTAO = 2;
export const MENU_DE_TEXTO = 3;
export const CAMPO_DE_TEXTO = 4;
export const LABEL = 18;

// Estilos de campo de texto.
export const CURTO = 1;
export const PARAGRAFO = 2;

// Estilos de botão.
const BOTAO_VERDE = 3;
const BOTAO_VERMELHO = 4;

// Um campo de texto do modal, embrulhado no Label (type 18).
// O `label` do próprio campo de texto está deprecated, por isso ele vem do Label.
export function campoDeTexto({ rotulo, descricao, id, estilo, obrigatorio, exemplo, maximo }) {
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
// Menu de escolha única, já dentro da action row que o Discord exige em mensagem.
export function menuDeSelecao({ id, convite, opcoes }) {
  return {
    type: ACTION_ROW,
    components: [{ type: MENU_DE_TEXTO, custom_id: id, placeholder: convite, options: opcoes }],
  };
}

// Opções de menu a partir de uma lista do config.js, marcando a que já foi escolhida.
export function opcoesDaLista(lista, escolha) {
  return lista.map((item) => ({
    label: item.rotulo,
    value: item.valor,
    ...(item.descricao ? { description: item.descricao } : {}),
    ...(item.emoji ? { emoji: { name: item.emoji } } : {}),
    default: escolha === item.valor,
  }));
}

// Linha de Publicar e Cancelar. Publicar só habilita quando o fluxo está completo.
export function linhaDeBotoes({ idPublicar, idCancelar, habilitado }) {
  return {
    type: ACTION_ROW,
    components: [
      { type: BOTAO, style: BOTAO_VERDE, custom_id: idPublicar, label: 'Publicar', disabled: !habilitado },
      { type: BOTAO, style: BOTAO_VERMELHO, custom_id: idCancelar, label: 'Cancelar' },
    ],
  };
}

// Bloco author do embed. A autora vem da interação, não do card.
export function autoriaDoEmbed(autora) {
  if (!autora?.nome) return {};
  return {
    author: {
      name: `Autora: ${autora.nome}`,
      ...(autora.iconUrl ? { icon_url: autora.iconUrl } : {}),
    },
  };
}
