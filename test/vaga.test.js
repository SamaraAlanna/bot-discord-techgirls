// Testes do fluxo de vaga, com o runner nativo do Node: `npm test`.
// Nada de rede: o fetch global é trocado por um espião que guarda as chamadas.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { CORES, TAGS_AREA, TAGS_MODALIDADE, TAGS_SENIORIDADE } from '../src/config.js';
import { rotear } from '../src/index.js';

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

// Espião de API: o post de fórum devolve um canal, que é a própria thread.
function espionarApi({ falharEm } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), metodo: opcoes.method, corpo: JSON.parse(opcoes.body) });
    if (falharEm && String(url).includes(falharEm)) {
      return new Response('{"message":"Missing Access"}', { status: 403 });
    }
    return new Response(JSON.stringify({ id: 'POST1' }), { status: 200 });
  };
  return {
    chamadas,
    post: () => chamadas.find((c) => c.url.includes('/channels/CV/threads')),
    log: () => chamadas.find((c) => c.url.includes('/channels/CL/messages')),
    fechamento: () => chamadas.find((c) => c.metodo === 'PATCH'),
  };
}

const MEMBRO = {
  nick: 'Sam',
  avatar: null,
  user: { id: 'ADMIN1', username: 'samara', global_name: 'Samara Alanna', avatar: null },
};

const comando = (subcomando) => ({
  type: 2,
  application_id: 'APP',
  token: 'token-da-interacao',
  guild_id: 'G1',
  member: MEMBRO,
  data: { name: 'vaga', options: [{ name: subcomando, type: 1 }] },
});

const envioDeModal = (campos, membro = MEMBRO) => ({
  type: 5,
  application_id: 'APP',
  token: 'token-da-interacao',
  guild_id: 'G1',
  member: membro,
  data: {
    custom_id: 'vaga:modal',
    components: Object.entries(campos).map(([id, valor]) => ({
      type: 18,
      id: 1,
      component: { type: 4, id: 2, custom_id: id, value: valor },
    })),
  },
});

const componente = (custom_id, { embed, values, membro = MEMBRO } = {}) => ({
  type: 3,
  application_id: 'APP',
  token: 'token-da-interacao',
  guild_id: 'G1',
  member: membro,
  message: { embeds: embed ? [embed] : [] },
  data: { custom_id, ...(values ? { values } : {}) },
});

const responder = async (interacao) => JSON.parse(await (await rotear(interacao, env, ctx)).text());

const VAGA_BASE = {
  titulo: 'Pessoa Desenvolvedora Back-end',
  empresa: 'Acme',
  link: 'https://vagas.acme.com/back-end?ref=techgirls',
  local: 'São Paulo, SP',
  descricao: 'Time de plataforma, stack Node e AWS.',
};

const ESCOLHAS = { area: 'desenvolvimento', senioridade: 'pleno', modalidade: 'remoto' };

// Envia o modal e aplica as seleções pedidas, devolvendo o card e a última resposta.
async function preencher(escolhas = ESCOLHAS, campos = VAGA_BASE, membro = MEMBRO) {
  let resposta = await responder(envioDeModal(campos, membro));
  let embed = resposta.data.embeds[0];

  for (const [chave, valor] of Object.entries(escolhas)) {
    resposta = await responder(componente(`vaga:${chave}`, { embed, values: [valor], membro }));
    embed = resposta.data.embeds[0];
  }
  return { embed, resposta };
}

describe('comando /vaga', () => {
  test('nova abre o modal com os cinco campos da seção 8.1', async () => {
    const modal = (await responder(comando('nova'))).data;

    assert.equal(modal.title, 'Nova vaga');
    assert.deepEqual(
      modal.components.map((label) => label.component.custom_id),
      ['titulo', 'empresa', 'link', 'local', 'descricao'],
    );
    assert.equal(modal.components.every((label) => label.type === 18), true, 'todo campo vem em Label');
    assert.equal(modal.components[4].component.style, 2, 'descrição é parágrafo');
    assert.equal(modal.components[0].component.max_length, 100, 'título cabe no nome do post');
  });

  test('encerrar ainda avisa que está em construção', async () => {
    const resposta = await responder(comando('encerrar'));
    assert.match(resposta.data.content, /ainda está sendo construído/);
  });
});

