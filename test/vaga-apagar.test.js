// Testes do /vaga apagar, com o runner nativo do Node: `npm test`.
// Nada de rede: o fetch global é trocado por um espião que guarda as chamadas.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, test } from 'node:test';

import { TAG_ENCERRADA_ID } from '../src/config.js';
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

const TITULO = 'Pessoa Desenvolvedora Back-end';
const TAGS_ABERTA = ['1549751047856332860', '1549750896567779369'];

/**
 * Espião da API com um post de vaga. `falharEm` recebe a chamada e diz se ela falha.
 * `pai` é o canal pai que a API devolve para o post.
 */
function espionarApi({ tags = TAGS_ABERTA, pai = 'CV', falharEm } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    const endereco = String(url);
    const metodo = opcoes.method ?? 'GET';
    chamadas.push({
      url: endereco,
      metodo,
      autorizacao: opcoes.headers?.authorization,
      corpo: JSON.parse(opcoes.body ?? 'null'),
    });

    if (falharEm?.({ url: endereco, metodo })) return new Response('{"message":"Missing Permissions"}', { status: 403 });

    if (endereco.endsWith('/channels/POST1') && (metodo === 'GET' || metodo === 'DELETE')) {
      return new Response(JSON.stringify({ id: 'POST1', name: TITULO, parent_id: pai, applied_tags: tags }), { status: 200 });
    }
    return new Response('{"id":"MSG1"}', { status: 200 });
  };
  return {
    chamadas,
    leitura: () => chamadas.filter((c) => c.metodo === 'GET' && c.url.endsWith('/channels/POST1')),
    apagamento: () => chamadas.find((c) => c.metodo === 'DELETE'),
    log: () => chamadas.find((c) => c.url.includes('/channels/CL/messages')),
    edicoes: () => chamadas.filter((c) => c.url.includes('/messages/@original')),
    ultimaEdicao: () => chamadas.filter((c) => c.url.includes('/messages/@original')).at(-1)?.corpo,
  };
}

const MEMBRO = { user: { id: 'ADMIN1', username: 'samara' } };

// Dentro do post a interação traz o canal parcial, com o pai.
const canal = (pai = 'CV') => ({ id: 'POST1', type: 11, parent_id: pai });

const comandoApagar = (pai) => ({
  type: 2, id: 'INTER1', application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  channel: canal(pai), channel_id: 'POST1',
  data: { name: 'vaga', options: [{ name: 'apagar', type: 1 }] },
});

const clique = (acao, pai) => ({
  type: 3, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  channel: canal(pai), channel_id: 'POST1',
  message: { components: [] },
  data: { custom_id: `vaga:${acao}` },
});

const responder = async (interacao) => JSON.parse(await (await rotear(interacao, env, ctx)).text());

const achar = (componentes, aceita, achados = []) => {
  for (const item of componentes ?? []) {
    if (aceita(item)) achados.push(item);
    if (item.components) achar(item.components, aceita, achados);
  }
  return achados;
};
const textos = (componentes) => achar(componentes, (item) => item.type === 10).map((item) => item.content);
const botoes = (componentes) => achar(componentes, (item) => item.type === 2);

// Roda com o console calado e devolve o que foi escrito em log e erro.
async function comConsole(funcao) {
  const linhas = [];
  const originais = { log: console.log, error: console.error };
  console.log = (...args) => linhas.push(args.map(String).join(' '));
  console.error = (...args) => linhas.push(args.map(String).join(' '));
  try {
    const resultado = await funcao();
    await esperarPendentes();
    return { resultado, console: linhas.join('\n') };
  } finally {
    Object.assign(console, originais);
  }
}

