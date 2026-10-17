// Restrição de canal dos comandos (CANAIS_PERMITIDOS no config.js).

import { CANAIS_PERMITIDOS } from './config.js';
import { mensagemEfemera } from './respostas.js';

// "A", "A ou B", "A, B ou C".
const emLista = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} ou ${itens.at(-1)}` : itens[0]);

/**
 * Devolve a resposta efêmera dizendo onde usar quando o comando veio de outro canal,
 * ou null quando está no lugar certo. `comando` é a chave de CANAIS_PERMITIDOS.
 */
export function respostaForaDoCanal(interacao, env, comando) {
  const permitidos = (CANAIS_PERMITIDOS[comando] ?? []).map((nome) => env[nome]).filter(Boolean);
  const atual = interacao.channel?.id ?? interacao.channel_id;

  if (permitidos.includes(atual)) return null;

  console.error(`[canais] /${comando} usado no canal ${atual}; permitidos: ${permitidos.join(', ') || 'nenhum configurado'}`);

  // Var faltando no wrangler.toml: sem canal liberado, o comando não roda em lugar nenhum.
  if (!permitidos.length) return mensagemEfemera('Esse comando ainda não tem canal liberado. Avise quem cuida do bot.');

  return mensagemEfemera(`Use este comando em ${emLista(permitidos.map((id) => `<#${id}>`))}.`);
}