describe('envio do modal', () => {
  test('gera pré-visualização efêmera com Publicar desabilitado', async () => {
    const resposta = await responder(envioDeModal(VAGA_BASE));

    assert.equal(resposta.type, 4);
    assert.equal(resposta.data.flags, 64);

    const embed = resposta.data.embeds[0];
    assert.equal(embed.color, CORES.VAGA);
    assert.equal(embed.color, 0xd81e9e, 'vaga é magenta-500');
    assert.equal(embed.title, '💼 Pessoa Desenvolvedora Back-end');
    assert.equal(embed.description, 'Time de plataforma, stack Node e AWS.');
    assert.equal(campo(embed, 'Empresa'), 'Acme');
    assert.equal(campo(embed, 'Localização'), 'São Paulo, SP');
    assert.equal(resposta.data.components[3].components[0].disabled, true);
  });

  test('pede as três escolhas que faltam', async () => {
    const resposta = await responder(envioDeModal(VAGA_BASE));
    assert.equal(resposta.data.content, 'Confira como vai ficar e escolha ainda: área, senioridade, modalidade.');
  });

  test('mostra os três menus, cada um com as tags do config', async () => {
    const componentes = (await responder(envioDeModal(VAGA_BASE))).data.components;
    const menus = componentes.slice(0, 3).map((linha) => linha.components[0]);

    assert.deepEqual(menus.map((menu) => menu.custom_id), ['vaga:area', 'vaga:senioridade', 'vaga:modalidade']);
    assert.deepEqual(menus[0].options.map((o) => o.value), TAGS_AREA.map((t) => t.valor));
    assert.deepEqual(menus[1].options.map((o) => o.value), TAGS_SENIORIDADE.map((t) => t.valor));
    assert.deepEqual(menus[2].options.map((o) => o.value), TAGS_MODALIDADE.map((t) => t.valor));
  });

  test('exige link com https', async () => {
    const resposta = await responder(envioDeModal({ ...VAGA_BASE, link: 'http://vagas.acme.com' }));
    assert.equal(resposta.data.flags, 64);
    assert.match(resposta.data.content, /precisa começar com https/);
  });

  test('exige link, não deixa publicar vaga sem onde se candidatar', async () => {
    const resposta = await responder(envioDeModal({ ...VAGA_BASE, link: '' }));
    assert.match(resposta.data.content, /O link é obrigatório/);
  });

  test('exige os campos de texto', async () => {
    const resposta = await responder(envioDeModal({ ...VAGA_BASE, empresa: '' }));
    assert.match(resposta.data.content, /Preencha título, empresa, localização e descrição/);
  });

  test('traz a autoria de quem abriu o modal', async () => {
    const embed = (await responder(envioDeModal(VAGA_BASE))).data.embeds[0];
    assert.equal(embed.author.name, 'Autora: Sam');
  });
});

describe('as três seleções', () => {
  test('cada escolha atualiza o card e o texto de apoio', async () => {
    const primeira = await preencher({ area: 'dados' });
    assert.equal(campo(primeira.embed, 'Área'), 'Dados');
    assert.equal(campo(primeira.embed, 'Senioridade'), 'Ainda não escolhido');
    assert.equal(primeira.resposta.data.content, 'Confira como vai ficar e escolha ainda: senioridade, modalidade.');
    assert.equal(primeira.resposta.type, 7);
  });

  test('Publicar só habilita com as três escolhas', async () => {
    const duas = await preencher({ area: 'dados', senioridade: 'junior' });
    assert.equal(duas.resposta.data.components[3].components[0].disabled, true);

    const tres = await preencher(ESCOLHAS);
    assert.equal(tres.resposta.data.components[3].components[0].disabled, false);
    assert.equal(tres.resposta.data.content, 'Confira como vai ficar e publique quando estiver boa.');
  });

  test('a escolha fica marcada no menu e o resto do card sobrevive', async () => {
    const { embed, resposta } = await preencher(ESCOLHAS);

    assert.equal(resposta.data.components[0].components[0].options.find((o) => o.value === 'desenvolvimento').default, true);
    assert.equal(embed.title, '💼 Pessoa Desenvolvedora Back-end');
    assert.equal(campo(embed, 'Empresa'), 'Acme');
    assert.equal(campo(embed, 'Link'), VAGA_BASE.link);
    assert.equal(embed.author.name, 'Autora: Sam');
  });
});

