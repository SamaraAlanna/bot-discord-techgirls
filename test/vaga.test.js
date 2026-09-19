// Testes do /vaga nova em Components V2, com o runner nativo do Node: `npm test`.
// Nada de rede: o fetch global é trocado por um espião que guarda as chamadas.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { CORES, TAGS_AREA, TAGS_MODALIDADE, TAGS_SENIORIDADE } from '../src/config.js';
import { rotear } from '../src/index.js';

const FLAGS_PREVIA = 64 | 32768;

const env = {
  GUILD_ID: 'G1',
  CANAL_VAGAS_ID: 'CV',
  CANAL_LOG_ID: 'CL',
  DISCORD_TOKEN: 'token-de-teste',
};

const pendentes = [];
const ctx = { waitUntil: (promessa) => pendentes.push(promessa) };
const esperarPendentes = () => Promise.all(pendentes.splice(0));

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  pendentes.length = 0;
});

let ultimasChamadas = [];
const edicoesDaPrevia = () => ultimasChamadas.filter((item) => item.url.includes('/webhooks/'));
const ultimaPrevia = () => edicoesDaPrevia().at(-1)?.corpo ?? null;

function espionarApi({ falharEm } = {}) {
  const chamadas = [];
  ultimasChamadas = chamadas;
  globalThis.fetch = async (url, opcoes = {}) => {
    const endereco = String(url);
    chamadas.push({ url: endereco, metodo: opcoes.method ?? 'GET', corpo: JSON.parse(opcoes.body ?? 'null') });

    if (falharEm && endereco.includes(falharEm)) {
      return new Response('{"message":"Missing Access"}', { status: 403 });
    }
    if (endereco.includes('/threads')) {
      return new Response(JSON.stringify({ id: 'POST1', message: { id: 'MSG1' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'MSG1' }), { status: 200 });
  };
  return {
    chamadas,
    post: () => chamadas.find((c) => c.url.includes('/channels/CV/threads')),
    cartao: () => chamadas.find((c) => c.url.includes('/channels/POST1/messages/MSG1')),
    log: () => chamadas.find((c) => c.url.includes('/channels/CL/messages')),
    fechamento: () => edicoesDaPrevia().at(-1),
  };
}

const MEMBRO = {
  nick: 'Sam',
  avatar: null,
  user: { id: 'ADMIN1', username: 'samara', global_name: null, avatar: null },
};

const VAGA = {
  titulo: 'Pessoa Desenvolvedora Back-end',
  empresa: 'Acme',
  link: 'https://vagas.acme.com/back-end?ref=techgirls',
  local: 'São Paulo, SP',
  descricao: 'Time de plataforma, stack Node e AWS.',
};

const ESCOLHAS = { area: 'desenvolvimento', senioridade: 'pleno', modalidade: 'remoto' };

const comando = (subcomando) => ({
  type: 2, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  data: { name: 'vaga', options: [{ name: subcomando, type: 1 }] },
});

const envioDoModal = (campos, membro = MEMBRO) => ({
  type: 5, application_id: 'APP', token: 'tok', guild_id: 'G1', member: membro,
  data: {
    custom_id: 'vaga:nova',
    components: Object.entries(campos).map(([id, valor]) => ({
      type: 18, id: 1, component: { type: 4, id: 2, custom_id: id, value: valor },
    })),
  },
});

const clique = (acao, mensagem, values, membro = MEMBRO) => ({
  type: 3, application_id: 'APP', token: 'tok', guild_id: 'G1', member: membro,
  message: mensagem,
  data: { custom_id: `vaga:${acao}`, ...(values ? { values } : {}) },
});

const responder = async (interacao) => JSON.parse(await (await rotear(interacao, env, ctx)).text());

// Leitura da árvore de componentes.
const achar = (componentes, aceita, achados = []) => {
  for (const item of componentes ?? []) {
    if (aceita(item)) achados.push(item);
    if (item.components) achar(item.components, aceita, achados);
  }
  return achados;
};
const porTipo = (componentes, tipo) => achar(componentes, (item) => item.type === tipo);
const textos = (componentes) => porTipo(componentes, 10).map((item) => item.content);
const porIdDoComponente = (componentes, id) => achar(componentes, (item) => item.id === id)[0] ?? null;
const botoes = (componentes) => porTipo(componentes, 2);
const menu = (componentes, acao) => achar(componentes, (item) => item.custom_id === `vaga:${acao}`)[0];

async function previaPronta(campos = VAGA, membro = MEMBRO) {
  const resposta = await responder(envioDoModal(campos, membro));
  await esperarPendentes();
  const corpo = ultimaPrevia();
  return { resposta, corpo, mensagem: { components: corpo?.components ?? [] } };
}

// Clica e devolve a pré-visualização como ela ficou depois da edição pelo webhook.
async function cliqueEEdicao(acao, mensagem, values, membro = MEMBRO) {
  const resposta = await responder(clique(acao, mensagem, values, membro));
  await esperarPendentes();
  return { resposta, componentes: ultimaPrevia()?.components ?? [] };
}

// Passa pelos três menus, que é o que destrava o Publicar.
async function cartaoCompleto(campos = VAGA, escolhas = ESCOLHAS) {
  let { mensagem } = await previaPronta(campos);
  for (const [chave, valor] of Object.entries(escolhas)) {
    const { componentes } = await cliqueEEdicao(chave, mensagem, [valor]);
    mensagem = { components: componentes };
  }
  return mensagem;
}

describe('comando', () => {
  test('nova abre o formulário com os cinco campos', async () => {
    const modal = (await responder(comando('nova'))).data;

    assert.equal(modal.title, 'Nova vaga');
    assert.deepEqual(
      modal.components.map((label) => label.component.custom_id),
      ['titulo', 'empresa', 'link', 'local', 'descricao'],
    );
    assert.equal(modal.components[0].component.max_length, 100, 'título cabe no nome do post');
    assert.equal(modal.components[4].component.style, 2, 'descrição é parágrafo');
  });

  test('localização e descrição são opcionais, o resto não', async () => {
    const modal = (await responder(comando('nova'))).data;
    const obrigatorio = Object.fromEntries(
      modal.components.map((label) => [label.component.custom_id, label.component.required]),
    );

    assert.deepEqual(obrigatorio, {
      titulo: true, empresa: true, link: true, local: false, descricao: false,
    });
  });

  test('a descrição do campo de localização explica quando preencher', async () => {
    const modal = (await responder(comando('nova'))).data;
    const local = modal.components.find((label) => label.component.custom_id === 'local');

    assert.equal(local.description, 'Opcional para remoto. Se for híbrido ou presencial, informe a cidade.');
  });

  test('subcomando desconhecido não quebra', async () => {
    const resposta = await responder(comando('sortear'));
    assert.match(resposta.data.content, /Não conheço esse subcomando/);
  });
});

describe('pré-visualização em V2', () => {
  test('o callback só adia, e a pré-visualização nasce pela edição', async () => {
    espionarApi();
    const { resposta, corpo } = await previaPronta();

    // Numa resposta adiada a única flag válida é EPHEMERAL: a de Components V2
    // entra na edição seguinte (seção 12).
    assert.equal(resposta.type, 5);
    assert.equal(resposta.data.flags, 64);
    assert.equal(resposta.data.components, undefined);

    assert.equal(corpo.flags, FLAGS_PREVIA);
    assert.equal(corpo.content, undefined);
    assert.equal(corpo.embeds, undefined);
    assert.ok(edicoesDaPrevia()[0].url.includes('/webhooks/APP/tok/messages/@original'));
  });

  test('fora do container ficam título, empresa e descrição', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const soltos = mensagem.components.filter((item) => item.type === 10);

    assert.deepEqual(soltos.map((item) => item.id), [8, 1, 2, 3]);
    assert.equal(soltos[1].content, '# 💼 Pessoa Desenvolvedora Back-end');
    assert.equal(soltos[2].content, '**Acme**');
    assert.equal(soltos[3].content, 'Time de plataforma, stack Node e AWS.');
  });

  test('o container é magenta e traz os dados, o domínio, o botão e a assinatura', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const caixa = porTipo(mensagem.components, 17)[0];

    assert.equal(caixa.accent_color, CORES.VAGA);
    assert.equal(caixa.accent_color, 0xd81e9e);
    assert.deepEqual(
      caixa.components.filter((item) => item.type === 10).map((item) => [item.id, item.content]),
      [
        [10, '🧭 **Área:** Ainda não escolhido'],
        [11, '📊 **Senioridade:** Ainda não escolhido'],
        [12, '🏠 **Modalidade:** Ainda não escolhido'],
        [13, '📍 **Local:** São Paulo, SP'],
        [5, '🔗 Candidatar-se em **vagas.acme.com**'],
        [7, '-# Autora: <@ADMIN1>'],
      ],
    );

    const botao = botoes(caixa.components).find((item) => item.style === 5);
    assert.equal(botao.label, 'Candidatar-se');
    assert.equal(botao.url, VAGA.link, 'o link completo fica no botão');
  });

  test('sem localização, a linha de local não aparece', async () => {
    espionarApi();
    const { mensagem } = await previaPronta({ ...VAGA, local: '' });
    assert.equal(porIdDoComponente(mensagem.components, 13), null);
  });

  test('sem descrição, o texto solto não aparece', async () => {
    espionarApi();
    const { mensagem } = await previaPronta({ ...VAGA, descricao: '' });
    assert.equal(porIdDoComponente(mensagem.components, 3), null);
  });

  test('não tem separador nenhum', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    assert.equal(porTipo(mensagem.components, 14).length, 0);
  });

  test('traz os três menus com as tags do config e o Publicar travado', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();

    assert.deepEqual(menu(mensagem.components, 'area').options.map((o) => o.value), TAGS_AREA.map((t) => t.valor));
    assert.deepEqual(
      menu(mensagem.components, 'senioridade').options.map((o) => o.value),
      TAGS_SENIORIDADE.map((t) => t.valor),
    );
    assert.deepEqual(
      menu(mensagem.components, 'modalidade').options.map((o) => o.value),
      TAGS_MODALIDADE.map((t) => t.valor),
    );
    assert.equal(botoes(mensagem.components).find((item) => item.label === 'Publicar').disabled, true);
    assert.equal(textos(mensagem.components)[0], 'Confira como vai ficar e escolha ainda: área, senioridade, modalidade.');
  });
});

