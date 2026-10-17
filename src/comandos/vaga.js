// /vaga: o subcomando nova abre o modal. O resto do fluxo está em fluxos/vaga-fluxo.js.

import { respostaForaDoCanal } from '../canais.js';
import { montarModal } from '../componentes/vaga-componentes.js';
import { tratarApagar } from '../fluxos/vaga-apagar.js';
import { tratarEncerrar } from '../fluxos/vaga-encerrar.js';
import { mensagemEfemera, modal } from '../respostas.js';

export function comandoVaga(interacao, env, ctx) {
  const subcomando = interacao.data?.options?.[0]?.name;

  if (subcomando === 'nova') {
    // O id da interação deixa o formulário único a cada comando (seção 12).
    return respostaForaDoCanal(interacao, env, 'vaga nova') ?? modal(montarModal({}, interacao.id));
  }
  // Encerrar e apagar têm a regra de canal deles: só dentro de um post do fórum de vagas.
  if (subcomando === 'encerrar') return tratarEncerrar(interacao, env, ctx);
  if (subcomando === 'apagar') return tratarApagar(interacao, env, ctx);

  return mensagemEfemera('Não conheço esse subcomando, ele pode ter sido removido.');
}
