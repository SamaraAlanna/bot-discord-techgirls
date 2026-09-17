// Peças de Components V2, usadas pelo card do /anuncio.
//
// Uma mensagem V2 liga a flag IS_COMPONENTS_V2 e, com ela, `content` e `embeds`
// deixam de valer: todo o conteúdo vira componente.

export const FLAG_V2 = 1 << 15; // 32768

// Tipos de componente.
export const ACTION_ROW = 1;
export const BOTAO = 2;
export const SECAO = 9;
export const TEXTO = 10;
export const MINIATURA = 11;
export const GALERIA = 12;
export const CONTAINER = 17;

// Estilos de botão.
export const BOTAO_CINZA = 2;
export const BOTAO_VERDE = 3;
export const BOTAO_VERMELHO = 4;
export const BOTAO_LINK = 5;

// O `id` numérico é nosso, serve para reler o estado sem depender do texto visível.
// A doc diz que ele precisa ser único na mensagem e que, sem ele, a API gera em sequência.
export const texto = (conteudo, id) => ({ type: TEXTO, ...(id ? { id } : {}), content: conteudo });

// Texto com uma imagem pequena à direita, usado para a autora com avatar.
export const secaoComMiniatura = (conteudo, urlDaImagem, id) => ({
  type: SECAO,
  components: [texto(conteudo, id)],
  accessory: { type: MINIATURA, media: { url: urlDaImagem } },
});

// Galeria de 1 a 10 imagens. `attachment://nome` aponta para o arquivo anexado.
export const galeria = (nomes, id) => ({
  type: GALERIA,
  ...(id ? { id } : {}),
  items: nomes.map((nome) => ({ media: { url: `attachment://${nome}` } })),
});

export const container = (corDeDestaque, componentes, id) => ({
  type: CONTAINER,
  ...(id ? { id } : {}),
  accent_color: corDeDestaque,
  components: componentes,
});

export const linha = (componentes) => ({ type: ACTION_ROW, components: componentes });

export const botao = ({ id, rotulo, estilo = BOTAO_CINZA, desabilitado = false }) => ({
  type: BOTAO,
  style: estilo,
  custom_id: id,
  label: rotulo,
  // Sempre explícito: deixa claro no payload quando o botão está liberado.
  disabled: desabilitado,
});

// Botão que leva para fora do Discord: tem url e não tem custom_id.
export const botaoDeLink = (rotulo, url, id) => ({
  type: BOTAO,
  ...(id ? { id } : {}),
  style: BOTAO_LINK,
  label: rotulo,
  url,
});

// Linha de dado do card: "📅 **Quando:** valor". O prefixo é montado aqui, e é
// por ele que a leitura devolve o valor, sem depender de procurar no texto.
export const prefixoDeDado = (marca, rotulo) => `${marca} **${rotulo}:** `;

export const linhaDeDado = (marca, rotulo, valor, id) => texto(`${prefixoDeDado(marca, rotulo)}${valor}`, id);

export const semPrefixo = (conteudo, marca, rotulo) => String(conteudo ?? '').replace(prefixoDeDado(marca, rotulo), '');

// Assinatura de quem publicou, fechando o container.
export const assinatura = (autoraId, id) => texto(`-# Autora: <@${autoraId ?? '0'}>`, id);

export const lerIdDaAutora = (conteudo) => String(conteudo ?? '').match(/<@(\d+)>/)?.[1] ?? null;

// Índice dos componentes por `id`, para reler o estado sem procurar por texto.
export function porId(componentes, indice = new Map()) {
  for (const componente of componentes ?? []) {
    if (componente.id) indice.set(componente.id, componente);
    if (componente.components) porId(componente.components, indice);
    if (componente.accessory) porId([componente.accessory], indice);
  }
  return indice;
}
