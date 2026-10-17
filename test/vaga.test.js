// Testes do /vaga nova em Components V2, com o runner nativo do Node: `npm test`.
// Nada de rede: o fetch global é trocado por um espião que guarda as chamadas.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import {
  CORES,
  FUNCOES_POR_AREA,
  MENCOES,
  TAGS_AREA,
  TAGS_MODALIDADE,
  TAGS_SENIORIDADE,
} from '../src/config.js';
import { MAXIMO_ROTULO_DO_BOTAO, rotuloDoBotao } from '../src/componentes/vaga-componentes.js';
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

// Todos os cargos do config.js, que é como o servidor está hoje.
const TODOS_OS_CARGOS = [
  ...TAGS_AREA.map((area) => area.cargoId),
  ...Object.values(FUNCOES_POR_AREA).flat().map((funcao) => funcao.cargoId),
].filter(Boolean);

const cargoDaArea = (valor) => TAGS_AREA.find((area) => area.valor === valor).cargoId;
const cargoDaFuncao = (area, valor) => FUNCOES_POR_AREA[area].find((funcao) => funcao.valor === valor).cargoId;

function espionarApi({ falharEm, cargosNoServidor = TODOS_OS_CARGOS } = {}) {
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
    if (endereco.endsWith('/guilds/G1/roles')) {
      return new Response(JSON.stringify(cargosNoServidor.map((id) => ({ id, name: 'cargo' }))), { status: 200 });
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

// O /vaga nova só roda no canal de log (CANAIS_PERMITIDOS), então o comando vem de lá.
const comando = (subcomando, canal = 'CL', id = 'INTER1') => ({
  type: 2, id, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  channel: { id: canal, type: 0 }, channel_id: canal,
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

    assert.equal(
      local.description,
      'Opcional para remoto. Se for híbrido ou presencial, informe a cidade. Até 100 caracteres.',
    );
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
    // entra na edição seguinte.
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

  test('o container é magenta e traz os dados, o botão e a assinatura, sem linha de domínio', async () => {
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
        [7, '-# Autora: <@ADMIN1>'],
      ],
    );
    assert.equal(porIdDoComponente(mensagem.components, 5), null, 'o id 5 da antiga linha do domínio não volta');

    // O botão vem depois dos dados e antes da assinatura.
    assert.deepEqual(caixa.components.map((item) => item.type), [10, 10, 10, 10, 1, 10]);

    const botao = botoes(caixa.components).find((item) => item.style === 5);
    assert.equal(botao.id, 6);
    assert.equal(botao.label, 'Candidatar-se em vagas.acme.com');
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

describe('botão Candidatar-se', () => {
  const botaoDoCard = (componentes) => botoes(componentes).find((item) => item.style === 5);

  test('o limite do rótulo é o da doc: 80 caracteres', () => {
    assert.equal(MAXIMO_ROTULO_DO_BOTAO, 80);
  });

  test('o domínio vem do new URL(), e o link vai exatamente como foi digitado', async () => {
    espionarApi();
    const digitado = 'https://Vagas.Acme.com.br/Back-End?ref=TechGirls&utm=1#topo';
    const { mensagem } = await previaPronta({ ...VAGA, link: digitado });
    const botao = botaoDoCard(mensagem.components);

    assert.equal(botao.label, `Candidatar-se em ${new URL(digitado).hostname}`);
    assert.equal(botao.label, 'Candidatar-se em vagas.acme.com.br');
    assert.equal(botao.url, digitado, 'nem caixa, nem caminho, nem parâmetros mudam');
  });

  test('domínio que cabe no limite não é cortado', () => {
    const dominio = `${'a'.repeat(MAXIMO_ROTULO_DO_BOTAO - 'Candidatar-se em '.length - 4)}.com`;
    const rotulo = rotuloDoBotao(dominio);

    assert.equal(rotulo.length, MAXIMO_ROTULO_DO_BOTAO);
    assert.equal(rotulo, `Candidatar-se em ${dominio}`);
  });

  test('domínio longo é cortado no fim, e o resto do texto fica inteiro', () => {
    const dominio = `${'a'.repeat(50)}.${'b'.repeat(50)}.com.br`;
    const rotulo = rotuloDoBotao(dominio);

    assert.equal(rotulo.length, MAXIMO_ROTULO_DO_BOTAO);
    assert.ok(rotulo.startsWith('Candidatar-se em aaaa'), 'o começo nunca é cortado');
    assert.ok(rotulo.endsWith('…'), 'as reticências mostram que o domínio foi encurtado');
    assert.ok(dominio.startsWith(rotulo.slice('Candidatar-se em '.length, -1)), 'o que sobra é o começo do domínio');
  });

  test('no card, o domínio longo também respeita o limite e o link continua inteiro', async () => {
    espionarApi();
    const link = `https://${'a'.repeat(50)}.${'b'.repeat(50)}.com.br/vaga`;
    const { mensagem } = await previaPronta({ ...VAGA, link });
    const botao = botaoDoCard(mensagem.components);

    assert.equal(botao.label.length, MAXIMO_ROTULO_DO_BOTAO);
    assert.equal(botao.url, link);
  });

  test('sem domínio, o rótulo fica só "Candidatar-se"', () => {
    assert.equal(rotuloDoBotao(null), 'Candidatar-se');
    assert.equal(rotuloDoBotao(''), 'Candidatar-se');
  });

  test('o link é relido do botão: sobrevive aos menus e volta no Corrigir', async () => {
    espionarApi();
    const card = await cartaoCompleto();
    const botao = botaoDoCard(card.components);
    assert.equal(botao.url, VAGA.link);
    assert.equal(botao.label, 'Candidatar-se em vagas.acme.com');

    // Corrigir sai da mesma leitura de estado, então serve de prova do que foi relido.
    const resposta = await responder(clique('corrigir', card));
    const link = resposta.data.components.find((label) => label.component.custom_id === 'link').component.value;
    assert.equal(link, VAGA.link);
  });

  test('no post publicado, o botão leva o domínio no rótulo e o link completo', async () => {
    const api = espionarApi();
    const card = await cartaoCompleto();
    await responder(clique('publicar', card));
    await esperarPendentes();

    const componentes = api.cartao().corpo.components;
    const botao = botaoDoCard(componentes);
    assert.equal(botao.label, 'Candidatar-se em vagas.acme.com');
    assert.equal(botao.url, VAGA.link);
    assert.equal(porIdDoComponente(componentes, 5), null);
    assert.equal(textos(componentes).some((conteudo) => conteudo.includes('🔗 Candidatar-se em')), false);
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
    assert.equal(
      textos(componentes)[0],
      'Confira como vai ficar e escolha ainda: senioridade, modalidade.\n🔔 Vai avisar quem tem o cargo **Dados**.',
    );
  });

  test('Publicar só habilita com as três escolhas', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();

    const duas = await cliqueEEdicao('senioridade', { components: (await cliqueEEdicao('area', mensagem, ['dados'])).componentes }, ['junior']);
    assert.equal(botoes(duas.componentes).find((item) => item.label === 'Publicar').disabled, true);

    const tres = await cliqueEEdicao('modalidade', { components: duas.componentes }, ['remoto']);
    assert.equal(botoes(tres.componentes).find((item) => item.label === 'Publicar').disabled, false);
    assert.match(textos(tres.componentes)[0], /^Confira como vai ficar e publique quando estiver boa\.\n/);
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
    assert.deepEqual(mensagem.allowed_mentions.parse, [], 'nada de everyone, here ou users');
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

describe('áreas e funções no config', () => {
  test('são as oito áreas, nesta ordem', () => {
    assert.deepEqual(TAGS_AREA.map((area) => area.rotulo), [
      'Desenvolvimento', 'Dados', 'Design e UX', 'QA', 'Infra e Cloud',
      'Cybersegurança', 'Suporte Técnico', 'Produto e Gestão',
    ]);
  });

  test('toda área tem a sua lista de funções, e só elas', () => {
    for (const area of TAGS_AREA) {
      assert.ok(FUNCOES_POR_AREA[area.valor]?.length, `${area.rotulo} sem funções`);
    }
    assert.deepEqual(Object.keys(FUNCOES_POR_AREA).sort(), TAGS_AREA.map((area) => area.valor).sort());
  });

  test('todo cargo preenchido é um ID, sem repetição, e nenhum é o Suporte da equipe', () => {
    const suporteDaEquipe = MENCOES.find((item) => item.valor === 'suporte').id;
    for (const id of TODOS_OS_CARGOS) {
      assert.match(id, /^\d{17,20}$/);
      assert.notEqual(id, suporteDaEquipe, 'o ⚙️ Suporte é da equipe, não de área');
    }
    assert.deepEqual(TODOS_OS_CARGOS, [...new Set(TODOS_OS_CARGOS)], 'cargo repetido');
  });
});

describe('menu de função', () => {
  const ESCOLHAS_COM_FUNCAO = { area: 'desenvolvimento', funcao: 'back-end', senioridade: 'pleno', modalidade: 'remoto' };
  const valores = (componentes) => menu(componentes, 'funcao').options.map((o) => o.value);
  const escolhida = (componentes) => menu(componentes, 'funcao').options.find((o) => o.default)?.value;

  test('sem área, fica travado só com "Não especificar"', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const funcao = menu(mensagem.components, 'funcao');

    assert.equal(funcao.disabled, true);
    assert.deepEqual(funcao.options.map((o) => o.label), ['Não especificar']);
    assert.equal(funcao.options[0].default, true);
  });

  test('vem logo depois do menu de área', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const ordem = achar(mensagem.components, (item) => item.type === 3).map((item) => item.custom_id);

    assert.deepEqual(ordem, ['vaga:area', 'vaga:funcao', 'vaga:senioridade', 'vaga:modalidade']);
  });

  test('com área, lista só as funções dela, com "Não especificar" como padrão', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const { componentes } = await cliqueEEdicao('area', mensagem, ['dados']);

    assert.equal(menu(componentes, 'funcao').disabled, undefined, 'destravado');
    assert.deepEqual(valores(componentes), ['nao-especificar', ...FUNCOES_POR_AREA.dados.map((f) => f.valor)]);
    assert.equal(escolhida(componentes), 'nao-especificar');
  });

  test('escolher a função adia, edita pelo webhook e marca a escolha', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const comArea = await cliqueEEdicao('area', mensagem, ['dados']);
    const { resposta, componentes } = await cliqueEEdicao('funcao', { components: comArea.componentes }, ['ciencia-dados']);

    assert.equal(resposta.type, 6);
    assert.equal(escolhida(componentes), 'ciencia-dados');
  });

  test('trocar de área remonta a lista e volta para "Não especificar"', async () => {
    espionarApi();
    const card = await cartaoCompleto(VAGA, ESCOLHAS_COM_FUNCAO);
    assert.equal(escolhida(card.components), 'back-end');

    const { componentes } = await cliqueEEdicao('area', card, ['qa']);
    assert.deepEqual(valores(componentes), ['nao-especificar', 'qa-manual', 'qa-automacao']);
    assert.equal(escolhida(componentes), 'nao-especificar');
  });

  test('escolher de novo a mesma área mantém a função', async () => {
    espionarApi();
    const card = await cartaoCompleto(VAGA, ESCOLHAS_COM_FUNCAO);
    const { componentes } = await cliqueEEdicao('area', card, ['desenvolvimento']);

    assert.equal(escolhida(componentes), 'back-end');
  });

  test('as outras escolhas não mexem na função', async () => {
    espionarApi();
    const card = await cartaoCompleto(VAGA, ESCOLHAS_COM_FUNCAO);
    const { componentes } = await cliqueEEdicao('senioridade', card, ['senior']);

    assert.equal(escolhida(componentes), 'back-end');
  });

  test('função de outra área é ignorada', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const comArea = await cliqueEEdicao('area', mensagem, ['qa']);
    const { componentes } = await cliqueEEdicao('funcao', { components: comArea.componentes }, ['front-end']);

    assert.equal(escolhida(componentes), 'nao-especificar');
  });

  test('a função é opcional: Publicar habilita sem ela', async () => {
    espionarApi();
    const card = await cartaoCompleto();

    assert.equal(escolhida(card.components), 'nao-especificar');
    assert.equal(botoes(card.components).find((item) => item.label === 'Publicar').disabled, false);
  });
});

describe('menção no post', () => {
  const ESCOLHAS_COM_FUNCAO = { area: 'desenvolvimento', funcao: 'back-end', senioridade: 'pleno', modalidade: 'remoto' };
  const DEV = cargoDaArea('desenvolvimento');
  const BACK = cargoDaFuncao('desenvolvimento', 'back-end');

  async function publicarCom(escolhas, opcoes) {
    const api = espionarApi(opcoes);
    const card = await cartaoCompleto(VAGA, escolhas);
    await responder(clique('publicar', card));
    await esperarPendentes();
    return api;
  }

  // Roda calando o console.error, e devolve o que foi registrado nele.
  async function comConsole(funcao) {
    const registrado = [];
    const original = console.error;
    console.error = (...args) => registrado.push(args.map(String).join(' '));
    try {
      return { resultado: await funcao(), registrado: registrado.join(' ') };
    } finally {
      console.error = original;
    }
  }

  test('a pré-visualização mostra quem vai ser avisada', async () => {
    espionarApi();
    const card = await cartaoCompleto(VAGA, ESCOLHAS_COM_FUNCAO);

    assert.match(textos(card.components)[0], /🔔 Vai avisar quem tem os cargos \*\*Desenvolvimento\*\* e \*\*Back-End\*\*\./);
    assert.equal(porIdDoComponente(card.components, 14).content, `<@&${DEV}> <@&${BACK}>`);
  });

  test('na pré-visualização, a menção não notifica ninguém', async () => {
    espionarApi();
    await cartaoCompleto(VAGA, ESCOLHAS_COM_FUNCAO);

    assert.deepEqual(ultimaPrevia().allowed_mentions, { parse: [] });
  });

  test('sem área, a pré-visualização não fala de aviso', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();

    assert.doesNotMatch(textos(mensagem.components)[0], /🔔/);
    assert.equal(porIdDoComponente(mensagem.components, 14), null);
  });

  test('a criação do post menciona área e função, e libera só esses cargos', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);
    const mensagem = api.post().corpo.message;

    assert.ok(mensagem.content.startsWith(`<@&${DEV}> <@&${BACK}>\n`), 'a menção abre o texto, que é o que notifica');
    assert.deepEqual(mensagem.allowed_mentions, { parse: [], roles: [DEV, BACK] });
  });

  test('no payload da criação, content e allowed_mentions ficam dentro de message, não na raiz', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);
    const corpo = api.post().corpo;

    // A raiz do Start Thread in Forum tem name, applied_tags e message; content e
    // allowed_mentions vão dentro de message.
    assert.deepEqual(Object.keys(corpo).sort(), ['applied_tags', 'message', 'name']);
    assert.equal(corpo.content, undefined, 'content na raiz seria ignorado');
    assert.equal(corpo.allowed_mentions, undefined, 'allowed_mentions na raiz seria ignorado');

    const { content, allowed_mentions: mencoes } = corpo.message;
    assert.deepEqual(content.match(/<@&\d+>/g), [`<@&${DEV}>`, `<@&${BACK}>`], 'as menções no formato <@&id>');
    assert.deepEqual(mencoes, { parse: [], roles: [DEV, BACK] }, 'libera só os cargos escolhidos');
  });

  test('a edição para o card preserva a menção da criação, acima do container', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);
    const mencaoDaCriacao = api.post().corpo.message.content.split('\n')[0];
    const componentes = api.cartao().corpo.components;

    const posicao = (id) => componentes.findIndex((item) => item.id === id);
    assert.equal(porIdDoComponente(componentes, 14).content, mencaoDaCriacao, 'a mesma menção da criação');
    assert.equal(posicao(14), 0, 'a menção abre o card');
    assert.ok(posicao(14) < posicao(1), 'antes do título');
    assert.ok(posicao(14) < posicao(4), 'antes do container');
    assert.equal(achar(porIdDoComponente(componentes, 4).components, (item) => item.id === 14).length, 0, 'fora do container');
  });

  test('o console mostra os cargos enviados e o que o Discord registrou', async () => {
    const registrado = [];
    const original = console.log;
    console.log = (...args) => registrado.push(args.map(String).join(' '));
    try {
      await publicarCom(ESCOLHAS_COM_FUNCAO);
    } finally {
      console.log = original;
    }

    const linhas = registrado.join('\n');
    assert.ok(linhas.includes(`[vaga] menção enviada na criação: ok roles: [${DEV}, ${BACK}]`));
    assert.match(linhas, /\[vaga\] menção registrada pelo Discord: ok mention_roles: \[/);
  });

  test('sem função, menciona só a área', async () => {
    const api = await publicarCom(ESCOLHAS);
    const mensagem = api.post().corpo.message;

    assert.ok(mensagem.content.startsWith(`<@&${DEV}>\n`));
    assert.deepEqual(mensagem.allowed_mentions, { parse: [], roles: [DEV] });
  });

  test('nunca libera everyone, here ou users', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);
    const { allowed_mentions: mencoes } = api.post().corpo.message;

    assert.deepEqual(mencoes.parse, []);
    assert.equal(mencoes.users, undefined);
  });

  test('senioridade e modalidade não mencionam', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);

    assert.equal(api.post().corpo.message.content.match(/<@&\d+>/g).length, 2);
  });

  test('no card, a menção fica num Text Display acima do container', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);
    const componentes = api.cartao().corpo.components;

    assert.deepEqual(componentes[0], { type: 10, id: 14, content: `<@&${DEV}> <@&${BACK}>` });
    assert.ok(componentes.findIndex((item) => item.type === 17) > 0, 'o container vem depois');
  });

  test('a edição para o card não avisa de novo', async () => {
    const api = await publicarCom(ESCOLHAS_COM_FUNCAO);

    assert.deepEqual(api.cartao().corpo.allowed_mentions, { parse: [] });
  });

  test('cargo que não existe mais no servidor fica de fora, e vai para o console', async () => {
    const { resultado: api, registrado } = await comConsole(() => publicarCom(ESCOLHAS_COM_FUNCAO, {
      cargosNoServidor: TODOS_OS_CARGOS.filter((id) => id !== BACK),
    }));
    const mensagem = api.post().corpo.message;

    assert.deepEqual(mensagem.allowed_mentions.roles, [DEV]);
    assert.equal(mensagem.content.includes(BACK), false);
    assert.equal(porIdDoComponente(api.cartao().corpo.components, 14).content, `<@&${DEV}>`);
    assert.match(registrado, /\[vaga\] falhou em menção: cargo não existe no servidor: Back-End/);
  });

  test('sem nenhum cargo que exista, publica sem menção', async () => {
    const { resultado: api } = await comConsole(() => publicarCom(ESCOLHAS, { cargosNoServidor: [] }));
    const mensagem = api.post().corpo.message;

    assert.deepEqual(mensagem.allowed_mentions, { parse: [], roles: [] });
    assert.doesNotMatch(mensagem.content, /<@&/);
    assert.equal(porIdDoComponente(api.cartao().corpo.components, 14), null, 'sem Text Display vazio');
    assert.match(api.fechamento().corpo.components[0].content, /Vaga publicada: /);
  });

  test('área sem cargo no config: avisa na pré-visualização e menciona só a função', async () => {
    // O cenário é montado aqui, sem depender de o config real ter alguma área sem
    // cargo: a área perde o cargoId só durante o teste e recebe de volta no fim.
    const area = TAGS_AREA.find((item) => item.valor === 'design-ux');
    const funcao = FUNCOES_POR_AREA[area.valor][0];
    const cargoOriginal = area.cargoId;
    const escolhas = { area: area.valor, funcao: funcao.valor, senioridade: 'pleno', modalidade: 'remoto' };

    area.cargoId = null;
    try {
      espionarApi();
      const card = await cartaoCompleto(VAGA, escolhas);
      assert.equal(
        textos(card.components)[0],
        'Confira como vai ficar e publique quando estiver boa.\n'
          + `🔔 Vai avisar quem tem o cargo **${funcao.rotulo}**. O cargo ${area.rotulo} não existe no servidor.`,
      );
      assert.equal(porIdDoComponente(card.components, 14).content, `<@&${funcao.cargoId}>`, 'só a função na menção');

      const { resultado: api, registrado } = await comConsole(() => publicarCom(escolhas));
      assert.deepEqual(api.post().corpo.message.allowed_mentions.roles, [funcao.cargoId]);
      assert.ok(registrado.includes(`sem cargo no config.js: ${area.rotulo}`));
    } finally {
      area.cargoId = cargoOriginal;
    }
  });

  test('se a conferência dos cargos falhar, publica com os do config e registra', async () => {
    const { resultado: api, registrado } = await comConsole(() => publicarCom(ESCOLHAS_COM_FUNCAO, { falharEm: '/roles' }));

    assert.deepEqual(api.post().corpo.message.allowed_mentions.roles, [DEV, BACK]);
    assert.match(registrado, /\[vaga\] falhou em conferência dos cargos/);
  });
});

