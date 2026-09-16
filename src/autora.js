// Quem está publicando, lido sempre da interação que chegou agora,
// nunca do card: assim o nome no anúncio é o de quem clicou em Publicar.

const CDN = 'https://cdn.discordapp.com';

// Avatar animado tem o hash começando com a_ e só existe em gif.
const extensao = (hash) => (hash.startsWith('a_') ? 'gif' : 'png');

/**
 * Devolve { nome, iconUrl } ou null quando a interação não traz usuária.
 * Nome: apelido no servidor, senão nome de exibição, senão nome de usuário.
 */
export function lerAutora(interacao) {
  const membro = interacao?.member;
  const usuario = membro?.user ?? interacao?.user;
  if (!usuario) return null;

  return {
    nome: membro?.nick || usuario.global_name || usuario.username,
    iconUrl: urlDoAvatar(interacao, membro, usuario),
  };
}

// Avatar do servidor ganha do avatar da conta. Sem nenhum dos dois, fica sem ícone.
function urlDoAvatar(interacao, membro, usuario) {
  if (membro?.avatar && interacao.guild_id) {
    const arquivo = `${membro.avatar}.${extensao(membro.avatar)}`;
    return `${CDN}/guilds/${interacao.guild_id}/users/${usuario.id}/avatars/${arquivo}?size=128`;
  }
  if (usuario.avatar) {
    return `${CDN}/avatars/${usuario.id}/${usuario.avatar}.${extensao(usuario.avatar)}?size=128`;
  }
  return null;
}