describe('comando', () => {
  test('fora de um post do fórum de vagas, só explica onde usar', async () => {
    const api = espionarApi();
    const { resultado: resposta } = await comConsole(() => responder(comandoApagar('OUTRO')));

    assert.equal(resposta.type, 4);
    assert.equal(resposta.data.flags, 64);
    assert.equal(resposta.data.content, 'Use este comando dentro do post da vaga que você quer apagar.');
    assert.equal(api.chamadas.length, 0, 'não toca em nada');
  });

  test('num canal comum, que nem tem pai, também explica', async () => {
    const api = espionarApi();
    const interacao = { ...comandoApagar(), channel: { id: 'CL', type: 0 } };
    const { resultado: resposta } = await comConsole(() => responder(interacao));

    assert.match(resposta.data.content, /dentro do post da vaga/);
    assert.equal(api.chamadas.length, 0);
  });

  test('dentro do post, adia efêmero e lê o post, porque a interação não traz as tags', async () => {
    const api = espionarApi();
    const { resultado: resposta } = await comConsole(() => responder(comandoApagar()));

    assert.equal(resposta.type, 5);
    assert.deepEqual(resposta.data, { flags: 64 }, 'adiamento só com a flag efêmera');
    assert.equal(api.leitura().length, 1);
  });

  test('pergunta com o título da vaga e os botões Apagar e Cancelar', async () => {
    const api = espionarApi();
    await comConsole(() => responder(comandoApagar()));
    const corpo = api.ultimaEdicao();

    assert.equal(corpo.flags, 64 | 32768, 'efêmera e em Components V2');
    assert.ok(textos(corpo.components)[0].startsWith(`Apagar a vaga **${TITULO}**? `));
    assert.deepEqual(
      botoes(corpo.components).map((item) => [item.label, item.custom_id, item.style]),
      [['Apagar', 'vaga:apagar-confirmar', 4], ['Cancelar', 'vaga:apagar-cancelar', 2]],
    );
  });

  test('vaga sem a tag Encerrada: o texto avisa que ela ainda está aberta', async () => {
    const api = espionarApi();
    await comConsole(() => responder(comandoApagar()));
    assert.match(textos(api.ultimaEdicao().components)[0], /ainda está aberta, sem a tag Encerrada/);
  });

  test('vaga encerrada: sem o aviso de aberta', async () => {
    const api = espionarApi({ tags: [...TAGS_ABERTA, TAG_ENCERRADA_ID] });
    await comConsole(() => responder(comandoApagar()));
    assert.doesNotMatch(textos(api.ultimaEdicao().components)[0], /ainda está aberta/);
  });

  test('o comando sozinho nunca apaga nada', async () => {
    const api = espionarApi();
    await comConsole(() => responder(comandoApagar()));
    assert.equal(api.apagamento(), undefined);
  });

  test('se a leitura do post falhar, avisa e não pergunta nada', async () => {
    const api = espionarApi({ falharEm: ({ metodo }) => metodo === 'GET' });
    await comConsole(() => responder(comandoApagar()));

    assert.match(textos(api.ultimaEdicao().components)[0], /Não consegui ler esse post/);
    assert.equal(botoes(api.ultimaEdicao().components).length, 0);
  });
});

