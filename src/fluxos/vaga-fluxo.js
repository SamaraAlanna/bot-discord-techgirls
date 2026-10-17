// Fluxo do /vaga nova em Components V2: formulário, pré-visualização, publicação.

import { lerAutora } from '../autora.js';
import { lerCamposDoModal } from '../componentes/comum.js';
import {
  ACAO,
  MAXIMO_TITULO,
  SELECOES,
  cargosDaVaga,
  faltaEscolher,
  funcaoDaArea,
  lerAcao,
  lerCartao,
  montarCartao,
  montarErro,
  montarModal,
  mencoesDaVaga,
  tagsDasEscolhas,
  textoDaPrevia,
  textoSimples,
} from '../componentes/vaga-componentes.js';
import { FLAG_V2, texto } from '../componentes/v2.js';
import { buscarCargos, criarPostNoForum, editarMensagem, linkDoPost } from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { TIPO_RESPOSTA, json, mensagemEfemera, modal } from '../respostas.js';
import { validarLink } from '../validacao.js';
import { ID_FRASE, adiarMensagem, atualizarPrevia, concluirV2, registrarEtapa, registrarFalha } from './previa-v2.js';

// Pré-visualização inteira: a linha de apoio em cima e o card com os controles.
const ID_APOIO = 8;

const previa = (estado) => [
  texto(textoDaPrevia(estado.escolhas), ID_APOIO),
  ...montarCartao({ controles: true, ...estado }),
];

const FLUXO = 'vaga';

// Adia e cria a pré-visualização pela edição da resposta original: mensagem em
// Components V2 não nasce pelo callback da interação (seção 12).
function criarPrevia(interacao, ctx, componentes) {
  ctx.waitUntil(atualizarPrevia(interacao, componentes, {}, FLUXO));
  return adiarMensagem();
}

// Envio do formulário.
export function tratarEnvioDoModal(interacao, env, ctx) {
  const campos = lerCamposDoModal(interacao.data?.components);
  const autora = lerAutora(interacao);

  const valores = {
    titulo: campos.titulo ?? '',
    empresa: campos.empresa ?? '',
    link: campos.link ?? '',
    local: campos.local ?? '',
    descricao: campos.descricao ?? '',
  };

  if (!valores.titulo || !valores.empresa) {
    registrarFalha(FLUXO, 'envio do formulário', 'título ou empresa em branco');
    return criarPrevia(interacao, ctx, montarErro({
      valores, autora,
      frase: 'Título do cargo e empresa são obrigatórios.',
    }));
  }

  const resultado = validarLink(valores.link, { obrigatorio: true });
  if (resultado.erro) {
    registrarFalha(FLUXO, 'envio do formulário', `link recusado: ${valores.link}`);
    return criarPrevia(interacao, ctx, montarErro({ valores, autora, frase: resultado.erro }));
  }
  valores.link = resultado.link;

  return criarPrevia(interacao, ctx, previa({ valores, escolhas: {}, autora }));
}

