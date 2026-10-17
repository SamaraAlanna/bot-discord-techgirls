// Quem está publicando, lido sempre da interação que chegou agora,
// nunca do card: assim o nome no anúncio é o de quem clicou em Publicar.

/**
 * Devolve { id, nome } ou null quando a interação não traz usuária.
 * Nome: apelido no servidor, senão nome de exibição, senão nome de usuário.
 */
export function lerAutora(interacao) {
  const membro = interacao?.member;
  const usuario = membro?.user ?? interacao?.user;
  if (!usuario) return null;

  return {
    id: usuario.id,
    nome: membro?.nick || usuario.global_name || usuario.username,
  };
}
