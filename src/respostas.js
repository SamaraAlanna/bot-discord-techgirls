// Helpers de resposta. Toda resposta ao Discord é um JSON com um campo "type".

// Tipos de interação que o Discord envia.
export const TIPO_INTERACAO = {
  PING: 1,
  COMANDO: 2,
  COMPONENTE: 3,
  AUTOCOMPLETE: 4,
  ENVIO_DE_MODAL: 5,
};

// Tipos de resposta que o bot devolve.
export const TIPO_RESPOSTA = {
  PONG: 1,
  MENSAGEM: 4,
  MENSAGEM_ADIADA: 5,
  ATUALIZACAO_ADIADA: 6,
  ATUALIZAR_MENSAGEM: 7,
  MODAL: 9,
};

// Flag de mensagem efêmera (1 << 6): só a admin que acionou o comando enxerga.
export const EFEMERA = 64;

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

// Resposta ao PING de verificação do Discord.
export function pong() {
  return json({ type: TIPO_RESPOSTA.PONG });
}

// Abre um modal em resposta a um comando.
export function modal(dados) {
  return json({ type: TIPO_RESPOSTA.MODAL, data: dados });
}

// Troca o conteúdo da mensagem que tem o componente acionado.
export function atualizarMensagem(dados) {
  return json({ type: TIPO_RESPOSTA.ATUALIZAR_MENSAGEM, data: dados });
}

// "Estou cuidando disso": segura a interação enquanto a API do Discord responde.
// Depois disso, a resposta é concluída editando a mensagem original.
export function adiarAtualizacao() {
  return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
}

// Mensagem visível só para quem acionou, sem menções ativas.
export function mensagemEfemera(conteudo) {
  return json({
    type: TIPO_RESPOSTA.MENSAGEM,
    data: {
      content: conteudo,
      flags: EFEMERA,
      allowed_mentions: { parse: [] },
    },
  });
}