describe('limpar', () => {
  const ESCOLHAS_COM_FUNCAO = { area: 'dados', funcao: 'ciencia-dados', senioridade: 'pleno', modalidade: 'remoto' };
  const botao = (componentes, rotulo) => botoes(componentes).find((item) => item.label === rotulo);
  const escolhida = (componentes, acao) => menu(componentes, acao).options.find((o) => o.default)?.value;

  // Limpar pergunta; o Confirmar é que esvazia.
  async function perguntando() {
    espionarApi();
    const card = await cartaoCompleto(VAGA, ESCOLHAS_COM_FUNCAO);
    const pergunta = await cliqueEEdicao('limpar', card);
    return { card, ...pergunta };
  }

  async function limpo() {
    const { componentes } = await perguntando();
    return cliqueEEdicao('limpar-confirmar', { components: componentes });
  }

  test('a pré-visualização tem Limpar entre Publicar e Cancelar', async () => {
    espionarApi();
    const card = await cartaoCompleto();
    assert.deepEqual(
      botoes(card.components).filter((item) => item.custom_id).map((item) => item.label),
      ['Publicar', 'Limpar', 'Cancelar'],
    );
    assert.equal(botao(card.components, 'Limpar').disabled, false);
  });

  describe('confirmação', () => {
    test('Limpar só pergunta: mostra a pergunta com Confirmar e Voltar', async () => {
      const { resposta, componentes } = await perguntando();

      assert.equal(resposta.type, 6);
      assert.equal(textos(componentes)[0], 'Limpar todos os campos da vaga? As escolhas dos menus continuam.');
      assert.deepEqual(
        botoes(componentes).filter((item) => item.custom_id).map((item) => [item.label, item.custom_id]),
        [['Confirmar', 'vaga:limpar-confirmar'], ['Voltar', 'vaga:limpar-voltar']],
      );
    });

    test('enquanto pergunta, nada é apagado: o card continua inteiro', async () => {
      const { card, componentes } = await perguntando();

      for (const id of [1, 2, 3, 13, 14]) {
        assert.deepEqual(porIdDoComponente(componentes, id), porIdDoComponente(card.components, id), `id ${id} igual`);
      }
      assert.equal(botoes(componentes).find((item) => item.style === 5).url, VAGA.link, 'o link continua');
    });

    test('enquanto pergunta, os menus ficam travados sem perder a escolha', async () => {
      const { componentes } = await perguntando();

      for (const acao of ['area', 'funcao', 'senioridade', 'modalidade']) assert.equal(menu(componentes, acao).disabled, true, acao);
      assert.equal(escolhida(componentes, 'area'), 'dados');
      assert.equal(escolhida(componentes, 'funcao'), 'ciencia-dados');
    });

    test('Voltar devolve a pré-visualização exatamente como estava', async () => {
      const { card, componentes } = await perguntando();
      const { resposta, componentes: devolvida } = await cliqueEEdicao('limpar-voltar', { components: componentes });

      assert.equal(resposta.type, 6);
      assert.deepEqual(devolvida, card.components);
    });
  });

  test('Confirmar adia, edita pelo webhook e esvazia todos os campos', async () => {
    const { resposta, componentes } = await limpo();

    assert.equal(resposta.type, 6);
    for (const id of [1, 2, 3, 13]) assert.equal(porIdDoComponente(componentes, id), null, `id ${id} some`);
    assert.equal(botoes(componentes).some((item) => item.style === 5), false, 'sem link, sem botão Candidatar-se');
    assert.match(textos(componentes)[0], /^Rascunho em branco\. Toque em Preencher/);
  });

  test('não cancela: as escolhas dos menus continuam', async () => {
    const { componentes } = await limpo();

    assert.equal(escolhida(componentes, 'area'), 'dados');
    assert.equal(escolhida(componentes, 'funcao'), 'ciencia-dados');
    assert.equal(escolhida(componentes, 'senioridade'), 'pleno');
    assert.equal(escolhida(componentes, 'modalidade'), 'remoto');
    assert.equal(porTipo(componentes, 17).length, 1, 'o card continua lá');
  });

  test('em branco: Preencher aparece, Publicar e Limpar travam', async () => {
    const { componentes } = await limpo();

    assert.deepEqual(
      botoes(componentes).filter((item) => item.custom_id).map((item) => item.label),
      ['Preencher', 'Publicar', 'Limpar', 'Cancelar'],
    );
    assert.equal(botao(componentes, 'Publicar').disabled, true);
    assert.equal(botao(componentes, 'Limpar').disabled, true);
  });

  test('Preencher abre o formulário vazio', async () => {
    const { componentes } = await limpo();
    const resposta = await responder(clique('corrigir', { components: componentes }));

    assert.equal(resposta.type, 9);
    assert.deepEqual(resposta.data.components.map((label) => label.component.value).filter(Boolean), []);
  });

  test('o formulário enviado do rascunho limpo atualiza no lugar e mantém as escolhas', async () => {
    const { componentes } = await limpo();
    const envio = { ...envioDoModal({ ...VAGA, titulo: 'Cientista de Dados' }), message: { components: componentes } };

    const resposta = await responder(envio);
    await esperarPendentes();
    const atualizada = ultimaPrevia().components;

    assert.equal(resposta.type, 6, 'atualiza a mesma mensagem');
    assert.equal(porIdDoComponente(atualizada, 1).content, '# 💼 Cientista de Dados');
    assert.equal(escolhida(atualizada, 'area'), 'dados');
    assert.equal(escolhida(atualizada, 'funcao'), 'ciencia-dados');
    assert.equal(botao(atualizada, 'Publicar').disabled, false);
    assert.equal(botao(atualizada, 'Preencher'), undefined, 'com texto, o Preencher sai');
  });

  test('publicar um rascunho em branco não cria post nenhum', async () => {
    const { componentes } = await limpo();
    const original = console.error;
    console.error = () => {};
    let resposta;
    try {
      resposta = await responder(clique('publicar', { components: componentes }));
      await esperarPendentes();
    } finally {
      console.error = original;
    }

    assert.match(resposta.data.content, /O rascunho está incompleto/);
    assert.equal(ultimasChamadas.some((c) => c.url.includes('/threads')), false);
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

    test('a edição não libera menção nenhuma, para encerrar não avisar de novo', async () => {
      const api = espionarPost();
      await responder(comandoEncerrar());
      await esperarPendentes();

      assert.deepEqual(api.cartao().corpo.allowed_mentions, { parse: [] });
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
    await registrar('menu funcao', clique('funcao', mensagem, ['back-end']));
    mensagem = { components: ultimaPrevia().components };

    await registrar('publicar', clique('publicar', mensagem));
    await registrar('cancelar', clique('cancelar', mensagem));

    assert.deepEqual(conferidos, [
      'envio do formulário',
      'erro de validação',
      'menu area',
      'menu senioridade',
      'menu modalidade',
      'menu funcao',
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
    await guardar('menu funcao', clique('funcao', mensagem, ['back-end']));
    mensagem = { components: ultimaPrevia().components };

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