// Menus e botões da pré-visualização.
export function tratarComponente(interacao, env, ctx) {
  const { acao } = lerAcao(interacao.data?.custom_id);
  const componentes = interacao.message?.components ?? [];

  if (acao === ACAO.CANCELAR) {
    ctx.waitUntil(atualizarPrevia(interacao, [texto('Publicação cancelada.', ID_FRASE)], {}, FLUXO));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  const atual = lerCartao(componentes);

  if (acao === ACAO.CORRIGIR) {
    return modal(montarModal(atual.valores));
  }

  const selecao = SELECOES.find((item) => item.acao === acao);
  if (selecao) {
    const escolhas = { ...atual.escolhas, [selecao.chave]: interacao.data?.values?.[0] };
    // Trocar de área remonta o menu de função, e a função anterior deixa de valer.
    escolhas.funcao = funcaoDaArea(escolhas.area, atual.escolhas.funcao);

    ctx.waitUntil(atualizarPrevia(interacao, previa({ ...atual, escolhas }), {}, FLUXO));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  if (acao === ACAO.FUNCAO) {
    const escolhas = { ...atual.escolhas, funcao: funcaoDaArea(atual.escolhas.area, interacao.data?.values?.[0]) };

    ctx.waitUntil(atualizarPrevia(interacao, previa({ ...atual, escolhas }), {}, FLUXO));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  if (acao === ACAO.PUBLICAR) {
    const falta = faltaEscolher(atual.escolhas);
    if (falta.length) {
      registrarFalha(FLUXO, 'publicar', `escolhas faltando: ${falta.join(', ')}`);
      return mensagemEfemera(`Escolha ainda ${falta.join(', ')} antes de publicar.`);
    }

    // A autora da vaga é quem clicou em Publicar, conferida agora.
    ctx.waitUntil(publicar(interacao, env, { ...atual, autora: lerAutora(interacao) }));
    return json({ type: TIPO_RESPOSTA.ATUALIZACAO_ADIADA });
  }

  registrarFalha(FLUXO, 'componente', `ação desconhecida: ${interacao.data?.custom_id}`);
  return mensagemEfemera('Esse botão não existe mais, use /vaga nova de novo.');
}

/**
 * Cria o post no fórum e registra no log.
 * O post nasce com o texto simples, porque a criação não aceita a flag de
 * Components V2 (seção 12), e logo depois a primeira mensagem é editada para o card.
 */
async function publicar(interacao, env, estado) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;
  const cargos = await cargosQueExistem(env, estado.escolhas);
  const publicacao = { ...estado, cargos };

  // content e allowed_mentions pertencem ao objeto `message`, não à raiz do corpo:
  // é o Forum and Media Thread Message Params da doc (seção 12).
  const mensagem = {
    // A menção vai aqui, na criação: é a criação que notifica (seção 12).
    content: textoSimples(publicacao),
    allowed_mentions: mencoesDaVaga(cargos),
  };
  registrarEtapa(FLUXO, 'menção enviada na criação', `roles: [${mensagem.allowed_mentions.roles.join(', ')}]`);

  let post;
  try {
    post = await criarPostNoForum(
      env.CANAL_VAGAS_ID,
      {
        name: estado.valores.titulo.slice(0, MAXIMO_TITULO),
        applied_tags: tagsDasEscolhas(estado.escolhas),
        message: mensagem,
      },
      env.DISCORD_TOKEN,
    );
  } catch (erro) {
    registrarFalha(FLUXO, 'criação do post no fórum', erro);
    await concluirV2(interacao, 'Não consegui publicar a vaga, tente de novo em instantes.', FLUXO);
    return;
  }

  // O resumo da chamada no console corta a resposta antes da mensagem aninhada no
  // post. Esta linha mostra o que o Discord registrou como menção, que é o que notifica.
  registrarEtapa(FLUXO, 'menção registrada pelo Discord', `mention_roles: [${(post.message?.mention_roles ?? []).join(', ')}]`);

  // A partir daqui a vaga já está no ar: nada pode desfazer isso.
  const virouCartao = await trocarPeloCartao(env, post, publicacao);

  const link = linkDoPost(env.GUILD_ID, post.id);
  await registrarNoLog(env, { acao: 'Vaga publicada', adminId, detalhe: link });

  await concluirV2(interacao, virouCartao
    ? `Vaga publicada: ${link}`
    : `Vaga publicada, mas ficou com o visual simples: ${link}`, FLUXO);
}

// Liga os componentes V2 na primeira mensagem do post. Falhar aqui não desfaz a vaga:
// o texto simples que foi publicado continua completo.
async function trocarPeloCartao(env, post, estado) {
  try {
    await editarMensagem(
      post.id,
      post.message?.id ?? post.id,
      {
        flags: FLAG_V2,
        components: montarCartao({ ...estado, controles: false }),
        // Ligando o V2, o conteúdo antigo precisa sair.
        content: null,
        embeds: [],
        // A menção continua visível no card, mas quem avisou foi a criação.
        // Liberar de novo aqui arriscaria um segundo aviso.
        allowed_mentions: { parse: [] },
      },
      env.DISCORD_TOKEN,
    );
    return true;
  } catch (erro) {
    registrarFalha(FLUXO, 'troca do post pelo card V2', erro);
    return false;
  }
}

/**
 * Cargos da área e da função que existem de fato no servidor.
 * Cargo sem ID no config.js ou apagado do servidor fica de fora, e a vaga sai
 * mencionando só o que existe. Se a conferência falhar, vale o config.js: é
 * melhor avisar do que publicar calada por causa de uma leitura.
 */
async function cargosQueExistem(env, escolhas) {
  const { cargos, semCargo } = cargosDaVaga(escolhas);
  if (semCargo.length) registrarFalha(FLUXO, 'menção', `sem cargo no config.js: ${semCargo.join(', ')}`);
  if (!cargos.length) return [];

  let doServidor;
  try {
    doServidor = new Set((await buscarCargos(env.GUILD_ID, env.DISCORD_TOKEN)).map((cargo) => cargo.id));
  } catch (erro) {
    registrarFalha(FLUXO, 'conferência dos cargos, seguindo com o config.js', erro);
    return cargos;
  }

  const apagados = cargos.filter((cargo) => !doServidor.has(cargo.id));
  if (apagados.length) {
    registrarFalha(FLUXO, 'menção', `cargo não existe no servidor: ${apagados.map((c) => `${c.rotulo} (${c.id})`).join(', ')}`);
  }

  const existentes = cargos.filter((cargo) => doServidor.has(cargo.id));
  registrarEtapa(FLUXO, 'menção', existentes.map((cargo) => cargo.rotulo).join(', ') || 'ninguém');
  return existentes;
}
