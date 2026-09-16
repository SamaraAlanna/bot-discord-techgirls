// /anuncio: abre o modal. O resto do fluxo está em fluxos/anuncio-fluxo.js.

import { montarModal } from '../componentes/anuncio-componentes.js';
import { modal } from '../respostas.js';

export function comandoAnuncio() {
  return modal(montarModal());
}
