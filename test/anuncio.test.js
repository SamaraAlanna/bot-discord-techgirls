// Testes do fluxo de anúncio, com o runner nativo do Node: `npm test`.
// Nada de rede: o fetch global é trocado por um espião que guarda as chamadas.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { CORES, MENCOES } from '../src/config.js';
import { lerDataBrasilia } from '../src/datas.js';
import { rotear } from '../src/index.js';

const ID_SUPORTE = MENCOES.find((item) => item.valor === 'suporte').id;

const env = {
  GUILD_ID: 'G1',
  CANAL_ANUNCIOS_ID: 'CA',
  CANAL_LOG_ID: 'CL',
  DISCORD_TOKEN: 'token-de-teste',
};

// Guarda as promessas do waitUntil para o teste esperar por elas.
const pendentes = [];
const ctx = { waitUntil: (promessa) => pendentes.push(promessa) };
const esperarPendentes = () => Promise.all(pendentes.splice(0));

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  pendentes.length = 0;
});

// Espião de API: devolve sempre 200, ou o status combinado para um caminho.
function espionarApi({ falharEm } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), metodo: opcoes.method, corpo: JSON.parse(opcoes.body) });
    if (falharEm && String(url).includes(falharEm)) {
      return new Response('{"message":"Missing Access"}', { status: 403 });
    }
    return new Response(JSON.stringify({ id: 'MSG1' }), { status: 200 });
  };
  return {
    chamadas,
    publicacao: () => chamadas.find((c) => c.url.includes('/channels/CA/messages')),
    log: () => chamadas.find((c) => c.url.includes('/channels/CL/messages')),
    fechamento: () => chamadas.find((c) => c.metodo === 'PATCH'),
  };
}

// Admin padrão dos testes: tem apelido no servidor e nenhum avatar.
const MEMBRO = {
  nick: 'Sam',
  avatar: null,
  user: { id: 'ADMIN1', username: 'samara', global_name: 'Samara Alanna', avatar: null },
};

