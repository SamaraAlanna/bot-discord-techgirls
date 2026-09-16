// Verificação da assinatura Ed25519 que o Discord envia em toda interação.
// Usa o Web Crypto nativo do Workers (Secure Curves API), sem dependências.

const codificador = new TextEncoder();

// Converte uma string hexadecimal em bytes. Devolve null se o formato for inválido.
function hexParaBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// A chave pública não muda, então guardamos a versão importada enquanto o isolate viver.
let chaveEmCache = { hex: null, chave: null };

async function importarChavePublica(chavePublicaHex) {
  if (chaveEmCache.hex === chavePublicaHex) return chaveEmCache.chave;

  const bytes = hexParaBytes(chavePublicaHex);
  // Chave pública Ed25519 tem 32 bytes, ou seja, 64 caracteres hexadecimais.
  if (!bytes || bytes.length !== 32) {
    throw new Error('DISCORD_PUBLIC_KEY ausente ou fora do formato esperado.');
  }

  const chave = await crypto.subtle.importKey('raw', bytes, { name: 'Ed25519' }, false, ['verify']);
  chaveEmCache = { hex: chavePublicaHex, chave };
  return chave;
}

/**
 * Confere se o corpo bruto foi mesmo assinado pelo Discord.
 * A mensagem assinada é o timestamp concatenado com o corpo, exatamente como veio.
 * Devolve true ou false, nunca lança.
 */
export async function verificarAssinatura({ corpoBruto, assinatura, timestamp, chavePublicaHex }) {
  if (!assinatura || !timestamp) return false;

  const assinaturaBytes = hexParaBytes(assinatura);
  // Assinatura Ed25519 tem 64 bytes, ou seja, 128 caracteres hexadecimais.
  if (!assinaturaBytes || assinaturaBytes.length !== 64) return false;

  try {
    const chave = await importarChavePublica(chavePublicaHex);
    const mensagem = codificador.encode(timestamp + corpoBruto);
    return await crypto.subtle.verify({ name: 'Ed25519' }, chave, assinaturaBytes, mensagem);
  } catch (erro) {
    console.error('Falha ao verificar a assinatura:', erro);
    return false;
  }
}