describe('validação', () => {
  // Erro de validação também nasce adiado: ele é um card V2 com o rascunho dentro.
  async function erroDe(campos) {
    espionarApi();
    const resposta = await responder(envioDoModal(campos));
    await esperarPendentes();
    return { resposta, corpo: ultimaPrevia() };
  }

  test('link sem https vira frase de erro com o botão Corrigir', async () => {
    const { resposta, corpo } = await erroDe({ ...VAGA, link: 'vagas.acme.com' });

    assert.equal(resposta.type, 5, 'o erro também nasce adiado');
    assert.equal(corpo.flags, FLAGS_PREVIA);
    assert.match(textos(corpo.components)[0], /precisa começar com https/);
    assert.ok(botoes(corpo.components).find((item) => item.custom_id === 'vaga:corrigir'));
  });

  test('sem link, recusa', async () => {
    const { corpo } = await erroDe({ ...VAGA, link: '' });
    assert.match(textos(corpo.components)[0], /O link é obrigatório/);
  });

  test('sem empresa, recusa', async () => {
    const { corpo } = await erroDe({ ...VAGA, empresa: '' });
    assert.match(textos(corpo.components)[0], /Título do cargo e empresa são obrigatórios/);
  });

  test('o motivo real do erro vai para o console antes da frase', async () => {
    const registrado = [];
    const original = console.error;
    console.error = (...args) => registrado.push(args.map(String).join(' '));

    try {
      await erroDe({ ...VAGA, link: 'vagas.acme.com' });
    } finally {
      console.error = original;
    }

    assert.match(registrado.join(' '), /\[vaga\] falhou em envio do formulário: link recusado/);
  });

  test('Corrigir reabre o formulário preenchido', async () => {
    const { corpo } = await erroDe({ ...VAGA, link: 'vagas.acme.com' });
    const resposta = await responder(clique('corrigir', { components: corpo.components }));

    assert.equal(resposta.type, 9);
    const valores = Object.fromEntries(
      resposta.data.components.map((label) => [label.component.custom_id, label.component.value]),
    );
    assert.equal(valores.titulo, VAGA.titulo);
    assert.equal(valores.empresa, VAGA.empresa);
    assert.equal(valores.local, VAGA.local);
    assert.equal(valores.descricao, VAGA.descricao);
  });
});

