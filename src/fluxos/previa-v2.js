// Peças comuns aos fluxos que usam pré-visualização em Components V2.
//
// Duas regras valem para os dois comandos e estão aqui para não se perderem:
// mensagem V2 não leva `content` nem `embeds`, e ela se cria e se edita pelo endpoint
// de edição da resposta original, nunca pelo callback da interação. A doc diz, sobre
// IS_COMPONENTS_V2: "you must do that with the edit original response endpoint". Pelo
// callback, o Discord recusa depois que o Worker já respondeu: nenhum erro chega aqui,
// e a admin vê "não respondeu a tempo". Por isso tudo adia e edita pelo webhook.

import { FLAG_V2, texto } from '../componentes/v2.js';
import { editarRespostaOriginal } from '../discord-api.js';
import { EFEMERA, TIPO_RESPOSTA, json } from '../respostas.js';

// Pré-visualização: efêmera e em Components V2.
export const FLAGS_PREVIA = EFEMERA | FLAG_V2;

// Id do texto avulso que carrega uma frase (erro, confirmação, cancelamento).
export const ID_FRASE = 9;

/**
 * Adia a criação de uma mensagem efêmera. O Discord dá 3 segundos para a primeira
 * resposta; o trabalho com a API roda depois, em `ctx.waitUntil`, e termina na edição.
 * Numa resposta adiada "the only valid message flag you may use is `EPHEMERAL`",
 * e é por isso que a flag de Components V2 entra só na edição seguinte.
 */
export const adiarMensagem = () => json({
  type: TIPO_RESPOSTA.MENSAGEM_ADIADA,
  data: { flags: EFEMERA },
});

/** Marca uma etapa concluída, para o tail mostrar até onde o fluxo chegou. */
export function registrarEtapa(fluxo, etapa, detalhe = '') {
  console.log(`[${fluxo}] ${etapa}: ok ${detalhe}`.trim());
}

/** Registra a falha de verdade antes de mostrar qualquer frase à admin. */
export function registrarFalha(fluxo, etapa, erro) {
  console.error(`[${fluxo}] falhou em ${etapa}:`, erro instanceof Error ? erro.stack ?? erro.message : erro);
}

// Resposta de callback já com a flag V2. Só o /anuncio ainda a usa, para criar a
// primeira pré-visualização: funciona no servidor, mas é o único lugar fora do caminho
// que a doc manda (adiar e editar). Se um dia der "não respondeu a tempo", é aqui.
export const respostaV2 = (tipo, componentes, extras = {}) => json({
  type: tipo,
  data: {
    flags: FLAGS_PREVIA,
    components: componentes,
    allowed_mentions: { parse: [] },
    ...extras,
  },
});

// Corrida da mensagem adiada: a resposta original só passa a existir quando o Discord
// termina de processar o adiamento, e o Worker chega antes. A primeira edição se
// perdia e a admin ficava no "está pensando" para sempre. Uma segunda tentativa depois
// desta pausa resolveu no servidor.
const PAUSA_ANTES_DE_INSISTIR = 400;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cria ou atualiza a pré-visualização pelo webhook da interação.
 * Tenta duas vezes e, se as duas falharem, avisa a admin em texto simples:
 * pior que um card feio é a admin esperando para sempre pelo "está pensando".
 */
export async function atualizarPrevia(interacao, componentes, extras = {}, fluxo = 'fluxo') {
  const corpo = {
    flags: FLAGS_PREVIA,
    components: componentes,
    allowed_mentions: { parse: [] },
    ...extras,
  };

  try {
    await editarRespostaOriginal(interacao.application_id, interacao.token, corpo);
    return true;
  } catch (erro) {
    registrarFalha(fluxo, 'edição da pré-visualização', erro);
  }

  try {
    await esperar(PAUSA_ANTES_DE_INSISTIR);
    await editarRespostaOriginal(interacao.application_id, interacao.token, corpo);
    return true;
  } catch (erro) {
    registrarFalha(fluxo, 'edição da pré-visualização, segunda tentativa', erro);
  }

  await avisarEmTextoSimples(interacao, fluxo);
  // Devolve se o card entrou, para quem chama poder registrar a etapa com verdade.
  return false;
}

/**
 * Última linha de defesa: mensagem sem componentes, que não depende de nada de V2.
 * Só faz sentido porque, se a edição falhou, a mensagem nunca virou V2 e ainda
 * aceita `content`.
 */
async function avisarEmTextoSimples(interacao, fluxo) {
  try {
    await editarRespostaOriginal(interacao.application_id, interacao.token, {
      content: 'Não consegui montar a pré-visualização. Use o comando de novo.',
      allowed_mentions: { parse: [] },
    });
  } catch (erro) {
    registrarFalha(fluxo, 'aviso em texto simples', erro);
  }
}

/**
 * Fecha a interação trocando o card por uma frase, que também é componente.
 * A flag vai junto, como em toda edição de mensagem V2: sem ela a edição é recusada
 * e a interação fica presa no "está pensando".
 */
export async function concluirV2(interacao, frase, fluxo = 'fluxo') {
  try {
    await editarRespostaOriginal(interacao.application_id, interacao.token, {
      flags: FLAGS_PREVIA,
      components: [texto(frase, ID_FRASE)],
      attachments: [],
      allowed_mentions: { parse: [] },
    });
  } catch (erro) {
    registrarFalha(fluxo, 'fechamento da pré-visualização', erro);
  }
}
