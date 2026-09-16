// Validações de campos digitados pelas admins.

/**
 * O link precisa ser https e uma URL válida (seção 8.1.3 do CLAUDE.md).
 * Devolve { link } já limpo, { link: null } quando o campo é opcional e veio vazio,
 * ou { erro } com uma frase.
 */
export function validarLink(texto, { obrigatorio = false } = {}) {
  const limpo = String(texto ?? '').trim();

  if (!limpo) {
    return obrigatorio ? { erro: 'O link é obrigatório e precisa começar com https://.' } : { link: null };
  }
  if (!limpo.startsWith('https://')) {
    return { erro: 'O link precisa começar com https://, por segurança de quem vai clicar.' };
  }

  try {
    const url = new URL(limpo);
    return { link: url.href, dominio: url.hostname };
  } catch {
    return { erro: 'Esse link não é um endereço válido, confira se não faltou alguma parte.' };
  }
}