describe('as três seleções', () => {
  test('cada escolha adia, edita pelo webhook e atualiza o card', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();

    const { resposta, componentes } = await cliqueEEdicao('area', mensagem, ['dados']);

    assert.equal(resposta.type, 6, 'adia e edita, como manda a regra de V2');
    assert.equal(porIdDoComponente(componentes, 10).content, '🧭 **Área:** Dados');
    assert.equal(porIdDoComponente(componentes, 11).content, '📊 **Senioridade:** Ainda não escolhido');
    assert.equal(textos(componentes)[0], 'Confira como vai ficar e escolha ainda: senioridade, modalidade.');
  });

  test('Publicar só habilita com as três escolhas', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();

    const duas = await cliqueEEdicao('senioridade', { components: (await cliqueEEdicao('area', mensagem, ['dados'])).componentes }, ['junior']);
    assert.equal(botoes(duas.componentes).find((item) => item.label === 'Publicar').disabled, true);

    const tres = await cliqueEEdicao('modalidade', { components: duas.componentes }, ['remoto']);
    assert.equal(botoes(tres.componentes).find((item) => item.label === 'Publicar').disabled, false);
    assert.equal(textos(tres.componentes)[0], 'Confira como vai ficar e publique quando estiver boa.');
  });

  test('o texto e as outras escolhas sobrevivem a cada atualização', async () => {
    espionarApi();
    const card = await cartaoCompleto();

    assert.equal(porIdDoComponente(card.components, 1).content, '# 💼 Pessoa Desenvolvedora Back-end');
    assert.equal(porIdDoComponente(card.components, 2).content, '**Acme**');
    assert.equal(porIdDoComponente(card.components, 13).content, '📍 **Local:** São Paulo, SP');
    assert.equal(menu(card.components, 'area').options.find((o) => o.default).value, 'desenvolvimento');
    assert.equal(menu(card.components, 'senioridade').options.find((o) => o.default).value, 'pleno');
  });
});

