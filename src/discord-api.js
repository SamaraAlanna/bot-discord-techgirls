// Wrapper das chamadas REST do Discord feitas de dentro do Worker.

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/tech-girls/bot-tech-girls, 0.1.0)';

/**
 * Esconde o token da interação antes de qualquer log.
 * Ele vai no caminho das rotas de webhook e vale como senha temporária:
 * quem o tiver pode responder no lugar do bot enquanto a interação viver.
 */
export function esconderToken(caminho) {
  return String(caminho).replace(/(\/webhooks\/[^/]+\/)[^/?]+/, '$1***');
}

// `token` só é necessário nas rotas do bot. As rotas de webhook da interação
// se autenticam pelo token da própria interação, que já vai no caminho.
async function chamarDiscord(metodo, caminho, { token, corpo } = {}) {
  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: {
      'user-agent': USER_AGENT,
      ...(token ? { authorization: `Bot ${token}` } : {}),
      ...(corpo ? { 'content-type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resposta.text();
  if (!resposta.ok) {
    // O corpo do erro é onde o Discord diz qual campo recusou. Vai para o log do Worker.
    throw new Error(`${metodo} ${esconderToken(caminho)} devolveu ${resposta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : null;
}

export function criarMensagem(canalId, corpo, token) {
  return chamarDiscord('POST', `/channels/${canalId}/messages`, { token, corpo });
}

// Post de fórum: o Discord devolve um canal (a thread) com a primeira mensagem dentro.
export function criarPostNoForum(canalId, corpo, token) {
  return chamarDiscord('POST', `/channels/${canalId}/threads`, { token, corpo });
}

// Troca a resposta original da interação, usada depois de uma resposta adiada.
export function editarRespostaOriginal(applicationId, tokenDaInteracao, corpo) {
  return chamarDiscord('PATCH', `/webhooks/${applicationId}/${tokenDaInteracao}/messages/@original`, { corpo });
}

/**
 * Envia arquivos junto com um payload JSON, em multipart/form-data.
 * O corpo vai como `payload_json` mais `files[n]`, que é o formato da doc de uploads.
 * Não definimos content-type na mão: o fetch monta o boundary sozinho.
 */
export async function enviarArquivos(caminho, { token, payload, arquivos = [], metodo = 'POST' }) {
  const formulario = new FormData();
  formulario.append('payload_json', JSON.stringify(payload));

  arquivos.forEach((arquivo, indice) => {
    formulario.append(`files[${indice}]`, new Blob([arquivo.bytes], { type: arquivo.tipo }), arquivo.nome);
  });

  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: {
      'user-agent': USER_AGENT,
      ...(token ? { authorization: `Bot ${token}` } : {}),
    },
    body: formulario,
  });

  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`${metodo} ${esconderToken(caminho)} devolveu ${resposta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : null;
}

// A resposta original da interação, que é a mensagem a ser editada depois do adiamento.
export function caminhoDaRespostaOriginal(applicationId, tokenDaInteracao) {
  return `/webhooks/${applicationId}/${tokenDaInteracao}/messages/@original`;
}

/**
 * Reage a uma mensagem com um emoji unicode.
 * O emoji precisa ir codificado na URL, senão a API responde 10014 Unknown Emoji.
 */
export function reagir(canalId, mensagemId, emoji, token) {
  const codificado = encodeURIComponent(emoji);
  return chamarDiscord('PUT', `/channels/${canalId}/messages/${mensagemId}/reactions/${codificado}/@me`, { token });
}

export function linkDaMensagem(guildId, canalId, mensagemId) {
  return `https://discord.com/channels/${guildId}/${canalId}/${mensagemId}`;
}

// O post de fórum é um canal, então o link tem duas partes, sem o ID de mensagem.
export function linkDoPost(guildId, postId) {
  return `https://discord.com/channels/${guildId}/${postId}`;
}

/**
 * Fecha uma interação que foi adiada, trocando a pré-visualização pelo resultado.
 * Não lança: se nem isso funcionar, só resta registrar no console.
 */
export async function concluirInteracao(interacao, conteudo) {
  try {
    await editarRespostaOriginal(interacao.application_id, interacao.token, {
      content: conteudo,
      embeds: [],
      components: [],
      allowed_mentions: { parse: [] },
    });
  } catch (erro) {
    console.error('Falha ao fechar a pré-visualização:', erro);
  }
}
