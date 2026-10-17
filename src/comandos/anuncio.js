// /anuncio: cada subcomando é um modelo pronto e abre o formulário dele.

import { respostaForaDoCanal } from '../canais.js';
import { montarModalTexto } from '../componentes/anuncio-componentes.js';
import { acharModelo } from '../modelos.js';
import { mensagemEfemera, modal } from '../respostas.js';

export function comandoAnuncio(interacao, env) {
  const foraDoCanal = respostaForaDoCanal(interacao, env, 'anuncio');
  if (foraDoCanal) return foraDoCanal;

  const subcomando = interacao.data?.options?.[0]?.name;
  const modelo = acharModelo(subcomando);

  if (!modelo) return mensagemEfemera('Não conheço esse modelo de anúncio, ele pode ter sido removido.');
  // O id da interação deixa o formulário único a cada comando. Suspeita, não
  // documentada: o cliente devolve o que foi digitado num formulário de mesmo custom_id.
  return modal(montarModalTexto(modelo, {}, interacao.id));
}
