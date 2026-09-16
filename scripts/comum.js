// Utilidades compartilhadas pelos scripts de linha de comando (Node, fora do Worker).
// O Worker não importa nada daqui: lá o ambiente vem do env e a API tem o próprio wrapper.

import { readFileSync } from 'node:fs';

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/tech-girls/bot-tech-girls, 0.1.0)';

// Lê pares CHAVE=VALOR de um arquivo, ignorando comentários e linhas vazias.
// Serve tanto para o .dev.vars quanto para a seção [vars] do wrangler.toml.
function lerPares(caminho) {
  let conteudo;
  try {
    conteudo = readFileSync(new URL(caminho, import.meta.url), 'utf8');
  } catch {
    return {};
  }
  const pares = {};
  for (const linha of conteudo.split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    const achado = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (achado) pares[achado[1]] = achado[2].trim().replace(/^["']|["']$/g, '');
  }
  return pares;
}

export function carregarAmbiente() {
  return { ...lerPares('../wrangler.toml'), ...lerPares('../.dev.vars'), ...process.env };
}

// Interrompe cedo, com mensagem clara, em vez de deixar a API devolver 401 sem contexto.
export function exigir(ambiente, nomes) {
  const faltando = nomes.filter((nome) => !ambiente[nome]);
  if (!faltando.length) return;

  const ondeFica = (nome) => (nome.startsWith('DISCORD_') ? '.dev.vars' : 'wrangler.toml');
  for (const nome of faltando) {
    console.error(`Falta ${nome}. Preencha no ${ondeFica(nome)}.`);
  }
  process.exit(1);
}

// Chamada à API REST do Discord. Devolve o JSON ou lança com o corpo do erro,
// que é onde o Discord explica qual campo recusou.
export async function chamarApi(metodo, caminho, { token, corpo } = {}) {
  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: {
      authorization: `Bot ${token}`,
      'user-agent': USER_AGENT,
      ...(corpo ? { 'content-type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`${metodo} ${caminho} devolveu ${resposta.status}. Resposta: ${texto.slice(0, 600)}`);
  }
  return texto ? JSON.parse(texto) : null;
}
