// Peças de componente usadas pelos dois fluxos: campos de modal, upload, menus e opções.

// Tipos de componente da API.
export const ACTION_ROW = 1;
export const BOTAO = 2;
export const MENU_DE_TEXTO = 3;
export const CAMPO_DE_TEXTO = 4;
export const LABEL = 18;
export const UPLOAD_DE_ARQUIVO = 19;

// Estilos de campo de texto.
export const CURTO = 1;
export const PARAGRAFO = 2;

// Estilos de botão.
const BOTAO_VERDE = 3;
const BOTAO_VERMELHO = 4;

// "1500" vira "1.500", como se escreve número em português.
const comMilhar = (numero) => String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// A doc limita a descrição do Label a 100 caracteres (e o rótulo a 45).
export const MAXIMO_DESCRICAO_DO_CAMPO = 100;

/**
 * Um campo de texto do modal, embrulhado no Label (type 18).
 * O `label` do próprio campo de texto está deprecated, por isso ele vem do Label.
 * O limite de caracteres vai sempre no fim da descrição, como "Até 100 caracteres.".
 */
export function campoDeTexto({ rotulo, descricao, id, estilo, obrigatorio, exemplo, maximo, valor }) {
  const descricaoComLimite = [descricao, maximo ? `Até ${comMilhar(maximo)} caracteres.` : null]
    .filter(Boolean)
    .join(' ');

  return {
    type: LABEL,
    label: rotulo,
    ...(descricaoComLimite ? { description: descricaoComLimite } : {}),
    component: {
      type: CAMPO_DE_TEXTO,
      custom_id: id,
      style: estilo,
      required: obrigatorio,
      ...(exemplo ? { placeholder: exemplo } : {}),
      ...(maximo ? { max_length: maximo } : {}),
      // `value` deixa o campo já preenchido, que é o que permite reabrir para editar.
      // Ele nunca passa do máximo: um rascunho salvo com limite maior geraria um
      // formulário inválido. Modal é resposta de interação, validada pelo Discord
      // depois que o Worker já respondeu: a recusa não volta como erro, e a admin só
      // vê "não respondeu a tempo".
      ...(valor ? { value: maximo ? String(valor).slice(0, maximo) : valor } : {}),
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
    // O campo de upload não devolve texto: devolve as chaves de resolved.attachments.
    if (componente.custom_id && Array.isArray(componente.values)) {
      destino[componente.custom_id] = componente.values;
    }
    if (componente.component) lerCamposDoModal([componente.component], destino);
    if (componente.components) lerCamposDoModal(componente.components, destino);
  }
  return destino;
}
// Campo de upload de arquivo do modal (type 19), também embrulhado no Label.
export function campoDeUpload({ rotulo, descricao, id, obrigatorio = false, minimo, maximo }) {
  return {
    type: LABEL,
    label: rotulo,
    ...(descricao ? { description: descricao } : {}),
    component: {
      type: UPLOAD_DE_ARQUIVO,
      custom_id: id,
      required: obrigatorio,
      ...(minimo === undefined ? {} : { min_values: minimo }),
      ...(maximo === undefined ? {} : { max_values: maximo }),
    },
  };
}

// Menu de escolha única, já dentro da action row que o Discord exige em mensagem.
// `desabilitado` só vale em mensagem: a doc diz que em modal ele dá erro.
export function menuDeSelecao({ id, convite, opcoes, desabilitado = false }) {
  return {
    type: ACTION_ROW,
    components: [{
      type: MENU_DE_TEXTO,
      custom_id: id,
      placeholder: convite,
      options: opcoes,
      ...(desabilitado ? { disabled: true } : {}),
    }],
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
