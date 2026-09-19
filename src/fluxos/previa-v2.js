// Peças comuns aos fluxos que usam pré-visualização em Components V2.
//
// Duas regras valem para os dois comandos e estão aqui para não se perderem:
// mensagem V2 não leva `content` nem `embeds`, e ela se edita pelo endpoint de
// edição da resposta original, nunca pelo callback da interação (seção 12).

import { FLAG_V2, texto } from '../componentes/v2.js';
import { editarRespostaOriginal } from '../discord-api.js';
import { EFEMERA, TIPO_RESPOSTA, json } from '../respostas.js';

// Pré-visualização: efêmera e em Components V2.
export const FLAGS_PREVIA = EFEMERA | FLAG_V2;

// Id do texto avulso que carrega uma frase (erro, confirmação, cancelamento).
export const ID_FRASE = 9;

/**
 * Adia a criação de uma mensagem efêmera.
 * Numa resposta adiada "the only valid message flag you may use is `EPHEMERAL`",
 * e é por isso que a flag de Components V2 entra só na edição seguinte (seção 12).
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

export const respostaV2 = (tipo, componentes, extras = {}) => json({
  type: tipo,
  data: {
    flags: FLAGS_PREVIA,
    components: componentes,
    allowed_mentions: { parse: [] },
    ...extras,
  },
});

// Numa resposta adiada, a mensagem original só passa a existir quando o Discord
// termina de processar o adiamento. Sem esta pausa, a primeira edição se perde e a
// admin fica no "está pensando" para sempre: confirmado no servidor (seção 12).
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
    return;
  } catch (erro) {
    registrarFalha(fluxo, 'edição da pré-visualização', erro);
  }

  try {
    await esperar(PAUSA_ANTES_DE_INSISTIR);
    await editarRespostaOriginal(interacao.application_id, interacao.token, corpo);
    return;
  } catch (erro) {
    registrarFalha(fluxo, 'edição da pré-visualização, segunda tentativa', erro);
  }

  await avisarEmTextoSimples(interacao, fluxo);
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
 * A flag vai junto: sem ela a edição é tratada como mensagem antiga, os
 * componentes somem e a interação fica presa no "está pensando" (seção 12).
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