// Monta o payload de um envio de modal, no formato aninhado em Label que a doc mostra.
const envioDeModal = (campos, membro = MEMBRO) => ({
  type: 5,
  application_id: 'APP',
  token: 'token-da-interacao',
  guild_id: 'G1',
  member: membro,
  data: {
    custom_id: 'anuncio:modal',
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

const ANUNCIO_BASE = {
  titulo: 'Mentoria de carreira',
  texto: 'Inscrições abertas.',
  link: 'https://techgirls.dev/mentoria',
  quando: '15/10/2026 19:00',
};

// Atalho: envia o modal, escolhe uma menção e devolve o card pronto para publicar.
async function cardPronto(escolha, campos = ANUNCIO_BASE, membro = MEMBRO) {
  const previa = (await responder(envioDeModal(campos, membro))).data.embeds[0];
  const atualizada = await responder(componente('anuncio:mencao', { embed: previa, values: [escolha], membro }));
  return atualizada.data.embeds[0];
}

describe('envio do modal', () => {
  test('tem quatro campos, sem aviso de conteúdo', async () => {
    const { comandoAnuncio } = await import('../src/comandos/anuncio.js');
    const modal = JSON.parse(await comandoAnuncio().text()).data;

    assert.equal(modal.components.length, 4);
    assert.deepEqual(
      modal.components.map((label) => label.component.custom_id),
      ['titulo', 'texto', 'link', 'quando'],
    );
    assert.equal(modal.components.every((label) => label.type === 18), true, 'todo campo vem em Label');
  });

  test('gera pré-visualização efêmera com Publicar desabilitado', async () => {
    const resposta = await responder(envioDeModal(ANUNCIO_BASE));

    assert.equal(resposta.type, 4);
    assert.equal(resposta.data.flags, 64);

    const embed = resposta.data.embeds[0];
    assert.equal(embed.color, CORES.ANUNCIO);
    assert.equal(embed.color, 0x7341c0, 'anúncio é roxo-500');
    assert.equal(embed.title, 'Mentoria de carreira');
    assert.equal(embed.description, 'Inscrições abertas.');
    assert.equal(campo(embed, 'Mencionar'), 'Ainda não escolhido');
    assert.equal(resposta.data.components[1].components[0].disabled, true);
  });

  test('mostra o timestamp nativo e o horário de Brasília', async () => {
    const embed = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    assert.match(campo(embed, 'Quando'), /^<t:\d+:F>\n15\/10\/2026 às 19:00, horário de Brasília$/);
  });

  test('oferece as quatro opções de menção da seção 9.3', async () => {
    const resposta = await responder(envioDeModal(ANUNCIO_BASE));
    const opcoes = resposta.data.components[0].components[0].options;

    assert.deepEqual(opcoes.map((o) => o.value), ['ninguem', 'everyone', 'here', 'suporte']);
    assert.equal(opcoes.every((o) => o.description), true, 'toda opção explica o efeito');
  });

  test('recusa link sem https e link quebrado', async () => {
    const semHttps = await responder(envioDeModal({ ...ANUNCIO_BASE, link: 'http://inseguro.com' }));
    assert.equal(semHttps.data.flags, 64);
    assert.match(semHttps.data.content, /precisa começar com https/);

    const quebrado = await responder(envioDeModal({ ...ANUNCIO_BASE, link: 'https://' }));
    assert.match(quebrado.data.content, /não é um endereço válido/);
  });

  test('recusa data inexistente e formato errado', async () => {
    const inexistente = await responder(envioDeModal({ ...ANUNCIO_BASE, quando: '31/02/2026 10:00' }));
    assert.match(inexistente.data.content, /não existe no calendário/);

    const formato = await responder(envioDeModal({ ...ANUNCIO_BASE, quando: '15-10-2026 19:00' }));
    assert.match(formato.data.content, /DD\/MM\/AAAA HH:MM/);
  });

  test('exige título e texto', async () => {
    const resposta = await responder(envioDeModal({ titulo: '', texto: '' }));
    assert.match(resposta.data.content, /obrigatórios/);
  });
});

describe('autoria do card', () => {
  test('usa o apelido do servidor', async () => {
    const embed = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    assert.equal(embed.author.name, 'Autora: Sam');
  });

  test('sem apelido, cai no nome de exibição', async () => {
    const membro = { ...MEMBRO, nick: null };
    const embed = (await responder(envioDeModal(ANUNCIO_BASE, membro))).data.embeds[0];
    assert.equal(embed.author.name, 'Autora: Samara Alanna');
  });

  test('sem apelido e sem nome de exibição, cai no nome de usuária', async () => {
    const membro = { ...MEMBRO, nick: null, user: { ...MEMBRO.user, global_name: null } };
    const embed = (await responder(envioDeModal(ANUNCIO_BASE, membro))).data.embeds[0];
    assert.equal(embed.author.name, 'Autora: samara');
  });

  test('avatar do servidor ganha do avatar da conta, e animado vira gif', async () => {
    const membro = { ...MEMBRO, avatar: 'a_1269e74a', user: { ...MEMBRO.user, avatar: 'deconta' } };
    const embed = (await responder(envioDeModal(ANUNCIO_BASE, membro))).data.embeds[0];
    assert.equal(
      embed.author.icon_url,
      'https://cdn.discordapp.com/guilds/G1/users/ADMIN1/avatars/a_1269e74a.gif?size=128',
    );
  });

  test('sem avatar de servidor, usa o avatar da conta', async () => {
    const membro = { ...MEMBRO, user: { ...MEMBRO.user, avatar: 'deconta' } };
    const embed = (await responder(envioDeModal(ANUNCIO_BASE, membro))).data.embeds[0];
    assert.equal(embed.author.icon_url, 'https://cdn.discordapp.com/avatars/ADMIN1/deconta.png?size=128');
  });

  test('sem avatar nenhum, o card fica sem ícone', async () => {
    const embed = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    assert.equal('icon_url' in embed.author, false);
  });

  test('a autora do anúncio é quem clicou em Publicar, não quem abriu o modal', async () => {
    const api = espionarApi();
    const outra = {
      nick: 'Bia',
      avatar: null,
      user: { id: 'ADMIN2', username: 'bia', global_name: 'Beatriz', avatar: 'outroavatar' },
    };

    // O card foi montado pela Sam, mas quem clica em Publicar é a Bia.
    const card = await cardPronto('ninguem');
    await responder(componente('anuncio:publicar', { embed: card, membro: outra }));
    await esperarPendentes();

    const autor = api.publicacao().corpo.embeds[0].author;
    assert.equal(autor.name, 'Autora: Bia');
    assert.equal(autor.icon_url, 'https://cdn.discordapp.com/avatars/ADMIN2/outroavatar.png?size=128');
  });
});

describe('horário de Brasília', () => {
  test('19:00 em Brasília vira 22:00 UTC', () => {
    assert.equal(lerDataBrasilia('15/10/2026 19:00').unix, Date.UTC(2026, 9, 15, 22, 0) / 1000);
  });

  test('recusa hora impossível', () => {
    assert.match(lerDataBrasilia('15/10/2026 25:00').erro, /entre 00:00 e 23:59/);
  });
});

describe('escolha da menção', () => {
  test('cargo Suporte habilita Publicar e marca a opção escolhida', async () => {
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const resposta = await responder(componente('anuncio:mencao', { embed: previa, values: ['suporte'] }));

    assert.equal(resposta.type, 7);
    assert.equal(campo(resposta.data.embeds[0], 'Mencionar'), `<@&${ID_SUPORTE}>`);
    assert.equal(resposta.data.components[1].components[0].disabled, false);
    assert.equal(resposta.data.components[0].components[0].options.find((o) => o.value === 'suporte').default, true);
  });

  test('a autoria sobrevive à atualização do card', async () => {
    const card = await cardPronto('suporte');
    assert.equal(card.author.name, 'Autora: Sam');
  });

  test('@everyone e @here avisam que notificam o servidor', async () => {
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];

    const todos = await responder(componente('anuncio:mencao', { embed: previa, values: ['everyone'] }));
    assert.equal(todos.data.content, 'Atenção: isso vai notificar todas as pessoas do servidor.');
    assert.equal(campo(todos.data.embeds[0], 'Mencionar'), '@everyone');

    const online = await responder(componente('anuncio:mencao', { embed: previa, values: ['here'] }));
    assert.equal(online.data.content, 'Atenção: isso vai notificar todas as pessoas que estão online agora.');
    assert.equal(campo(online.data.embeds[0], 'Mencionar'), '@here');
  });

  test('Ninguém não mostra aviso e ainda habilita Publicar', async () => {
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const resposta = await responder(componente('anuncio:mencao', { embed: previa, values: ['ninguem'] }));

    assert.doesNotMatch(resposta.data.content, /Atenção/);
    assert.equal(campo(resposta.data.embeds[0], 'Mencionar'), 'Ninguém');
    assert.equal(resposta.data.components[1].components[0].disabled, false);
  });
});

describe('publicar', () => {
  test('cargo Suporte: menciona só o cargo', async () => {
    const api = espionarApi();
    const resposta = await responder(componente('anuncio:publicar', { embed: await cardPronto('suporte') }));

    assert.equal(resposta.type, 6, 'resposta adiada, para caber nos 3 segundos');
    await esperarPendentes();

    assert.equal(api.publicacao().corpo.content, `<@&${ID_SUPORTE}>`);
    assert.deepEqual(api.publicacao().corpo.allowed_mentions, { parse: [], roles: [ID_SUPORTE] });
  });

  test('@everyone: content tem só a menção e o parse libera só ela', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', { embed: await cardPronto('everyone') }));
    await esperarPendentes();

    assert.equal(api.publicacao().corpo.content, '@everyone');
    assert.deepEqual(api.publicacao().corpo.allowed_mentions, { parse: ['everyone'] });
  });

  test('@here: content tem só @here, nunca @everyone junto', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', { embed: await cardPronto('here') }));
    await esperarPendentes();

    assert.equal(api.publicacao().corpo.content, '@here');
    assert.doesNotMatch(api.publicacao().corpo.content, /@everyone/);
    assert.deepEqual(api.publicacao().corpo.allowed_mentions, { parse: ['everyone'] });
  });

  test('Ninguém: sem content e sem menção liberada', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', { embed: await cardPronto('ninguem') }));
    await esperarPendentes();

    assert.equal(api.publicacao().corpo.content, undefined);
    assert.deepEqual(api.publicacao().corpo.allowed_mentions, { parse: [] });
  });

  test('o card publicado não carrega o campo de controle', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', { embed: await cardPronto('ninguem') }));
    await esperarPendentes();

    const embed = api.publicacao().corpo.embeds[0];
    assert.equal(embed.fields.some((c) => c.name === 'Mencionar'), false);
    assert.equal(embed.color, CORES.ANUNCIO);
  });

  test('o link sai exatamente como foi digitado', async () => {
    const api = espionarApi();
    const link = 'https://techgirls.dev/vaga?origem=discord&id=7';
    await responder(componente('anuncio:publicar', { embed: await cardPronto('ninguem', { ...ANUNCIO_BASE, link }) }));
    await esperarPendentes();

    assert.equal(campo(api.publicacao().corpo.embeds[0], 'Link'), link);
  });

  test('link sem caminho não ganha barra no fim', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', {
      embed: await cardPronto('ninguem', { ...ANUNCIO_BASE, link: 'https://techgirls.dev' }),
    }));
    await esperarPendentes();

    assert.equal(campo(api.publicacao().corpo.embeds[0], 'Link'), 'https://techgirls.dev');
  });

  test('registra no log e confirma com o link do anúncio', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', { embed: await cardPronto('suporte') }));
    await esperarPendentes();

    const esperado = /^Anúncio publicado por <@ADMIN1> · https:\/\/discord\.com\/channels\/G1\/CA\/MSG1 · <t:\d+:f>$/;
    assert.match(api.log().corpo.content, esperado);
    assert.deepEqual(api.log().corpo.allowed_mentions, { parse: [] });
    assert.match(api.fechamento().corpo.content, /Anúncio publicado: https:\/\/discord\.com\/channels\/G1\/CA\/MSG1/);
  });

  test('falha no log não impede a publicação nem a confirmação', async () => {
    const api = espionarApi({ falharEm: '/channels/CL/messages' });
    await responder(componente('anuncio:publicar', { embed: await cardPronto('ninguem') }));
    await esperarPendentes();

    assert.ok(api.publicacao(), 'o anúncio saiu');
    assert.match(api.fechamento().corpo.content, /Anúncio publicado: /);
  });

  test('falha ao publicar avisa a admin sem expor o erro', async () => {
    const api = espionarApi({ falharEm: '/channels/CA/messages' });
    await responder(componente('anuncio:publicar', { embed: await cardPronto('ninguem') }));
    await esperarPendentes();

    assert.match(api.fechamento().corpo.content, /Não consegui publicar/);
    assert.doesNotMatch(api.fechamento().corpo.content, /403|Missing Access/);
  });

  test('sem escolha no menu, não publica', async () => {
    const api = espionarApi();
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const resposta = await responder(componente('anuncio:publicar', { embed: previa }));

    assert.match(resposta.data.content, /Escolha no menu/);
    assert.equal(api.chamadas.length, 0);
  });

  test('sem pré-visualização, responde sem quebrar', async () => {
    const resposta = await responder(componente('anuncio:publicar', {}));
    assert.match(resposta.data.content, /use \/anuncio de novo/);
    assert.equal(resposta.data.flags, 64);
  });
});

describe('cancelar', () => {
  test('troca a mensagem e não chama a API', async () => {
    const api = espionarApi();
    const resposta = await responder(componente('anuncio:cancelar', { embed: await cardPronto('everyone') }));

    assert.equal(resposta.type, 7);
    assert.equal(resposta.data.content, 'Publicação cancelada.');
    assert.deepEqual(resposta.data.embeds, []);
    assert.deepEqual(resposta.data.components, []);
    assert.equal(api.chamadas.length, 0);
  });
});

describe('roteamento', () => {
  test('PING responde PONG', async () => {
    assert.deepEqual(await responder({ type: 1 }), { type: 1 });
  });

  test('tipo desconhecido é recusado', async () => {
    const resposta = await rotear({ type: 99 }, env, ctx);
    assert.equal(resposta.status, 400);
  });

  test('componente de fluxo desconhecido não quebra', async () => {
    const resposta = await responder(componente('vaga:publicar', {}));
    assert.match(resposta.data.content, /versão antiga/);
  });
});

function campo(embed, nome) {
  return embed.fields?.find((item) => item.name === nome)?.value ?? null;
}
