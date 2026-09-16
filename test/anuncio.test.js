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
// Aceita corpo JSON e corpo multipart: com imagens, o payload vai em payload_json.
function lerCorpo(corpo) {
  if (typeof corpo === 'string') return JSON.parse(corpo);
  if (corpo instanceof FormData) return JSON.parse(corpo.get('payload_json'));
  return null;
}

function arquivosDoCorpo(corpo) {
  if (!(corpo instanceof FormData)) return [];
  return [...corpo.entries()]
    .filter(([chave]) => chave.startsWith('files['))
    .map(([chave, valor]) => ({ chave, nome: valor.name, tipo: valor.type, tamanho: valor.size }));
}

function espionarApi({ falharEm, statusDoCdn = 200 } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    const endereco = String(url);
    chamadas.push({
      url: endereco,
      metodo: opcoes.method ?? 'GET',
      corpo: lerCorpo(opcoes.body),
      arquivos: arquivosDoCorpo(opcoes.body),
    });

    if (endereco.includes('cdn.discordapp.com')) {
      if (statusDoCdn !== 200) return new Response('erro', { status: statusDoCdn });
      return new Response(new Uint8Array(2048), { status: 200 });
    }
    if (falharEm && endereco.includes(falharEm)) {
      return new Response('{"message":"Missing Access"}', { status: 403 });
    }
    return new Response(JSON.stringify({ id: 'MSG1' }), { status: 200 });
  };
  return {
    chamadas,
    publicacao: () => chamadas.find((c) => c.url.includes('/channels/CA/messages')),
    log: () => chamadas.find((c) => c.url.includes('/channels/CL/messages')),
    fechamento: () => chamadas.find((c) => c.metodo === 'PATCH'),
    // POST no webhook é mensagem nova; o PATCH é o fechamento da resposta adiada.
    acompanhamento: () => chamadas.find((c) => c.url.includes('/webhooks/') && c.metodo === 'POST'),
    downloads: () => chamadas.filter((c) => c.url.includes('cdn.discordapp.com')),
    reacao: () => chamadas.find((c) => c.url.includes('/reactions/')),
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

const componente = (custom_id, { embed, values, membro = MEMBRO, anexos = [] } = {}) => ({
  type: 3,
  application_id: 'APP',
  token: 'token-da-interacao',
  guild_id: 'G1',
  member: membro,
  message: { embeds: embed ? [embed] : [], attachments: anexos },
  data: { custom_id, ...(values ? { values } : {}) },
});

// Anexo como o Discord entrega: mídia efêmera, com URL assinada.
const anexo = (chave, filename, content_type, size = 2048) => ({
  id: chave,
  filename,
  content_type,
  size,
  url: `https://cdn.discordapp.com/ephemeral-attachments/1/2/${filename}?ex=aa&is=bb&hm=cc`,
  ephemeral: true,
});

const responder = async (interacao) => JSON.parse(await (await rotear(interacao, env, ctx)).text());

const ANUNCIO_BASE = {
  titulo: 'Mentoria de carreira',
  texto: 'Inscrições abertas.',
  link: 'https://techgirls.dev/mentoria',
  quando: '15/10/2026 19:00',
};

// Envio de modal com o campo de upload preenchido.
const envioComImagens = (anexos, campos = ANUNCIO_BASE) => {
  const interacao = envioDeModal(campos);
  interacao.data.components.push({
    type: 18,
    id: 9,
    component: { type: 19, id: 10, custom_id: 'imagens', values: anexos.map((item) => item.id) },
  });
  interacao.data.resolved = { attachments: Object.fromEntries(anexos.map((item) => [item.id, item])) };
  return interacao;
};

// Atalho: envia o modal, escolhe uma menção e devolve o card pronto para publicar.
async function cardPronto(escolha, campos = ANUNCIO_BASE, membro = MEMBRO) {
  const previa = (await responder(envioDeModal(campos, membro))).data.embeds[0];
  const atualizada = await responder(componente('anuncio:mencao', { embed: previa, values: [escolha], membro }));
  return atualizada.data.embeds[0];
}

describe('envio do modal', () => {
  test('tem quatro campos de texto e o upload de imagens', async () => {
    const { comandoAnuncio } = await import('../src/comandos/anuncio.js');
    const modal = JSON.parse(await comandoAnuncio().text()).data;

    assert.equal(modal.components.length, 5, 'o modal aceita no máximo 5 componentes de topo');
    assert.deepEqual(
      modal.components.map((label) => label.component.custom_id),
      ['titulo', 'texto', 'link', 'quando', 'imagens'],
    );
    assert.equal(modal.components.every((label) => label.type === 18), true, 'todo campo vem em Label');

    const upload = modal.components[4].component;
    assert.equal(upload.type, 19);
    assert.equal(upload.required, false);
    assert.equal(upload.max_values, 4);
    assert.equal(modal.components[4].description, 'Opcional. Até 4 imagens de até 5 MB.');
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
    assert.equal(resposta.data.components[2].components[0].disabled, true);
  });

  test('o campo Quando mostra só o timestamp nativo', async () => {
    const embed = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const unix = Date.UTC(2026, 9, 15, 22, 0) / 1000;

    assert.equal(campo(embed, 'Quando'), `<t:${unix}:F>`);
    assert.doesNotMatch(campo(embed, 'Quando'), /Brasília/);
  });

  test('a descrição do campo avisa que a hora é de Brasília', async () => {
    const { comandoAnuncio } = await import('../src/comandos/anuncio.js');
    const modal = JSON.parse(await comandoAnuncio().text()).data;
    const campoQuando = modal.components.find((label) => label.component.custom_id === 'quando');

    assert.match(campoQuando.description, /horário de Brasília/);
    assert.match(campoQuando.description, /DD\/MM\/AAAA HH:MM/);
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
    assert.equal(resposta.data.components[2].components[0].disabled, false);
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
    assert.equal(resposta.data.components[2].components[0].disabled, false);
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

describe('imagens no anúncio', () => {
  test('a pré-visualização não lista arquivos, só anexa as imagens', async () => {
    const api = espionarApi();
    await responder(envioComImagens([anexo('0', 'cartaz.png', 'image/png')]));
    await esperarPendentes();

    const conteudo = api.acompanhamento().corpo.content;
    assert.equal(conteudo, 'Confira como vai ficar e escolha quem deve ser avisada.');
    assert.equal(api.acompanhamento().arquivos.length, 1, 'a imagem vai anexada');
  });

  test('modal com imagens adia e manda a pré-visualização em multipart', async () => {
    const api = espionarApi();
    const anexos = [anexo('0', 'cartaz.png', 'image/png'), anexo('1', 'foto.jpg', 'image/jpeg')];

    const resposta = await responder(envioComImagens(anexos));
    assert.equal(resposta.type, 5, 'resposta adiada: baixar arquivo não cabe em 3 segundos');
    assert.equal(resposta.data.flags, 64);

    await esperarPendentes();

    assert.equal(api.downloads().length, 2);
    const acompanhamento = api.acompanhamento();
    assert.deepEqual(acompanhamento.arquivos.map((a) => a.chave), ['files[0]', 'files[1]']);
    assert.deepEqual(acompanhamento.arquivos.map((a) => a.nome), ['cartaz.png', 'foto.jpg']);
    assert.deepEqual(acompanhamento.corpo.attachments, [
      { id: 0, filename: 'cartaz.png' },
      { id: 1, filename: 'foto.jpg' },
    ]);
    assert.equal(acompanhamento.corpo.flags, 64, 'a pré-visualização continua efêmera');
    assert.equal(acompanhamento.corpo.embeds[0].title, 'Mentoria de carreira');
    assert.equal(acompanhamento.corpo.components.length, 3);
  });

  test('arquivo que não é imagem é recusado antes de baixar', async () => {
    const api = espionarApi();
    const resposta = await responder(envioComImagens([anexo('0', 'contrato.pdf', 'application/pdf')]));

    assert.equal(resposta.type, 4);
    assert.equal(resposta.data.flags, 64);
    assert.equal(resposta.data.content, 'Só dá para anexar imagens (PNG, JPG, GIF ou WEBP).');
    assert.doesNotMatch(resposta.data.content, /contrato/i, 'sem nome de arquivo na frase');
    assert.equal(api.chamadas.length, 0, 'nada foi baixado');
  });

  test('imagem acima do limite é recusada sem citar arquivo nem tamanho', async () => {
    const api = espionarApi();
    const grande = anexo('0', 'enorme.png', 'image/png', 9 * 1024 * 1024);
    const resposta = await responder(envioComImagens([grande]));

    assert.equal(resposta.data.content, 'Uma das imagens passa de 5 MB. Diminua o tamanho e tente de novo.');
    assert.doesNotMatch(resposta.data.content, /enorme|9/, 'sem nome de arquivo nem o tamanho do que veio');
    assert.equal(api.chamadas.length, 0);
  });

  test('mais de quatro imagens é recusado', async () => {
    const cinco = [0, 1, 2, 3, 4].map((n) => anexo(String(n), `f${n}.png`, 'image/png'));
    const resposta = await responder(envioComImagens(cinco));

    assert.equal(resposta.data.content, 'Dá para anexar no máximo 4 imagens. Tire algumas e tente de novo.');
  });

  test('falha no download avisa a admin sem deixar pré-visualização pela metade', async () => {
    const api = espionarApi({ statusDoCdn: 403 });
    await responder(envioComImagens([anexo('0', 'cartaz.png', 'image/png')]));
    await esperarPendentes();

    assert.equal(api.acompanhamento(), undefined, 'nenhuma pré-visualização foi enviada');
    assert.equal(api.fechamento().corpo.content, 'Não consegui carregar as imagens. Use /anuncio de novo.');
  });

  test('escolher no menu não perde os anexos já subidos', async () => {
    espionarApi();
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const anexos = [anexo('111', 'cartaz.png', 'image/png')];

    const resposta = await responder(componente('anuncio:mencao', { embed: previa, values: ['suporte'], anexos }));

    // Na v10, editar sem mandar attachments apaga os anexos existentes.
    assert.deepEqual(resposta.data.attachments, [{ id: '111', filename: 'cartaz.png' }]);
  });

  test('cancelar limpa os anexos junto com o resto', async () => {
    espionarApi();
    const resposta = await responder(componente('anuncio:cancelar', { anexos: [anexo('111', 'c.png', 'image/png')] }));
    assert.deepEqual(resposta.data.attachments, []);
  });

  test('publicar baixa dos anexos do clique e envia junto com o anúncio', async () => {
    const api = espionarApi();
    const anexos = [anexo('111', 'cartaz.png', 'image/png')];
    const card = await cardPronto('ninguem');

    await responder(componente('anuncio:publicar', { embed: card, anexos }));
    await esperarPendentes();

    assert.equal(api.downloads().length, 1);
    const publicacao = api.publicacao();
    assert.deepEqual(publicacao.arquivos.map((a) => a.nome), ['cartaz.png']);
    assert.deepEqual(publicacao.corpo.attachments, [{ id: 0, filename: 'cartaz.png' }]);
    assert.deepEqual(publicacao.corpo.allowed_mentions, { parse: [] });
    assert.match(api.fechamento().corpo.content, /Anúncio publicado: /);
  });

  test('se o download falhar no Publicar, nada é publicado', async () => {
    const api = espionarApi({ statusDoCdn: 403 });
    const card = await cardPronto('ninguem');

    await responder(componente('anuncio:publicar', { embed: card, anexos: [anexo('111', 'c.png', 'image/png')] }));
    await esperarPendentes();

    assert.equal(api.publicacao(), undefined, 'o canal de avisos não foi tocado');
    assert.equal(api.log(), undefined, 'nem o log');
    assert.match(api.fechamento().corpo.content, /Não consegui publicar o anúncio/);
  });
});

describe('reação', () => {
  test('o menu traz as seis opções, com Nenhuma marcada', async () => {
    const resposta = await responder(envioDeModal(ANUNCIO_BASE));
    const menu = resposta.data.components[1].components[0];

    assert.equal(menu.custom_id, 'anuncio:reacao');
    assert.deepEqual(menu.options.map((o) => o.label), ['Nenhuma', '💜', '🎉', '📚', '👀', '✅']);
    assert.equal(menu.options.find((o) => o.value === 'nenhuma').default, true);
  });

  test('escolher reação não habilita Publicar sozinha', async () => {
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const resposta = await responder(componente('anuncio:reacao', { embed: previa, values: ['festa'] }));

    assert.equal(campo(resposta.data.embeds[0], 'Reação'), '🎉');
    assert.equal(resposta.data.components[2].components[0].disabled, true, 'a menção é que destrava');
  });

  test('a reação escolhida sobrevive à escolha da menção', async () => {
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const comReacao = (await responder(componente('anuncio:reacao', { embed: previa, values: ['roxo'] }))).data.embeds[0];
    const resposta = await responder(componente('anuncio:mencao', { embed: comReacao, values: ['suporte'] }));

    assert.equal(campo(resposta.data.embeds[0], 'Reação'), '💜');
    assert.equal(resposta.data.components[1].components[0].options.find((o) => o.value === 'roxo').default, true);
    assert.equal(resposta.data.components[2].components[0].disabled, false);
  });

  test('publicar reage com o emoji codificado na URL', async () => {
    const api = espionarApi();
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const comReacao = (await responder(componente('anuncio:reacao', { embed: previa, values: ['roxo'] }))).data.embeds[0];
    const card = (await responder(componente('anuncio:mencao', { embed: comReacao, values: ['ninguem'] }))).data.embeds[0];

    await responder(componente('anuncio:publicar', { embed: card }));
    await esperarPendentes();

    const reacao = api.reacao();
    assert.equal(reacao.metodo, 'PUT');
    assert.equal(reacao.url, 'https://discord.com/api/v10/channels/CA/messages/MSG1/reactions/%F0%9F%92%9C/@me');
  });

  test('com Nenhuma, o bot não reage', async () => {
    const api = espionarApi();
    await responder(componente('anuncio:publicar', { embed: await cardPronto('ninguem') }));
    await esperarPendentes();

    assert.equal(api.reacao(), undefined);
  });

  test('falha ao reagir não impede publicação, log nem confirmação', async () => {
    const api = espionarApi({ falharEm: '/reactions/' });
    const previa = (await responder(envioDeModal(ANUNCIO_BASE))).data.embeds[0];
    const comReacao = (await responder(componente('anuncio:reacao', { embed: previa, values: ['confirmado'] }))).data.embeds[0];
    const card = (await responder(componente('anuncio:mencao', { embed: comReacao, values: ['ninguem'] }))).data.embeds[0];

    await responder(componente('anuncio:publicar', { embed: card }));
    await esperarPendentes();

    assert.ok(api.publicacao(), 'o anúncio saiu');
    assert.ok(api.log(), 'o log foi escrito');
    assert.match(api.fechamento().corpo.content, /Anúncio publicado: /);
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
    // Prefixo de um fluxo que não existe: veio de uma versão antiga do bot.
    const resposta = await responder(componente('sugestao:publicar', {}));
    assert.match(resposta.data.content, /versão antiga/);
  });
});

function campo(embed, nome) {
  return embed.fields?.find((item) => item.name === nome)?.value ?? null;
}