describe('publicar', () => {
  test('cria o post no fórum com o título do cargo e as tags pelos IDs', async () => {
    const api = espionarApi();
    const card = await cartaoCompleto();

    const resposta = await responder(clique('publicar', card));
    assert.equal(resposta.type, 6);
    await esperarPendentes();

    const post = api.post();
    assert.equal(post.corpo.name, 'Pessoa Desenvolvedora Back-end');
    assert.deepEqual(post.corpo.applied_tags, [
      TAGS_AREA.find((t) => t.valor === 'desenvolvimento').id,
      TAGS_SENIORIDADE.find((t) => t.valor === 'pleno').id,
      TAGS_MODALIDADE.find((t) => t.valor === 'remoto').id,
    ]);
    assert.equal(post.corpo.applied_tags.every((id) => /^\d{17,20}$/.test(id)), true, 'tag por ID, não por nome');
  });

  test('o post nasce em texto simples, porque a criação não aceita a flag V2', async () => {
    const api = espionarApi();
    const card = await cartaoCompleto();

    await responder(clique('publicar', card));
    await esperarPendentes();

    const mensagem = api.post().corpo.message;
    assert.equal(mensagem.flags, undefined, 'a criação não leva flag');
    assert.match(mensagem.content, /💼 \*\*Pessoa Desenvolvedora Back-end\*\*/);
    assert.match(mensagem.content, /🔗 Candidatar-se: https:\/\/vagas\.acme\.com/);
    assert.deepEqual(mensagem.allowed_mentions, { parse: [] }, 'vaga não menciona ninguém');
  });

  test('logo depois, a primeira mensagem vira o card em V2', async () => {
    const api = espionarApi();
    const card = await cartaoCompleto();

    await responder(clique('publicar', card));
    await esperarPendentes();

    const edicao = api.cartao();
    assert.equal(edicao.metodo, 'PATCH');
    assert.equal(edicao.corpo.flags, 32768);
    assert.equal(edicao.corpo.content, null, 'o texto simples sai quando o V2 entra');
    assert.deepEqual(edicao.corpo.embeds, []);

    const caixa = porTipo(edicao.corpo.components, 17)[0];
    assert.equal(caixa.accent_color, CORES.VAGA);
    assert.equal(porIdDoComponente(edicao.corpo.components, 10).content, '🧭 **Área:** Desenvolvimento');
    assert.equal(botoes(edicao.corpo.components).filter((item) => item.custom_id).length, 0, 'sem controles');
    assert.equal(achar(edicao.corpo.components, (item) => item.type === 3).length, 0, 'sem menus');
  });

  test('registra no log e confirma com o link do post', async () => {
    const api = espionarApi();
    const card = await cartaoCompleto();

    await responder(clique('publicar', card));
    await esperarPendentes();

    const esperado = /^Vaga publicada por <@ADMIN1> · https:\/\/discord\.com\/channels\/G1\/POST1 · <t:\d+:f>$/;
    assert.match(api.log().corpo.content, esperado);
    assert.match(api.fechamento().corpo.components[0].content, /Vaga publicada: https:\/\/discord\.com\/channels\/G1\/POST1/);
  });

  test('se o card falhar, a vaga continua publicada e a admin fica sabendo', async () => {
    const api = espionarApi({ falharEm: '/channels/POST1/messages/' });
    const card = await cartaoCompleto();

    await responder(clique('publicar', card));
    await esperarPendentes();

    assert.ok(api.post(), 'o post saiu');
    assert.ok(api.log(), 'o log foi escrito');
    assert.match(api.fechamento().corpo.components[0].content, /ficou com o visual simples/);
  });

  test('se o post falhar, nada é publicado', async () => {
    const api = espionarApi({ falharEm: '/threads' });
    const card = await cartaoCompleto();

    await responder(clique('publicar', card));
    await esperarPendentes();

    assert.equal(api.cartao(), undefined);
    assert.equal(api.log(), undefined);
    assert.match(api.fechamento().corpo.components[0].content, /Não consegui publicar a vaga/);
  });

  test('a autora do post é quem clicou em Publicar', async () => {
    const api = espionarApi();
    const outra = { nick: null, avatar: null, user: { id: 'ADMIN2', username: 'bia', global_name: 'Beatriz', avatar: null } };
    const card = await cartaoCompleto();

    await responder(clique('publicar', card, undefined, outra));
    await esperarPendentes();

    assert.equal(porIdDoComponente(api.cartao().corpo.components, 7).content, '-# Autora: <@ADMIN2>');
    assert.match(api.log().corpo.content, /por <@ADMIN2>/);
  });

  test('sem as três escolhas, não publica e diz o que falta', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    const comArea = await cliqueEEdicao('area', mensagem, ['qa']);

    const resposta = await responder(clique('publicar', { components: comArea.componentes }));

    assert.match(resposta.data.content, /Escolha ainda senioridade, modalidade/);
    assert.equal(api.post(), undefined);
  });
});

describe('cancelar', () => {
  test('troca o card pela frase, sem publicar nada', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();

    const { resposta, componentes } = await cliqueEEdicao('cancelar', mensagem);

    assert.equal(resposta.type, 6);
    assert.deepEqual(textos(componentes), ['Publicação cancelada.']);
    assert.equal(api.post(), undefined);
  });
});

