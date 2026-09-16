// Fluxo do /vaga nova: envio do modal, três seleções, publicar e cancelar.

import { lerAutora } from '../autora.js';
import { lerCamposDoModal } from '../componentes/comum.js';
import {
  ID_CANCELAR,
  ID_PUBLICAR,
  SELECOES,
  faltaEscolher,
  lerEmbedPrevia,
  montarComponentes,
  montarEmbedPrevia,
  montarPost,
  textoDaPrevia,
} from '../componentes/vaga-componentes.js';
import { concluirInteracao, criarPostNoForum, linkDoPost } from '../discord-api.js';
import { registrarNoLog } from '../log.js';
import { EFEMERA, TIPO_RESPOSTA, adiarAtualizacao, atualizarMensagem, json, mensagemEfemera } from '../respostas.js';
import { validarLink } from '../validacao.js';

// Envio do modal: valida e responde com a pré-visualização efêmera.
export function tratarEnvioDoModal(interacao) {
  const campos = lerCamposDoModal(interacao.data?.components);
  const obrigatorios = ['titulo', 'empresa', 'local', 'descricao'];

  if (obrigatorios.some((nome) => !campos[nome])) {
    return mensagemEfemera('Preencha título, empresa, localização e descrição, use /vaga nova de novo.');
  }

  const resultadoLink = validarLink(campos.link, { obrigatorio: true });
  if (resultadoLink.erro) return mensagemEfemera(resultadoLink.erro);

  const embed = montarEmbedPrevia({
    titulo: campos.titulo,
    empresa: campos.empresa,
    local: campos.local,
    link: resultadoLink.link,
    descricao: campos.descricao,
    escolhas: {},
    autora: lerAutora(interacao),
  });

  return json({
    type: TIPO_RESPOSTA.MENSAGEM,
    data: {
      content: textoDaPrevia({}),
      embeds: [embed],
      components: montarComponentes({}),
      flags: EFEMERA,
      allowed_mentions: { parse: [] },
    },
  });
}

// Menus e botões da pré-visualização.
export function tratarComponente(interacao, env, ctx) {
  const acao = interacao.data?.custom_id;

  if (acao === ID_CANCELAR) {
    return atualizarMensagem({ content: 'Publicação cancelada.', embeds: [], components: [] });
  }

  const embed = interacao.message?.embeds?.[0];
  if (!embed) {
    // A pré-visualização é o estado inteiro. Sem ela, não dá para publicar nada.
    return mensagemEfemera('Não consegui ler a pré-visualização, use /vaga nova de novo.');
  }

  const selecao = SELECOES.find((item) => item.id === acao);
  if (selecao) {
    const dados = lerEmbedPrevia(embed);
    const escolhas = { ...dados.escolhas, [selecao.chave]: interacao.data?.values?.[0] };

    return atualizarMensagem({
      // O conteúdo precisa ir junto: o que não é enviado no update fica como estava.
      content: textoDaPrevia(escolhas),
      // A autora é relida da interação a cada passo, nunca do card.
      embeds: [montarEmbedPrevia({ ...dados, escolhas, autora: lerAutora(interacao) })],
      components: montarComponentes({ escolhas }),
      allowed_mentions: { parse: [] },
    });
  }

  if (acao === ID_PUBLICAR) {
    const dados = lerEmbedPrevia(embed);
    const falta = faltaEscolher(dados.escolhas);
    if (falta.length) {
      return mensagemEfemera(`Escolha ainda ${falta.join(', ')} antes de publicar.`);
    }

    // Publicar chama a API, o que não cabe nos 3 segundos da primeira resposta.
    // A autora da vaga é quem clicou em Publicar, conferida agora.
    ctx.waitUntil(publicar(interacao, env, { ...dados, autora: lerAutora(interacao) }));
    return adiarAtualizacao();
  }

  return mensagemEfemera('Esse botão não existe mais, use /vaga nova de novo.');
}

// Roda depois da resposta adiada: cria o post, registra no log e fecha a interação.
async function publicar(interacao, env, dados) {
  const adminId = interacao.member?.user?.id ?? interacao.user?.id;

  try {
    const post = await criarPostNoForum(env.CANAL_VAGAS_ID, montarPost(dados), env.DISCORD_TOKEN);
    const link = linkDoPost(env.GUILD_ID, post.id);

    // Log nunca interrompe: registrarNoLog trata o próprio erro.
    await registrarNoLog(env, { acao: 'Vaga publicada', adminId, link });

    await concluirInteracao(interacao, `Vaga publicada: ${link}`);
  } catch (erro) {
    console.error('Falha ao publicar a vaga:', erro);
    await concluirInteracao(interacao, 'Não consegui publicar a vaga, tente de novo em instantes.');
  }
}
