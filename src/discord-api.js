// Wrapper das chamadas REST do Discord feitas de dentro do Worker.

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/tech-girls/bot-tech-girls, 0.1.0)';

/**
 * Rotas de webhook só respeitam o campo `components` com `with_components=true`:
 * a doc diz que o parâmetro "defaults to `false`" e que só com ele um webhook do app
 * "use all components". Sem ele o Discord pode ignorar os componentes e devolver 200
 * mesmo assim, sem erro nenhum para capturar.
 */
function comComponentes(caminho) {
  return caminho.includes('?') ? `${caminho}&with_components=true` : `${caminho}?with_components=true`;
}

/**
 * Uma linha por chamada, inclusive as que dão certo: vários defeitos do Discord são
 * "200 sem efeito", e só o registro de cada chamada mostra onde o fluxo parou.
 */
function registrarChamada(metodo, caminho, status, corpo) {
  const resumo = String(corpo ?? '').slice(0, 300);
  console.log(`[api] ${metodo} ${esconderToken(caminho)} -> ${status} ${resumo}`);
}

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
  registrarChamada(metodo, caminho, resposta.status, texto);

  if (!resposta.ok) {
    // O corpo do erro é onde o Discord diz qual campo recusou. Vai para o log do Worker.
    throw new Error(`${metodo} ${esconderToken(caminho)} devolveu ${resposta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : null;
}

export function criarMensagem(canalId, corpo, token) {
  return chamarDiscord('POST', `/channels/${canalId}/messages`, { token, corpo });
}

// Canal ou thread. O objeto que vem na interação é parcial e não traz as tags.
export function buscarCanal(canalId, token) {
  return chamarDiscord('GET', `/channels/${canalId}`, { token });
}

/**
 * Apaga um canal ou uma thread, como um post de fórum. Não tem volta: a doc diz
 * "Deleting a guild channel cannot be undone". Para thread, a permissão exigida é
 * MANAGE_THREADS, e não MANAGE_CHANNELS.
 */
export function apagarCanal(canalId, token) {
  return chamarDiscord('DELETE', `/channels/${canalId}`, { token });
}

// Tags, trancado e arquivado de uma thread vivem no próprio canal.
export function editarCanal(canalId, corpo, token) {
  return chamarDiscord('PATCH', `/channels/${canalId}`, { token, corpo });
}

export function buscarMensagem(canalId, mensagemId, token) {
  return chamarDiscord('GET', `/channels/${canalId}/messages/${mensagemId}`, { token });
}

/**
 * Edita uma mensagem de canal. É por aqui que o post do fórum ganha os componentes
 * V2: na criação do post, a doc só permite as flags SUPPRESS_EMBEDS e
 * SUPPRESS_NOTIFICATIONS, então IS_COMPONENTS_V2 só entra numa edição depois.
 */
export function editarMensagem(canalId, mensagemId, corpo, token) {
  return chamarDiscord('PATCH', `/channels/${canalId}/messages/${mensagemId}`, { token, corpo });
}

// Cargos do servidor. Serve para conferir, antes de mencionar, que o cargo ainda existe.
export function buscarCargos(guildId, token) {
  return chamarDiscord('GET', `/guilds/${guildId}/roles`, { token });
}

// Post de fórum: o Discord devolve um canal (a thread) com a primeira mensagem dentro.
export function criarPostNoForum(canalId, corpo, token) {
  return chamarDiscord('POST', `/channels/${canalId}/threads`, { token, corpo });
}

// Troca a resposta original da interação, usada depois de uma resposta adiada.
export function editarRespostaOriginal(applicationId, tokenDaInteracao, corpo) {
  return chamarDiscord('PATCH', comComponentes(`/webhooks/${applicationId}/${tokenDaInteracao}/messages/@original`), { corpo });
}

/**
 * Confere se cada `files[n]` tem o item de mesmo índice em `attachments`, com o
 * mesmo nome. Um desencontro aqui é aceito pelo Discord, e o arquivo simplesmente
 * não aparece: fica sem erro para capturar, então vira uma linha no console.
 */
function conferirAnexos(payload, arquivos) {
  const anexos = payload?.attachments ?? [];
  const desencontro = arquivos.length !== anexos.length
    || arquivos.some((arquivo, indice) => anexos[indice]?.id !== indice || anexos[indice]?.filename !== arquivo.nome);

  if (desencontro) {
    console.error('[api] envio multipart inconsistente:', {
      arquivos: arquivos.map((arquivo) => arquivo.nome),
      attachments: anexos,
    });
  }
}

/**
 * Envia arquivos junto com um payload JSON, em multipart/form-data.
 * O corpo vai como `payload_json` mais `files[n]`, que é o formato da doc de uploads.
 * Não definimos content-type na mão: o fetch monta o boundary sozinho.
 */
export async function enviarArquivos(caminho, { token, payload, arquivos = [], metodo = 'POST' }) {
  conferirAnexos(payload, arquivos);

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
  registrarChamada(`${metodo} (multipart)`, caminho, resposta.status, texto);

  if (!resposta.ok) {
    throw new Error(`${metodo} ${esconderToken(caminho)} devolveu ${resposta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : null;
}

// A resposta original da interação, que é a mensagem a ser editada depois do adiamento.
export function caminhoDaRespostaOriginal(applicationId, tokenDaInteracao) {
  return comComponentes(`/webhooks/${applicationId}/${tokenDaInteracao}/messages/@original`);
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
