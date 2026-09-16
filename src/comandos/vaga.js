// /vaga: o subcomando nova abre o modal. O resto do fluxo está em fluxos/vaga-fluxo.js.

import { montarModal } from '../componentes/vaga-componentes.js';
import { mensagemEfemera, modal } from '../respostas.js';

export function comandoVaga(interacao) {
  const subcomando = interacao.data?.options?.[0]?.name;

  if (subcomando === 'nova') return modal(montarModal());
  if (subcomando === 'encerrar') return mensagemEfemera('O /vaga encerrar ainda está sendo construído.');

  return mensagemEfemera('Não conheço esse subcomando, ele pode ter sido removido.');
}
