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
  // O id da interação deixa o custom_id do formulário único a cada comando. Foi uma
  // tentativa contra o formulário que volta com o que foi digitado antes: testada no
  // servidor, não resolveu, e a causa segue desconhecida. Fica porque não atrapalha.
  return modal(montarModalTexto(modelo, {}, interacao.id));
}
