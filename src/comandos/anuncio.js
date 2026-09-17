// /anuncio: cada subcomando é um modelo pronto e abre o formulário dele.

import { montarModalTexto } from '../componentes/anuncio-componentes.js';
import { acharModelo } from '../modelos.js';
import { mensagemEfemera, modal } from '../respostas.js';

export function comandoAnuncio(interacao) {
  const subcomando = interacao.data?.options?.[0]?.name;
  const modelo = acharModelo(subcomando);

  if (!modelo) return mensagemEfemera('Não conheço esse modelo de anúncio, ele pode ter sido removido.');
  return modal(montarModalTexto(modelo));
}