describe('encerrar', () => {
  const TAG_ENCERRADA = '1549751166152343633';
  const TAGS_DO_POST = ['1549751047856332860', '1549750896567779369', '1549750989618151464'];

  const CARTAO_PUBLICADO = [
    { type: 10, id: 1, content: '# 💼 Pessoa Desenvolvedora Back-end' },
    { type: 10, id: 2, content: '**Acme**' },
    {
      type: 17,
      id: 4,
      accent_color: 0xd81e9e,
      components: [
        { type: 10, id: 10, content: '🧭 **Área:** Desenvolvimento' },
        { type: 10, id: 7, content: '-# Autora: <@ADMIN1>' },
      ],
    },
  ];

  // O comando roda dentro do post: a interação traz o canal parcial, com o pai.
  const comandoEncerrar = ({ pai = 'CV', canal = 'POST1', membro = MEMBRO } = {}) => ({
    type: 2,
    application_id: 'APP',
    token: 'tok',
    guild_id: 'G1',
    member: membro,
    channel: { id: canal, type: 11, parent_id: pai },
    data: { name: 'vaga', options: [{ name: 'encerrar', type: 1 }] },
  });

  function espionarPost({ tags = TAGS_DO_POST, componentes = CARTAO_PUBLICADO, falharEm } = {}) {
    const chamadas = [];
    ultimasChamadas = chamadas;
    globalThis.fetch = async (url, opcoes = {}) => {
      const endereco = String(url);
      const metodo = opcoes.method ?? 'GET';
      chamadas.push({ url: endereco, metodo, corpo: JSON.parse(opcoes.body ?? 'null') });

      if (falharEm && falharEm({ url: endereco, metodo })) {
        return new Response('{"message":"Missing Access"}', { status: 403 });
      }
      if (metodo === 'GET' && endereco.endsWith('/channels/POST1')) {
        return new Response(JSON.stringify({ id: 'POST1', applied_tags: tags }), { status: 200 });
      }
      if (metodo === 'GET' && endereco.endsWith('/channels/POST1/messages/POST1')) {
        return new Response(JSON.stringify({ id: 'POST1', components: componentes }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };
    return {
      chamadas,
      canal: (corpoTem) => chamadas.find((c) => c.metodo === 'PATCH' && c.url.endsWith('/channels/POST1') && corpoTem(c.corpo)),
      cartao: () => chamadas.find((c) => c.metodo === 'PATCH' && c.url.endsWith('/channels/POST1/messages/POST1')),
      log: () => chamadas.find((c) => c.url.includes('/channels/CL/messages')),
      fim: () => [...chamadas].reverse().find((c) => c.url.includes('/messages/@original'))?.corpo,
    };
  }

  test('fora de um post do fórum de vagas, só explica onde usar', async () => {
    const api = espionarPost();
    const resposta = await responder(comandoEncerrar({ pai: 'OUTRO' }));

    assert.equal(resposta.type, 4);
    assert.equal(resposta.data.flags, 64);
    assert.match(resposta.data.content, /dentro do post da vaga/);
    assert.equal(api.chamadas.length, 0, 'não toca em nada');
  });

  test('num canal comum, que nem tem pai, também explica', async () => {
    espionarPost();
    const semPai = comandoEncerrar();
    delete semPai.channel.parent_id;

    const resposta = await responder(semPai);
    assert.match(resposta.data.content, /dentro do post da vaga/);
  });

  test('dentro do post, adia e registra o trabalho', async () => {
    espionarPost();
    const resposta = await responder(comandoEncerrar());

    assert.equal(resposta.type, 5, 'adia: são várias chamadas à API');
    assert.equal(resposta.data.flags, 64);
    assert.ok(pendentes.length > 0, 'deixou trabalho no waitUntil');
    await esperarPendentes();
  });

  test('aplica a tag Encerrada mantendo as demais, e tranca', async () => {
    const api = espionarPost();
    await responder(comandoEncerrar());
    await esperarPendentes();

    const edicao = api.canal((corpo) => corpo.applied_tags);
    assert.deepEqual(edicao.corpo.applied_tags, [...TAGS_DO_POST, TAG_ENCERRADA]);
    assert.equal(edicao.corpo.locked, true);
    assert.equal(edicao.corpo.archived, undefined, 'arquivar é outro passo');
  });

  test('arquiva por último, depois de recolorir o card', async () => {
    const api = espionarPost();
    await responder(comandoEncerrar());
    await esperarPendentes();

    // Só as edições do próprio post: a última é a confirmação para a admin.
    const ordem = api.chamadas
      .filter((c) => c.metodo === 'PATCH' && c.url.includes('/channels/POST1'))
      .map((c) => (c.url.endsWith('/messages/POST1') ? 'card' : (c.corpo?.archived ? 'arquivar' : 'tags')));

    assert.deepEqual(ordem, ['tags', 'card', 'arquivar']);
  });

  test('o card fica roxo-700', async () => {
    const api = espionarPost();
    await responder(comandoEncerrar());
    await esperarPendentes();

    const container = api.cartao().corpo.components.find((item) => item.type === 17);
    assert.equal(container.accent_color, CORES.ENCERRADA);
    assert.equal(container.accent_color, 0x4a2a8c);
    assert.equal(container.components[0].content, '🧭 **Área:** Desenvolvimento', 'o resto do card não muda');
  });

  test('post no limite de tags: nenhuma tag é removida', async () => {
    const cheio = ['1', '2', '3', '4', '5'];
    const api = espionarPost({ tags: cheio });
    await responder(comandoEncerrar());
    await esperarPendentes();

    const edicao = api.canal((corpo) => corpo.locked);
    assert.equal(edicao.corpo.applied_tags, undefined, 'não mexe nas tags que a admin escolheu');
    assert.equal(edicao.corpo.locked, true, 'tranca do mesmo jeito');
  });

  test('post no limite de tags: recolore, arquiva e avisa a admin', async () => {
    const api = espionarPost({ tags: ['1', '2', '3', '4', '5'] });
    await responder(comandoEncerrar());
    await esperarPendentes();

    assert.ok(api.cartao(), 'o card foi recolorido');
    assert.ok(api.canal((corpo) => corpo.archived), 'o post foi arquivado');
    assert.ok(api.log(), 'o log foi escrito');
    assert.equal(
      api.fim().components[0].content,
      'Vaga encerrada, mas o post está no limite de tags e ficou sem a tag Encerrada.',
    );
  });

  test('post no limite de tags: o motivo vai para o console', async () => {
    const registrado = [];
    const original = console.error;
    console.error = (...args) => registrado.push(args.map(String).join(' '));

    try {
      espionarPost({ tags: ['1', '2', '3', '4', '5'] });
      await responder(comandoEncerrar());
      await esperarPendentes();
    } finally {
      console.error = original;
    }

    assert.match(registrado.join(' '), /\[vaga encerrar\] falhou em tags: post no limite de 5 tags/);
  });

  test('vaga já encerrada não mexe em nada', async () => {
    const api = espionarPost({ tags: [...TAGS_DO_POST, TAG_ENCERRADA] });
    await responder(comandoEncerrar());
    await esperarPendentes();

    assert.equal(api.canal(() => true), undefined, 'nenhuma edição do post');
    assert.equal(api.log(), undefined);
    assert.match(api.fim().components[0].content, /já está encerrada/);
  });

  test('registra no log e confirma', async () => {
    const api = espionarPost();
    await responder(comandoEncerrar());
    await esperarPendentes();

    const esperado = /^Vaga encerrada por <@ADMIN1> · https:\/\/discord\.com\/channels\/G1\/POST1 · <t:\d+:f>$/;
    assert.match(api.log().corpo.content, esperado);
    assert.deepEqual(api.log().corpo.allowed_mentions, { parse: [] });
    assert.equal(api.fim().components[0].content, 'Vaga encerrada.');
  });

  test('se a tag falhar, nada é encerrado e a admin sabe', async () => {
    const api = espionarPost({ falharEm: ({ url, metodo }) => metodo === 'PATCH' && url.endsWith('/channels/POST1') });
    await responder(comandoEncerrar());
    await esperarPendentes();

    assert.equal(api.cartao(), undefined, 'não recolore');
    assert.equal(api.log(), undefined, 'não registra no log');
    assert.match(api.fim().components[0].content, /Não consegui encerrar a vaga/);
  });

  test('se a cor falhar, o encerramento segue e a admin é avisada', async () => {
    const api = espionarPost({ falharEm: ({ url, metodo }) => metodo === 'PATCH' && url.endsWith('/messages/POST1') });
    await responder(comandoEncerrar());
    await esperarPendentes();

    assert.ok(api.canal((corpo) => corpo.applied_tags), 'a tag foi aplicada');
    assert.ok(api.log(), 'o log foi escrito');
    assert.match(api.fim().components[0].content, /ficou com a cor antiga/);
  });

  test('post sem card não quebra o encerramento', async () => {
    const api = espionarPost({ componentes: [] });
    await responder(comandoEncerrar());
    await esperarPendentes();

    assert.equal(api.cartao(), undefined, 'não tenta editar o que não existe');
    assert.ok(api.log());
    assert.match(api.fim().components[0].content, /ficou com a cor antiga/);
  });

  describe('recoloração do card', () => {
    // Editar mensagem V2 sem a flag faz os componentes serem descartados, e o post
    // fica com "a mensagem original foi excluída". É o bug que estes testes seguram.
    test('a edição vai com a flag de Components V2', async () => {
      const api = espionarPost();
      await responder(comandoEncerrar());
      await esperarPendentes();

      assert.equal(api.cartao().corpo.flags, 32768);
    });

    test('preserva todos os componentes, mudando só a cor', async () => {
      const api = espionarPost();
      await responder(comandoEncerrar());
      await esperarPendentes();

      const enviados = api.cartao().corpo.components;
      assert.equal(enviados.length, CARTAO_PUBLICADO.length, 'nenhum componente some');

      const semCor = (lista) => JSON.parse(JSON.stringify(lista), (chave, valor) => (chave === 'accent_color' ? undefined : valor));
      assert.deepEqual(semCor(enviados), semCor(CARTAO_PUBLICADO), 'só a cor muda');

      const container = enviados.find((item) => item.type === 17);
      assert.equal(container.components.length, 2, 'o conteúdo do container continua lá');
    });

    test('nunca edita com componentes vazios', async () => {
      const api = espionarPost({ componentes: [] });
      await responder(comandoEncerrar());
      await esperarPendentes();

      assert.equal(api.cartao(), undefined, 'não toca na mensagem publicada');
      assert.match(api.fim().components[0].content, /ficou com a cor antiga/);
    });

    test('nunca edita quando não acha o container', async () => {
      const api = espionarPost({ componentes: [{ type: 10, id: 1, content: '💼 vaga antiga em texto simples' }] });
      await responder(comandoEncerrar());
      await esperarPendentes();

      assert.equal(api.cartao(), undefined);
      assert.match(api.fim().components[0].content, /ficou com a cor antiga/);
    });
  });

  describe('a interação sempre conclui', () => {
    // Qualquer caminho tem que fechar o "está pensando", inclusive quando algo falha.
    const CAMINHOS = [
      ['tudo certo', {}],
      ['post já encerrado', { tags: ['1', TAG_ENCERRADA] }],
      ['falha na tag', { falharEm: ({ url, metodo }) => metodo === 'PATCH' && url.endsWith('/channels/POST1') }],
      ['falha na cor', { falharEm: ({ url, metodo }) => metodo === 'PATCH' && url.endsWith('/messages/POST1') }],
      ['falha ao ler o post', { falharEm: ({ url, metodo }) => metodo === 'GET' && url.endsWith('/channels/POST1') }],
      ['post sem card', { componentes: [] }],
    ];

    for (const [nome, opcoes] of CAMINHOS) {
      test(`${nome}: a resposta adiada é fechada`, async () => {
        const api = espionarPost(opcoes);
        const original = console.error;
        console.error = () => {};

        try {
          await responder(comandoEncerrar());
          await esperarPendentes();
        } finally {
          console.error = original;
        }

        const fim = api.fim();
        assert.ok(fim, `${nome}: nada fechou a interação`);
        // A frase também é componente, e a edição precisa da flag.
        assert.equal(fim.flags, 64 | 32768, `${nome}: sem a flag a frase não aparece`);
        assert.ok(String(fim.components?.[0]?.content ?? '').trim(), `${nome}: frase vazia`);
      });
    }
  });

  test('todo erro deixa o motivo no console', async () => {
    const registrado = [];
    const original = console.error;
    console.error = (...args) => registrado.push(args.map(String).join(' '));

    try {
      espionarPost({ falharEm: ({ url, metodo }) => metodo === 'PATCH' && url.endsWith('/channels/POST1') });
      await responder(comandoEncerrar());
      await esperarPendentes();
    } finally {
      console.error = original;
    }

    assert.match(registrado.join(' '), /\[vaga encerrar\] falhou em tag e trancamento/);
    assert.match(registrado.join(' '), /Missing Access/);
  });
});

describe('trabalho adiado', () => {
  // Toda resposta adiada precisa deixar trabalho no waitUntil, senão o Discord fica
  // preso em "está pensando" e o Worker encerra sem fazer nada.
  const ADIADOS = [5, 6];

  async function cada(interacao) {
    const resposta = await responder(interacao);
    const pendentesAgora = pendentes.length;
    await esperarPendentes();
    return { resposta, pendentesAgora };
  }

  test('todo caminho adiado registra trabalho no waitUntil', async () => {
    espionarApi();
    const conferidos = [];

    const registrar = async (onde, interacao) => {
      const { resposta, pendentesAgora } = await cada(interacao);
      if (ADIADOS.includes(resposta.type)) {
        assert.ok(pendentesAgora > 0, `${onde}: adiou sem registrar trabalho no waitUntil`);
        conferidos.push(onde);
      }
      return resposta;
    };

    await registrar('envio do formulário', envioDoModal(VAGA));
    let mensagem = { components: ultimaPrevia().components };

    await registrar('erro de validação', envioDoModal({ ...VAGA, link: 'errado' }));

    for (const [chave, valor] of Object.entries(ESCOLHAS)) {
      await registrar(`menu ${chave}`, clique(chave, mensagem, [valor]));
      mensagem = { components: ultimaPrevia().components };
    }

    await registrar('publicar', clique('publicar', mensagem));
    await registrar('cancelar', clique('cancelar', mensagem));

    assert.deepEqual(conferidos, [
      'envio do formulário',
      'erro de validação',
      'menu area',
      'menu senioridade',
      'menu modalidade',
      'publicar',
      'cancelar',
    ]);
  });

  test('cada adiamento produz de fato uma edição da resposta original', async () => {
    const api = espionarApi();

    await responder(envioDoModal(VAGA));
    await esperarPendentes();

    const edicoes = api.chamadas.filter((c) => c.url.includes('/messages/@original'));
    assert.equal(edicoes.length, 1);
    assert.equal(edicoes[0].metodo, 'PATCH');
  });

  test('se a primeira edição falhar, tenta de novo antes de desistir', async () => {
    let tentativas = 0;
    globalThis.fetch = async (url, opcoes = {}) => {
      const endereco = String(url);
      if (endereco.includes('/messages/@original')) {
        tentativas += 1;
        // A primeira falha, como aconteceria se a mensagem ainda não existisse.
        if (tentativas === 1) return new Response('{"message":"Unknown Message"}', { status: 404 });
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const registrado = [];
    const original = console.error;
    console.error = (...args) => registrado.push(args.map(String).join(' '));

    try {
      await responder(envioDoModal(VAGA));
      await esperarPendentes();
    } finally {
      console.error = original;
    }

    assert.equal(tentativas, 2, 'insistiu uma vez');
    assert.match(registrado.join(' '), /\[vaga\] falhou em edição da pré-visualização/);
    assert.match(registrado.join(' '), /Unknown Message/, 'o motivo real vai para o console');
  });

  test('se as duas tentativas falharem, a admin recebe uma frase em vez de espera infinita', async () => {
    const chamadas = [];
    globalThis.fetch = async (url, opcoes = {}) => {
      const endereco = String(url);
      const corpo = JSON.parse(opcoes.body ?? 'null');
      chamadas.push({ url: endereco, corpo });

      // Só a edição com componentes falha; a de texto simples passa.
      if (endereco.includes('/messages/@original') && corpo?.components) {
        return new Response('{"message":"Invalid Form Body"}', { status: 400 });
      }
      return new Response('{}', { status: 200 });
    };

    const original = console.error;
    console.error = () => {};
    try {
      await responder(envioDoModal(VAGA));
      await esperarPendentes();
    } finally {
      console.error = original;
    }

    const aviso = chamadas.at(-1);
    assert.match(aviso.corpo.content, /Não consegui montar a pré-visualização/);
    assert.equal(aviso.corpo.components, undefined, 'o aviso não depende de componentes');
  });
});

describe('regras de Components V2', () => {
  const FLAG_V2 = 32768;

  // Passa por todo o fluxo e devolve as respostas de callback e as edições.
  async function todoOFluxo() {
    const api = espionarApi();
    const callbacks = [];
    const guardar = async (onde, interacao) => {
      const resposta = await responder(interacao);
      callbacks.push([onde, resposta]);
      await esperarPendentes();
      return resposta;
    };

    await guardar('comando nova', comando('nova'));
    await guardar('comando encerrar', comando('encerrar'));
    await guardar('envio do formulário', envioDoModal(VAGA));

    let mensagem = { components: ultimaPrevia().components };
    await guardar('erro de link', envioDoModal({ ...VAGA, link: 'errado' }));
    await guardar('Corrigir', clique('corrigir', { components: ultimaPrevia().components }));

    for (const [chave, valor] of Object.entries(ESCOLHAS)) {
      await guardar(`menu ${chave}`, clique(chave, mensagem, [valor]));
      mensagem = { components: ultimaPrevia().components };
    }

    await guardar('publicar', clique('publicar', mensagem));
    await guardar('cancelar', clique('cancelar', mensagem));
    await guardar('botão desconhecido', clique('sumiu', mensagem));

    return { api, callbacks };
  }

  test('nenhuma resposta de callback cria mensagem com a flag V2', async () => {
    const { callbacks } = await todoOFluxo();

    assert.ok(callbacks.length >= 9, `varreu poucas respostas: ${callbacks.length}`);
    for (const [onde, resposta] of callbacks) {
      const flags = resposta.data?.flags ?? 0;
      assert.equal(flags & FLAG_V2, 0, `${onde}: o callback não pode criar mensagem em V2`);

      // Quem leva componentes V2 é sempre a edição, nunca a resposta direta.
      const ehModal = resposta.type === 9;
      const ehEfemeraSimples = resposta.type === 4 && resposta.data?.content;
      const ehAdiamento = resposta.type === 5 || resposta.type === 6;
      assert.ok(ehModal || ehEfemeraSimples || ehAdiamento, `${onde}: tipo de resposta inesperado ${resposta.type}`);
    }
  });

  test('nenhuma edição ou publicação leva content, embeds ou texto vazio', async () => {
    const { api } = await todoOFluxo();
    const saidas = api.chamadas.filter((chamada) => chamada.corpo?.components);

    assert.ok(saidas.length >= 6, `varreu poucas saídas: ${saidas.length}`);
    for (const { url, corpo } of saidas) {
      assert.equal(corpo.content ?? null, null, `${url}: mensagem V2 não leva content`);
      assert.deepEqual(corpo.embeds ?? [], [], `${url}: mensagem V2 não leva embeds`);

      const vazios = achar(corpo.components, (item) => item.type === 10 && !String(item.content ?? '').trim());
      assert.deepEqual(vazios, [], `${url}: Text Display sem texto`);

      const ids = achar(corpo.components, (item) => item.type === 10).map((item) => item.id);
      assert.equal(ids.includes(undefined), false, `${url}: todo texto tem id`);
      assert.deepEqual(ids, [...new Set(ids)], `${url}: ids repetidos`);
    }
  });

  test('toda chamada a rota de webhook leva with_components=true', async () => {
    const { api } = await todoOFluxo();
    const webhooks = api.chamadas.filter((chamada) => chamada.url.includes('/webhooks/'));

    assert.ok(webhooks.length >= 6);
    for (const chamada of webhooks) {
      // Sem o parâmetro, a doc diz que o campo components é ignorado: a chamada
      // volta 200 e a mensagem não muda.
      assert.ok(chamada.url.includes('with_components=true'), chamada.url);
    }
  });

  test('toda edição da pré-visualização vai com a flag V2 e pelo webhook', async () => {
    const { api } = await todoOFluxo();
    const edicoes = api.chamadas.filter((chamada) => chamada.url.includes('/webhooks/'));

    assert.ok(edicoes.length >= 6);
    for (const edicao of edicoes) {
      assert.equal(edicao.metodo, 'PATCH');
      assert.ok(edicao.url.includes('/messages/@original'), edicao.url);
      // O fechamento manda só a frase, sem flag; o resto é card e vai com a flag.
      if (edicao.corpo.flags !== undefined) assert.equal(edicao.corpo.flags, FLAGS_PREVIA);
    }
  });
});