describe('Apagar', () => {
  test('adia, relê o post e apaga com o token do bot', async () => {
    const api = espionarApi();
    const { resultado: resposta } = await comConsole(() => responder(clique('apagar-confirmar')));

    assert.equal(resposta.type, 6);
    assert.equal(api.leitura().length, 1, 'relê antes de apagar');
    assert.equal(api.apagamento().url, 'https://discord.com/api/v10/channels/POST1');
    assert.equal(api.apagamento().autorizacao, 'Bot token-de-teste');
  });

  test('registra no log o título e quem apagou, sem link nenhum', async () => {
    const api = espionarApi();
    await comConsole(() => responder(clique('apagar-confirmar')));
    const { content, allowed_mentions: mencoes } = api.log().corpo;

    assert.match(content, new RegExp(`^Vaga apagada por <@ADMIN1> · "${TITULO}" · <t:\\d+:f>$`));
    assert.doesNotMatch(content, /discord\.com\/channels/, 'o link deixou de existir');
    assert.deepEqual(mencoes, { parse: [] });
  });

  test('a ordem é ler, apagar, registrar no log e fechar', async () => {
    const api = espionarApi();
    await comConsole(() => responder(clique('apagar-confirmar')));

    const indice = (aceita) => api.chamadas.findIndex(aceita);
    const leitura = indice((c) => c.metodo === 'GET');
    const apagamento = indice((c) => c.metodo === 'DELETE');
    const log = indice((c) => c.url.includes('/channels/CL/messages'));
    const fechamento = indice((c) => c.url.includes('/messages/@original'));

    assert.ok(leitura < apagamento && apagamento < log && log < fechamento, JSON.stringify({ leitura, apagamento, log, fechamento }));
    assert.equal(textos(api.ultimaEdicao().components)[0], 'Vaga apagada.');
  });

  test('se apagar falhar, nada vai para o log e a admin é avisada', async () => {
    const api = espionarApi({ falharEm: ({ metodo }) => metodo === 'DELETE' });
    const { console: saida } = await comConsole(() => responder(clique('apagar-confirmar')));

    assert.equal(api.log(), undefined);
    assert.match(textos(api.ultimaEdicao().components)[0], /Não consegui apagar a vaga/);
    assert.match(saida, /\[vaga apagar\] falhou em apagamento/);
    assert.match(saida, /Missing Permissions/, 'o motivo real vai para o console');
  });

  test('se a releitura falhar, não apaga', async () => {
    const api = espionarApi({ falharEm: ({ metodo }) => metodo === 'GET' });
    await comConsole(() => responder(clique('apagar-confirmar')));

    assert.equal(api.apagamento(), undefined);
    assert.match(textos(api.ultimaEdicao().components)[0], /Não consegui ler esse post/);
  });

  test('clique fora do fórum de vagas não apaga nada', async () => {
    const api = espionarApi();
    const { resultado: resposta } = await comConsole(() => responder(clique('apagar-confirmar', 'OUTRO')));

    assert.match(resposta.data.content, /dentro do post da vaga/);
    assert.equal(api.chamadas.length, 0);
  });

  test('se a API disser que o post não é do fórum de vagas, não apaga', async () => {
    const api = espionarApi({ pai: 'OUTRO' });
    await comConsole(() => responder(clique('apagar-confirmar')));

    assert.equal(api.apagamento(), undefined);
    assert.match(textos(api.ultimaEdicao().components)[0], /dentro do post da vaga/);
  });

  test('a falha no log não esconde que a vaga foi apagada', async () => {
    const api = espionarApi({ falharEm: ({ url }) => url.includes('/channels/CL/messages') });
    await comConsole(() => responder(clique('apagar-confirmar')));

    assert.ok(api.apagamento());
    assert.equal(textos(api.ultimaEdicao().components)[0], 'Vaga apagada.');
  });
});

describe('Cancelar', () => {
  test('troca a mensagem por "Nada foi apagado." sem tocar no post', async () => {
    const api = espionarApi();
    const { resultado: resposta } = await comConsole(() => responder(clique('apagar-cancelar')));

    assert.equal(resposta.type, 6);
    assert.equal(api.ultimaEdicao().flags, 64 | 32768);
    assert.deepEqual(textos(api.ultimaEdicao().components), ['Nada foi apagado.']);
    assert.equal(api.chamadas.filter((c) => c.url.includes('/channels/')).length, 0, 'nem lê o post');
  });
});

describe('console', () => {
  test('o comando marca a checagem, a leitura e a pergunta', async () => {
    espionarApi();
    const { console: saida } = await comConsole(() => responder(comandoApagar()));

    assert.match(saida, /\[vaga apagar\] checagem do canal: ok post POST1/);
    assert.match(saida, new RegExp(`\\[vaga apagar\\] leitura do post: ok "${TITULO}"`));
    assert.match(saida, /\[vaga apagar\] pergunta: ok vaga ainda aberta, com aviso/);
  });

  test('o Apagar marca cada etapa, na ordem', async () => {
    espionarApi();
    const { console: saida } = await comConsole(() => responder(clique('apagar-confirmar')));
    const etapas = [...saida.matchAll(/\[vaga apagar\] ([^:]+): ok/g)].map((achado) => achado[1]);

    assert.deepEqual(etapas, ['leitura do post', 'apagamento', 'log', 'fechamento da interação']);
  });

  test('fora do lugar, o motivo vai para o console', async () => {
    espionarApi();
    const { console: saida } = await comConsole(() => responder(comandoApagar('OUTRO')));
    assert.match(saida, /\[vaga apagar\] falhou em checagem do canal: canal POST1 tem pai OUTRO/);
  });
});

describe('registro do comando', () => {
  test('o registrar-comandos.js inclui /vaga apagar', () => {
    const saida = execFileSync(process.execPath, ['scripts/registrar-comandos.js', '--ver'], { encoding: 'utf8' });
    const comandos = JSON.parse(saida.slice(0, saida.lastIndexOf('\nNada foi enviado')));
    const vaga = comandos.find((comando) => comando.name === 'vaga');

    assert.deepEqual(vaga.options.map((opcao) => opcao.name), ['nova', 'encerrar', 'apagar']);
    assert.equal(vaga.default_member_permissions, '0', 'só admins');
  });
});