describe('publicar', () => {
  test('cria o post no fórum com o título do cargo como nome', async () => {
    const api = espionarApi();
    const { embed } = await preencher();
    const resposta = await responder(componente('vaga:publicar', { embed }));

    assert.equal(resposta.type, 6, 'resposta adiada, para caber nos 3 segundos');
    await esperarPendentes();

    assert.equal(api.post().metodo, 'POST');
    assert.equal(api.post().corpo.name, 'Pessoa Desenvolvedora Back-end');
  });

  test('aplica as três tags pelos IDs do config', async () => {
    const api = espionarApi();
    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    const esperadas = [
      TAGS_AREA.find((t) => t.valor === 'desenvolvimento').id,
      TAGS_SENIORIDADE.find((t) => t.valor === 'pleno').id,
      TAGS_MODALIDADE.find((t) => t.valor === 'remoto').id,
    ];
    assert.deepEqual(api.post().corpo.applied_tags, esperadas);
    assert.equal(api.post().corpo.applied_tags.every((id) => /^\d{17,20}$/.test(id)), true, 'tag por ID, não por nome');
    assert.ok(api.post().corpo.applied_tags.length <= 5, 'o fórum aceita no máximo 5 tags por post');
  });

  test('o card segue o formato da seção 9.5', async () => {
    const api = espionarApi();
    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    const publicado = api.post().corpo.message.embeds[0];
    assert.equal(publicado.title, '💼 Pessoa Desenvolvedora Back-end');
    assert.equal(publicado.description, [
      'Acme · São Paulo, SP (Remoto)',
      '',
      'Time de plataforma, stack Node e AWS.',
      '',
      '🔗 Candidatar-se: **vagas.acme.com**',
      'https://vagas.acme.com/back-end?ref=techgirls',
    ].join('\n'));
    assert.equal(publicado.color, CORES.VAGA);
  });

  test('o domínio fica em destaque e o link sai igual ao digitado', async () => {
    const api = espionarApi();
    const link = 'https://boards.greenhouse.io/acme/jobs/42?utm_source=x';
    const { embed } = await preencher(ESCOLHAS, { ...VAGA_BASE, link });
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    const descricao = api.post().corpo.message.embeds[0].description;
    assert.match(descricao, /🔗 Candidatar-se: \*\*boards\.greenhouse\.io\*\*/);
    assert.equal(descricao.endsWith(`\n${link}`), true, 'o link completo fica clicável e sem normalização');
  });

  test('o post não menciona ninguém', async () => {
    const api = espionarApi();
    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    assert.deepEqual(api.post().corpo.message.allowed_mentions, { parse: [] });
    assert.equal(api.post().corpo.message.content, undefined);
  });

  test('a autora é quem clicou em Publicar, não quem abriu o modal', async () => {
    const api = espionarApi();
    const outra = {
      nick: null,
      avatar: null,
      user: { id: 'ADMIN2', username: 'bia', global_name: 'Beatriz', avatar: 'avatarbia' },
    };

    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed, membro: outra }));
    await esperarPendentes();

    const autor = api.post().corpo.message.embeds[0].author;
    assert.equal(autor.name, 'Autora: Beatriz');
    assert.equal(autor.icon_url, 'https://cdn.discordapp.com/avatars/ADMIN2/avatarbia.png?size=128');
  });

  test('registra no log e confirma com o link do post', async () => {
    const api = espionarApi();
    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    const esperado = /^Vaga publicada por <@ADMIN1> · https:\/\/discord\.com\/channels\/G1\/POST1 · <t:\d+:f>$/;
    assert.match(api.log().corpo.content, esperado);
    assert.deepEqual(api.log().corpo.allowed_mentions, { parse: [] });
    assert.match(api.fechamento().corpo.content, /Vaga publicada: https:\/\/discord\.com\/channels\/G1\/POST1/);
  });

  test('falha no log não impede a publicação nem a confirmação', async () => {
    const api = espionarApi({ falharEm: '/channels/CL/messages' });
    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    assert.ok(api.post(), 'o post saiu');
    assert.match(api.fechamento().corpo.content, /Vaga publicada: /);
  });

  test('falha ao publicar avisa a admin sem expor o erro', async () => {
    const api = espionarApi({ falharEm: '/channels/CV/threads' });
    const { embed } = await preencher();
    await responder(componente('vaga:publicar', { embed }));
    await esperarPendentes();

    assert.match(api.fechamento().corpo.content, /Não consegui publicar a vaga/);
    assert.doesNotMatch(api.fechamento().corpo.content, /403|Missing Access/);
  });

  test('sem as três escolhas, não publica e diz o que falta', async () => {
    const api = espionarApi();
    const { embed } = await preencher({ area: 'qa' });
    const resposta = await responder(componente('vaga:publicar', { embed }));

    assert.match(resposta.data.content, /Escolha ainda senioridade, modalidade/);
    assert.equal(resposta.data.flags, 64);
    assert.equal(api.chamadas.length, 0);
  });

  test('sem pré-visualização, responde sem quebrar', async () => {
    const resposta = await responder(componente('vaga:publicar', {}));
    assert.match(resposta.data.content, /use \/vaga nova de novo/);
    assert.equal(resposta.data.flags, 64);
  });
});

describe('cancelar', () => {
  test('troca a mensagem e não chama a API', async () => {
    const api = espionarApi();
    const { embed } = await preencher();
    const resposta = await responder(componente('vaga:cancelar', { embed }));

    assert.equal(resposta.type, 7);
    assert.equal(resposta.data.content, 'Publicação cancelada.');
    assert.deepEqual(resposta.data.embeds, []);
    assert.deepEqual(resposta.data.components, []);
    assert.equal(api.chamadas.length, 0);
  });
});

function campo(embed, nome) {
  return embed.fields?.find((item) => item.name === nome)?.value ?? null;
}
