// Wrapper das chamadas REST do Discord feitas de dentro do Worker.

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/tech-girls/bot-tech-girls, 0.1.0)';

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
    throw new Error(`${metodo} ${caminho} devolveu ${resposta.status}: ${texto.slice(0, 600)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

export function criarMensagem(canalId, corpo, token) {
  return chamarDiscord('POST', `/channels/${canalId}/messages`, { token, corpo });
}

// Troca a resposta original da interação, usada depois de uma resposta adiada.
export function editarRespostaOriginal(applicationId, tokenDaInteracao, corpo) {
  return chamarDiscord('PATCH', `/webhooks/${applicationId}/${tokenDaInteracao}/messages/@original`, { corpo });
}

export function linkDaMensagem(guildId, canalId, mensagemId) {
  return `https://discord.com/channels/${guildId}/${canalId}/${mensagemId}`;
}
