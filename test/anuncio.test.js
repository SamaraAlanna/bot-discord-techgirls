// Testes do /anuncio em Components V2, com o runner nativo do Node: `npm test`.
// Nada de rede: o fetch global é trocado por um espião que guarda as chamadas.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { CORES, MENCOES } from '../src/config.js';
import { rotear } from '../src/index.js';
import { MODELOS } from '../src/modelos.js';

const ID_SUPORTE = MENCOES.find((item) => item.valor === 'suporte').id;
const FLAGS_PREVIA = 64 | 32768;

const env = {
  GUILD_ID: 'G1',
  CANAL_ANUNCIOS_ID: 'CA',
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

function lerCorpo(corpo) {
  if (typeof corpo === 'string') return JSON.parse(corpo);
  if (corpo instanceof FormData) return JSON.parse(corpo.get('payload_json'));
  return null;
}

const arquivosDoCorpo = (corpo) => (corpo instanceof FormData
  ? [...corpo.entries()].filter(([chave]) => chave.startsWith('files[')).map(([, valor]) => valor.name)
  : []);

// Guarda as chamadas da última espiã, para os atalhos lerem a edição sem receber o objeto.
let ultimasChamadas = [];
const ultimaEdicao = () => [...ultimasChamadas].reverse().find((item) => item.metodo === 'PATCH')?.corpo ?? null;

function espionarApi({ falharEm, statusDoCdn = 200 } = {}) {
  const chamadas = [];
  ultimasChamadas = chamadas;
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
    // Mais de uma edição por fluxo: a que interessa é sempre a última.
    edicao: () => [...chamadas].reverse().find((c) => c.metodo === 'PATCH'),
    downloads: () => chamadas.filter((c) => c.url.includes('cdn.discordapp.com')),
    reacao: () => chamadas.find((c) => c.url.includes('/reactions/')),
  };
}

const MEMBRO = {
  nick: 'Sam',
  avatar: 'avatarsam',
  user: { id: 'ADMIN1', username: 'samara', global_name: null, avatar: null },
};

const EVENTO = {
  titulo: 'Mentoria de carreira',
  oque: 'Conversa aberta sobre transição.',
  quando: '15/10/2026 19:00',
  onde: 'Canal de voz Sala 1',
  link: 'https://techgirls.dev/mentoria',
};

const PARCERIA = {
  titulo: 'Parceria com a Acme',
  texto: 'Cursos com desconto para a comunidade.',
  cupom: 'TECHGIRLS20',
  desconto: '20% até 30/11',
  link: 'https://acme.com/cursos',
};

const AVISO = {
  titulo: 'Manutenção do servidor',
  texto: 'O servidor fica fora do ar no sábado de manhã.',
  link: '',
  quando: '',
};

const comando = (modelo) => ({
  type: 2, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  data: { name: 'anuncio', options: [{ name: modelo, type: 1 }] },
});

const envioDoModal = (modelo, campos, { mensagem } = {}) => ({
  type: 5, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  ...(mensagem ? { message: mensagem } : {}),
  data: {
    custom_id: `anuncio:texto:${modelo}`,
    components: Object.entries(campos).map(([id, valor]) => ({
      type: 18, id: 1, component: { type: 4, id: 2, custom_id: id, value: valor },
    })),
  },
});

const anexo = (id, filename) => ({
  id,
  filename,
  content_type: 'image/png',
  size: 2048,
  url: `https://cdn.discordapp.com/ephemeral-attachments/1/2/${filename}?ex=aa`,
  ephemeral: true,
});

const envioDeImagens = (modelo, imagens, mensagem) => ({
  type: 5, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO, message: mensagem,
  data: {
    custom_id: `anuncio:imagens:${modelo}`,
    components: [
      { type: 18, id: 9, component: { type: 19, id: 10, custom_id: 'imagens', values: imagens.map((item) => item.id) } },
    ],
    resolved: { attachments: Object.fromEntries(imagens.map((item) => [item.id, item])) },
  },
});

const clique = (acao, modelo, mensagem, values) => ({
  type: 3, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  message: mensagem,
  data: { custom_id: `anuncio:${acao}:${modelo}`, ...(values ? { values } : {}) },
});

const responder = async (interacao) => JSON.parse(await (await rotear(interacao, env, ctx)).text());

const mensagemDe = (resposta, anexos = []) => ({ components: resposta.data.components, attachments: anexos });

// Leitura da árvore de componentes.
const achar = (componentes, aceita, achados = []) => {
  for (const item of componentes ?? []) {
    if (aceita(item)) achados.push(item);
    if (item.components) achar(item.components, aceita, achados);
    if (item.accessory) achar([item.accessory], aceita, achados);
  }
  return achados;
};
const porTipo = (componentes, tipo) => achar(componentes, (item) => item.type === tipo);
const textos = (componentes) => porTipo(componentes, 10).map((item) => item.content);
const porIdDoComponente = (componentes, id) => achar(componentes, (item) => item.id === id)[0] ?? null;
const botoes = (componentes) => porTipo(componentes, 2);
const menu = (componentes, acao, modelo) => achar(componentes, (item) => item.custom_id === `anuncio:${acao}:${modelo}`)[0];

async function previaPronta(modelo = 'evento', campos = EVENTO) {
  const resposta = await responder(envioDoModal(modelo, campos));
  return { resposta, mensagem: mensagemDe(resposta) };
}

// Clica e devolve a mensagem como ela ficou depois da edição pelo webhook.
// Precisa de uma espiã ativa: menus e botões agora adiam e editam.
async function cliqueEEdicao(acao, modelo, mensagem, values) {
  const resposta = await responder(clique(acao, modelo, mensagem, values));
  await esperarPendentes();
  const corpo = ultimaEdicao();
  return { resposta, corpo, componentes: corpo?.components ?? [] };
}

// Passa pelo menu de menção, que é o que destrava o Publicar.
async function comMencao(escolha, modelo = 'evento', campos = EVENTO, anexos = []) {
  const { mensagem } = await previaPronta(modelo, campos);
  const { componentes } = await cliqueEEdicao('mencao', modelo, { ...mensagem, attachments: anexos }, [escolha]);
  return { components: componentes, attachments: anexos };
}

describe('comando', () => {
  test('cada subcomando abre o formulário do seu modelo', async () => {
    for (const [nome, modelo] of Object.entries(MODELOS)) {
      const resposta = await responder(comando(nome));

      assert.equal(resposta.type, 9, `/anuncio ${nome} abre modal`);
      assert.equal(resposta.data.title, modelo.tituloDoModal);
      assert.deepEqual(
        resposta.data.components.map((label) => label.component.custom_id),
        modelo.campos.map((campo) => campo.id),
      );
      assert.ok(resposta.data.components.length <= 5, 'cabe no limite de 5 componentes do modal');
    }
  });

  test('o campo de data avisa que a hora é de Brasília', async () => {
    const resposta = await responder(comando('evento'));
    const quando = resposta.data.components.find((label) => label.component.custom_id === 'quando');

    assert.match(quando.description, /horário de Brasília/);
    assert.match(quando.description, /DD\/MM\/AAAA HH:MM/);
  });

  test('subcomando desconhecido não quebra', async () => {
    const resposta = await responder(comando('sorteio'));
    assert.match(resposta.data.content, /Não conheço esse modelo/);
  });
});

describe('pré-visualização em V2', () => {
  test('vem efêmera, com a flag de Components V2 e sem content nem embeds', async () => {
    const { resposta } = await previaPronta();

    assert.equal(resposta.type, 4);
    assert.equal(resposta.data.flags, FLAGS_PREVIA);
    assert.equal(resposta.data.content, undefined);
    assert.equal(resposta.data.embeds, undefined);
  });

  test('tudo fica dentro de um container roxo', async () => {
    const { resposta } = await previaPronta();
    const caixa = porTipo(resposta.data.components, 17)[0];

    assert.equal(caixa.accent_color, CORES.ANUNCIO);
    assert.equal(caixa.accent_color, 0x7341c0);
  });

  test('fora do container ficam menção, título e descrição, nesta ordem', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const { componentes } = await cliqueEEdicao('mencao', 'evento', mensagem, ['here']);
    const soltos = componentes.filter((item) => item.type === 10);

    assert.deepEqual(soltos.map((item) => item.id), [8, 1, 2, 3]);
    assert.equal(soltos[1].content, '@here');
    assert.equal(soltos[2].content, '# Mentoria de carreira');
    assert.equal(soltos[3].content, 'Conversa aberta sobre transição.');
  });

  test('a autora fecha o container, em texto pequeno e sem miniatura', async () => {
    const { resposta } = await previaPronta();
    const caixa = porTipo(resposta.data.components, 17)[0];
    const ultimo = caixa.components[caixa.components.length - 1];

    assert.equal(ultimo.id, 7);
    assert.equal(ultimo.content, '-# Autora: <@ADMIN1>');
    assert.equal(porTipo(resposta.data.components, 11).length, 0, 'nada de Thumbnail');
    assert.equal(porTipo(resposta.data.components, 9).length, 0, 'nada de Section');
  });

  test('o botão de link vem logo depois do conteúdo, sem divisória', async () => {
    for (const [nome, campos] of [['evento', EVENTO], ['parceria', PARCERIA], ['aviso', AVISO]]) {
      const { resposta } = await previaPronta(nome, campos);
      assert.equal(porTipo(resposta.data.components, 14).length, 0, `${nome} sem Separator`);
    }

    // Com imagens também, que é o caso em que a divisória incomodava.
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    await responder(envioDeImagens('evento', [anexo('0', 'cartaz.png')], mensagem));
    await esperarPendentes();

    assert.equal(porTipo(api.edicao().corpo.components, 14).length, 0);
  });

  test('evento: no card ficam quando e onde, com rótulo na mesma linha', async () => {
    const { resposta } = await previaPronta();
    const unix = Date.UTC(2026, 9, 15, 22, 0) / 1000;

    assert.equal(porIdDoComponente(resposta.data.components, 10).content, `📅 **Quando:** <t:${unix}:F>`);
    assert.equal(porIdDoComponente(resposta.data.components, 11).content, '📍 **Onde:** Canal de voz Sala 1');
    assert.equal(porIdDoComponente(resposta.data.components, 3).content, 'Conversa aberta sobre transição.');
  });

  test('parceria: descrição fora, desconto e cupom dentro', async () => {
    const { resposta } = await previaPronta('parceria', PARCERIA);
    const caixa = porTipo(resposta.data.components, 17)[0];

    assert.equal(porIdDoComponente(resposta.data.components, 3).content, 'Cursos com desconto para a comunidade.');
    assert.equal(porIdDoComponente(caixa.components, 10).content, '20% até 30/11');
    assert.equal(porIdDoComponente(caixa.components, 11).content, ['🎟️ **Use o código**', '```', 'TECHGIRLS20', '```'].join('\n'));
  });

  test('aviso sem data fica com o container só da autora', async () => {
    const { resposta } = await previaPronta('aviso', AVISO);
    const caixa = porTipo(resposta.data.components, 17)[0];

    assert.equal(porIdDoComponente(resposta.data.components, 3).content, AVISO.texto);
    assert.deepEqual(caixa.components.map((item) => item.id), [7], 'o container continua existindo');
  });

  test('o botão de link tem o rótulo fixo de cada modelo', async () => {
    const rotulos = {};
    for (const [nome, campos] of [['evento', EVENTO], ['parceria', PARCERIA]]) {
      const { resposta } = await previaPronta(nome, campos);
      rotulos[nome] = botoes(resposta.data.components).find((item) => item.style === 5);
    }

    assert.equal(rotulos.evento.label, 'Inscreva-se');
    assert.equal(rotulos.evento.url, EVENTO.link);
    assert.equal(rotulos.parceria.label, 'Garantir desconto');

    const { resposta } = await previaPronta('aviso', AVISO);
    assert.equal(botoes(resposta.data.components).some((item) => item.style === 5), false, 'sem link, sem botão');
  });

  test('traz os dois menus e os quatro botões, com Publicar travado', async () => {
    const { resposta } = await previaPronta();

    assert.deepEqual(
      menu(resposta.data.components, 'mencao', 'evento').options.map((o) => o.value),
      ['ninguem', 'everyone', 'here', 'suporte'],
    );
    assert.deepEqual(
      menu(resposta.data.components, 'reacao', 'evento').options.map((o) => o.label),
      ['Nenhuma', '💜', '🎉', '📚', '👀', '✅'],
    );
    assert.deepEqual(
      botoes(resposta.data.components).filter((item) => item.custom_id).map((item) => item.label),
      ['Editar texto', 'Editar imagens', 'Publicar', 'Cancelar'],
    );
    assert.equal(botoes(resposta.data.components).find((item) => item.label === 'Publicar').disabled, true);
  });

  test('cabe no limite de 40 componentes', async () => {
    const { resposta } = await previaPronta();
    assert.ok(achar(resposta.data.components, () => true).length <= 40);
  });
});

describe('validação', () => {
  test('link sem https vira frase de erro com o botão Corrigir', async () => {
    const resposta = await responder(envioDoModal('evento', { ...EVENTO, link: 'techgirls.dev' }));

    assert.equal(resposta.data.flags, FLAGS_PREVIA);
    assert.match(textos(resposta.data.components)[0], /precisa começar com https/);
    assert.ok(botoes(resposta.data.components).find((item) => item.custom_id === 'anuncio:corrigir:evento'));
    assert.equal(botoes(resposta.data.components).some((item) => item.label === 'Publicar'), false);
  });

  test('Corrigir reabre o formulário com o que já tinha sido digitado', async () => {
    const erro = await responder(envioDoModal('evento', { ...EVENTO, link: 'techgirls.dev' }));
    const resposta = await responder(clique('corrigir', 'evento', mensagemDe(erro)));

    assert.equal(resposta.type, 9);
    const valores = Object.fromEntries(
      resposta.data.components.map((label) => [label.component.custom_id, label.component.value]),
    );
    assert.equal(valores.titulo, EVENTO.titulo);
    assert.equal(valores.onde, EVENTO.onde);
    assert.equal(valores.quando, EVENTO.quando, 'a data volta no formato digitado');
  });

  test('data inexistente também cai no Corrigir', async () => {
    const resposta = await responder(envioDoModal('evento', { ...EVENTO, quando: '31/02/2026 10:00' }));
    assert.match(textos(resposta.data.components)[0], /não existe no calendário/);
  });

  test('campo obrigatório vazio é recusado', async () => {
    const resposta = await responder(envioDoModal('evento', { ...EVENTO, onde: '' }));
    assert.match(textos(resposta.data.components)[0], /Falta preencher onde/);
  });
});

describe('editar texto', () => {
  test('reabre o formulário preenchido', async () => {
    const { mensagem } = await previaPronta();
    const resposta = await responder(clique('editar-texto', 'evento', mensagem));

    const valores = Object.fromEntries(
      resposta.data.components.map((label) => [label.component.custom_id, label.component.value]),
    );
    assert.deepEqual(valores, EVENTO);
  });

  test('salvar edita a mensagem pelo webhook, sem responder type 7', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const resposta = await responder(envioDoModal('evento', { ...EVENTO, onde: 'Auditório' }, { mensagem }));

    assert.equal(resposta.type, 6, 'adia e edita, como manda a regra de V2');
    await esperarPendentes();

    assert.equal(porIdDoComponente(ultimaEdicao().components, 11).content, '📍 **Onde:** Auditório');
  });

  test('não apaga imagens nem desfaz as escolhas dos menus', async () => {
    const api = espionarApi();
    const comImagem = await comMencao('suporte');
    await responder(envioDeImagens('evento', [anexo('0', 'cartaz.png')], comImagem));
    await esperarPendentes();

    const atual = { components: ultimaEdicao().components, attachments: [anexo('55', 'cartaz.png')] };
    await responder(envioDoModal('evento', { ...EVENTO, titulo: 'Outro' }, { mensagem: atual }));
    await esperarPendentes();

    const corpo = ultimaEdicao();
    assert.equal(porTipo(corpo.components, 12)[0].items[0].media.url, 'attachment://cartaz.png');
    assert.deepEqual(corpo.attachments, [{ id: '55', filename: 'cartaz.png' }]);
    assert.equal(menu(corpo.components, 'mencao', 'evento').options.find((o) => o.default).value, 'suporte');
    assert.equal(porIdDoComponente(corpo.components, 2).content, '# Outro');
  });
});

describe('editar imagens', () => {
  test('o botão responde com o modal direto, sem rede e sem adiamento', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();

    const resposta = await responder(clique('editar-imagens', 'evento', mensagem));

    assert.equal(resposta.type, 9, 'MODAL, nunca resposta adiada');
    assert.equal(api.chamadas.length, 0, 'nenhuma chamada de rede antes de responder');
    assert.equal(pendentes.length, 0, 'nada ficou para depois');
  });

  test('o modal tem um campo só, e ele obedece a documentação do File Upload', async () => {
    const { mensagem } = await previaPronta();
    const resposta = await responder(clique('editar-imagens', 'evento', mensagem));
    const formulario = resposta.data;

    assert.equal(formulario.custom_id, 'anuncio:imagens:evento');
    assert.ok(formulario.title.length <= 45, 'título do modal cabe em 45 caracteres');
    assert.equal(formulario.components.length, 1, 'de 1 a 5 componentes de topo');

    const rotulo = formulario.components[0];
    assert.equal(rotulo.type, 18, 'o campo vem dentro de um Label');
    assert.equal(rotulo.description, 'Opcional. Até 4 imagens de até 5 MB. As novas substituem as atuais.');
    assert.ok(rotulo.label.length <= 100);
    assert.ok(rotulo.description.length <= 100);

    const upload = rotulo.component;
    assert.equal(upload.type, 19);
    assert.equal(upload.custom_id, 'imagens');
    assert.ok(upload.custom_id.length >= 1 && upload.custom_id.length <= 100);
    assert.equal(upload.required, false, 'o campo é opcional');
    assert.equal(upload.min_values, 0);
    assert.equal(upload.max_values, 4);
  });

  test('não sobrou nenhum menu de remoção no modal', async () => {
    const { mensagem } = await previaPronta();
    const resposta = await responder(clique('editar-imagens', 'evento', mensagem));

    const tipos = resposta.data.components.map((label) => label.component.type);
    assert.equal(tipos.includes(3), false, 'nada de String Select aqui');
    assert.equal(JSON.stringify(resposta.data).includes('remover'), false);
  });

  test('os ids dos componentes do modal não se repetem', async () => {
    const { mensagem } = await previaPronta();
    const resposta = await responder(clique('editar-imagens', 'evento', mensagem));

    const ids = achar(resposta.data.components, (item) => item.id !== undefined).map((item) => item.id);
    assert.deepEqual(ids, [...new Set(ids)], 'id é único dentro da mensagem');
    assert.equal(ids.includes(0), false, 'id 0 é tratado como vazio pela API');
  });

  test('enviar imagens põe a galeria no card, em multipart, sem mexer no texto', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();

    const resposta = await responder(envioDeImagens('evento', [anexo('0', 'cartaz.png')], mensagem));
    assert.equal(resposta.type, 6);
    await esperarPendentes();

    const edicao = api.edicao();
    assert.equal(edicao.metodo, 'PATCH');
    assert.deepEqual(edicao.arquivos, ['cartaz.png']);
    assert.deepEqual(edicao.corpo.attachments, [{ id: 0, filename: 'cartaz.png' }]);
    assert.equal(porTipo(edicao.corpo.components, 12)[0].items[0].media.url, 'attachment://cartaz.png');
    assert.equal(porIdDoComponente(edicao.corpo.components, 2).content, '# Mentoria de carreira');
  });

  test('as novas substituem as antigas, sem sobrar anexo velho', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    const comAntiga = { ...mensagem, attachments: [anexo('55', 'antiga.png')] };

    await responder(envioDeImagens('evento', [anexo('0', 'nova.png')], comAntiga));
    await esperarPendentes();

    const edicao = api.edicao();
    assert.deepEqual(edicao.corpo.attachments, [{ id: 0, filename: 'nova.png' }]);
    assert.deepEqual(
      porTipo(edicao.corpo.components, 12)[0].items.map((item) => item.media.url),
      ['attachment://nova.png'],
    );
  });

  test('enviar sem arquivo nenhum tira todas as imagens, sem baixar nada', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    await responder(envioDoModal('evento', EVENTO, { mensagem }));
    await esperarPendentes();
    const comGaleria = { components: ultimaEdicao().components, attachments: [anexo('55', 'antiga.png')] };
    porTipo(comGaleria.components, 17)[0].components.push({
      type: 12, id: 5, items: [{ media: { url: 'attachment://antiga.png' } }],
    });

    const resposta = await responder(envioDeImagens('evento', [], comGaleria));
    assert.equal(resposta.type, 6);
    await esperarPendentes();

    const corpo = ultimaEdicao();
    assert.deepEqual(corpo.attachments, []);
    assert.equal(porTipo(corpo.components, 12).length, 0, 'galeria some');
    assert.equal(porIdDoComponente(corpo.components, 2).content, '# Mentoria de carreira');
    assert.equal(api.downloads().length, 0, 'não tem o que baixar');
  });

  test('sem imagens antes e sem imagens agora, avisa que nada mudou', async () => {
    const { mensagem } = await previaPronta();
    const resposta = await responder(envioDeImagens('evento', [], mensagem));

    assert.match(resposta.data.content, /Nada mudou nas imagens/);
  });

  test('passar de quatro imagens é recusado', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    const cinco = [0, 1, 2, 3, 4].map((n) => anexo(String(n), `f${n}.png`));

    const resposta = await responder(envioDeImagens('evento', cinco, mensagem));
    assert.match(resposta.data.content, /no máximo 4 imagens/);
    assert.equal(api.chamadas.length, 0);
  });
});

describe('menção e reação', () => {
  test('escolher a menção destrava o Publicar e mostra o aviso', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const { resposta, componentes } = await cliqueEEdicao('mencao', 'evento', mensagem, ['everyone']);

    assert.equal(resposta.type, 6, 'adia e edita pelo webhook');
    assert.equal(textos(componentes)[0], 'Atenção: isso vai notificar todas as pessoas do servidor.');
    assert.equal(botoes(componentes).find((item) => item.label === 'Publicar').disabled, false);
    assert.equal(porIdDoComponente(componentes, 1).content, '@everyone');
  });

  test('cargo Suporte entra como menção de cargo acima do container', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const { componentes } = await cliqueEEdicao('mencao', 'evento', mensagem, ['suporte']);

    assert.equal(porIdDoComponente(componentes, 1).content, `<@&${ID_SUPORTE}>`);
  });

  test('Ninguém não põe texto de menção', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const { componentes } = await cliqueEEdicao('mencao', 'evento', mensagem, ['ninguem']);

    assert.equal(porIdDoComponente(componentes, 1), null);
    assert.equal(botoes(componentes).find((item) => item.label === 'Publicar').disabled, false);
  });

  test('a reação não destrava o Publicar sozinha e sobrevive à menção', async () => {
    espionarApi();
    const { mensagem } = await previaPronta();
    const comReacao = await cliqueEEdicao('reacao', 'evento', mensagem, ['festa']);
    assert.equal(botoes(comReacao.componentes).find((item) => item.label === 'Publicar').disabled, true);

    const depois = await cliqueEEdicao('mencao', 'evento', { components: comReacao.componentes }, ['ninguem']);
    assert.equal(menu(depois.componentes, 'reacao', 'evento').options.find((o) => o.default).value, 'festa');
  });
});

describe('publicar', () => {
  test('envia no canal de avisos, em V2, sem os controles', async () => {
    const api = espionarApi();
    const card = await comMencao('ninguem');

    const resposta = await responder(clique('publicar', 'evento', card));
    assert.equal(resposta.type, 6);
    await esperarPendentes();

    const publicacao = api.publicacao();
    assert.equal(publicacao.corpo.flags, 32768);
    assert.equal(publicacao.corpo.content, undefined);
    assert.equal(botoes(publicacao.corpo.components).filter((item) => item.custom_id).length, 0);
    assert.equal(achar(publicacao.corpo.components, (item) => item.type === 3).length, 0, 'sem menus');
  });

  test('@here libera só a menção escolhida e nunca usuárias', async () => {
    const api = espionarApi();
    const card = await comMencao('here');

    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    assert.equal(porIdDoComponente(api.publicacao().corpo.components, 1).content, '@here');
    assert.deepEqual(api.publicacao().corpo.allowed_mentions, { parse: ['everyone'] });
  });

  test('cargo Suporte libera só o cargo', async () => {
    const api = espionarApi();
    const card = await comMencao('suporte');

    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    assert.deepEqual(api.publicacao().corpo.allowed_mentions, { parse: [], roles: [ID_SUPORTE] });
  });

  test('com imagens, baixa dos anexos do clique e envia junto', async () => {
    const api = espionarApi();
    const card = await comMencao('ninguem', 'evento', EVENTO, [anexo('55', 'cartaz.png')]);

    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    assert.equal(api.downloads().length, 1);
    assert.deepEqual(api.publicacao().arquivos, ['cartaz.png']);
    assert.deepEqual(api.publicacao().corpo.attachments, [{ id: 0, filename: 'cartaz.png' }]);
  });

  test('falha no download não publica nada', async () => {
    const api = espionarApi({ statusDoCdn: 403 });
    const card = await comMencao('ninguem', 'evento', EVENTO, [anexo('55', 'cartaz.png')]);

    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    assert.equal(api.publicacao(), undefined);
    assert.equal(api.log(), undefined);
    assert.equal(api.edicao().corpo.components[0].content, 'Não consegui publicar o anúncio, tente de novo em instantes.');
    assert.equal(api.edicao().corpo.content, undefined, 'fecha em V2, sem content');
  });

  test('reage com o emoji escolhido e registra no log', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    const comReacao = await cliqueEEdicao('reacao', 'evento', mensagem, ['roxo']);
    const card = { components: (await cliqueEEdicao('mencao', 'evento', { components: comReacao.componentes }, ['ninguem'])).componentes };

    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    assert.equal(api.reacao().url, 'https://discord.com/api/v10/channels/CA/messages/MSG1/reactions/%F0%9F%92%9C/@me');
    assert.match(api.log().corpo.content, /^Anúncio publicado por <@ADMIN1> · https:\/\/discord\.com\/channels\/G1\/CA\/MSG1 · <t:\d+:f>$/);
    assert.match(api.edicao().corpo.components[0].content, /Anúncio publicado: /);
  });

  test('falha na reação e no log não impede a publicação', async () => {
    const api = espionarApi({ falharEm: '/reactions/' });
    const { mensagem } = await previaPronta();
    const comReacao = await cliqueEEdicao('reacao', 'evento', mensagem, ['confirmado']);
    const card = { components: (await cliqueEEdicao('mencao', 'evento', { components: comReacao.componentes }, ['ninguem'])).componentes };

    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    assert.ok(api.publicacao());
    assert.match(api.edicao().corpo.components[0].content, /Anúncio publicado: /);
  });

  test('sem menção escolhida, não publica', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();

    const resposta = await responder(clique('publicar', 'evento', mensagem));
    assert.match(resposta.data.content, /Escolha no menu/);
    assert.equal(api.chamadas.length, 0);
  });
});

describe('cancelar', () => {
  test('troca o card pela frase e solta os anexos', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();
    const { resposta, corpo } = await cliqueEEdicao('cancelar', 'evento', mensagem);

    assert.equal(resposta.type, 6);
    assert.deepEqual(textos(corpo.components), ['Publicação cancelada.']);
    assert.deepEqual(corpo.attachments, []);
    assert.equal(api.chamadas.filter((c) => c.metodo !== 'PATCH').length, 0, 'cancelar não publica nada');
  });
});

describe('imagens anexadas nas atualizações', () => {
  // O Discord devolve a galeria com a URL do CDN já resolvida, não com
  // attachment://nome. Reproduzir isso é o que faz o teste valer.
  function comoDiscordDevolve(componentes, anexos) {
    const copia = JSON.parse(JSON.stringify(componentes));
    let posicao = 0;

    const percorrer = (lista) => {
      for (const item of lista ?? []) {
        if (item.type === 12) {
          item.items = item.items.map(() => {
            const anexo = anexos[posicao++];
            return { media: { url: anexo.url } };
          });
        }
        if (item.components) percorrer(item.components);
      }
    };
    percorrer(copia);
    return copia;
  }

  // Devolve a pré-visualização já com N imagens anexadas, do jeito que ela
  // chega de volta numa interação.
  async function previaComImagens(quantidade) {
    const anexos = Array.from({ length: quantidade }, (_, i) => anexo(`90${i}`, `cartaz-${i + 1}.png`));
    const { mensagem } = await previaPronta();

    await responder(envioDeImagens('evento', anexos.map((item, i) => anexo(String(i), item.filename)), mensagem));
    await esperarPendentes();

    return {
      anexos,
      mensagem: { components: comoDiscordDevolve(ultimaEdicao().components, anexos), attachments: anexos },
    };
  }

  for (const quantidade of [1, 4]) {
    test(`menu mantém as ${quantidade} imagem(ns) com o nome original`, async () => {
      espionarApi();
      const { anexos, mensagem } = await previaComImagens(quantidade);

      const { corpo } = await cliqueEEdicao('mencao', 'evento', mensagem, ['here']);

      assert.deepEqual(
        corpo.attachments,
        anexos.map((item) => ({ id: item.id, filename: item.filename })),
        'os anexos atuais são mantidos pelo id',
      );
      assert.deepEqual(
        porTipo(corpo.components, 12)[0].items.map((item) => item.media.url),
        anexos.map((item) => `attachment://${item.filename}`),
        'a galeria aponta para o nome original, na mesma ordem',
      );
    });

    test(`editar texto mantém as ${quantidade} imagem(ns) com o nome original`, async () => {
      espionarApi();
      const { anexos, mensagem } = await previaComImagens(quantidade);

      await responder(envioDoModal('evento', { ...EVENTO, titulo: 'Outro título' }, { mensagem }));
      await esperarPendentes();

      const corpo = ultimaEdicao();
      assert.deepEqual(corpo.attachments, anexos.map((item) => ({ id: item.id, filename: item.filename })));
      assert.deepEqual(
        porTipo(corpo.components, 12)[0].items.map((item) => item.media.url),
        anexos.map((item) => `attachment://${item.filename}`),
      );
      assert.equal(porIdDoComponente(corpo.components, 2).content, '# Outro título');
    });
  }

  test('nenhuma referência da galeria sai montada a partir de URL', async () => {
    espionarApi();
    const { mensagem } = await previaComImagens(2);

    const { corpo } = await cliqueEEdicao('reacao', 'evento', mensagem, ['roxo']);
    const referencias = porTipo(corpo.components, 12)[0].items.map((item) => item.media.url);

    for (const referencia of referencias) {
      assert.doesNotMatch(referencia, /cdn\.discordapp\.com|https|ephemeral-attachments/, referencia);
      assert.match(referencia, /^attachment:\/\/[^/]+$/);
    }
  });

  test('publicar leva as imagens pelos nomes originais', async () => {
    const api = espionarApi();
    const { anexos, mensagem } = await previaComImagens(2);
    const card = (await cliqueEEdicao('mencao', 'evento', mensagem, ['ninguem'])).componentes;

    await responder(clique('publicar', 'evento', { components: card, attachments: anexos }));
    await esperarPendentes();

    assert.deepEqual(api.publicacao().arquivos, anexos.map((item) => item.filename));
    assert.deepEqual(
      porTipo(api.publicacao().corpo.components, 12)[0].items.map((item) => item.media.url),
      anexos.map((item) => `attachment://${item.filename}`),
    );
  });
});

describe('token da interação nos logs', () => {
  test('falha de API não escreve o token no console', async () => {
    espionarApi({ falharEm: '@original' });
    const registrado = [];
    const original = console.error;
    console.error = (...args) => registrado.push(args.map((item) => (item?.stack ?? String(item))).join(' '));

    try {
      const { mensagem } = await previaPronta();
      await responder(clique('mencao', 'evento', mensagem, ['here']));
      await esperarPendentes();
    } finally {
      console.error = original;
    }

    const tudo = registrado.join('\n');
    assert.ok(tudo.length > 0, 'algo foi registrado');
    assert.doesNotMatch(tudo, /\/webhooks\/APP\/tok\b/, 'o token não pode aparecer');
    assert.match(tudo, /\/webhooks\/APP\/\*\*\*/, 'o caminho aparece com o token escondido');
  });

  test('o token some de qualquer caminho de webhook', async () => {
    const { esconderToken } = await import('../src/discord-api.js');

    assert.equal(esconderToken('/webhooks/APP/segredo/messages/@original'), '/webhooks/APP/***/messages/@original');
    assert.equal(esconderToken('/webhooks/APP/segredo'), '/webhooks/APP/***');
    assert.equal(esconderToken('/channels/CA/messages'), '/channels/CA/messages', 'rota de canal não muda');
  });
});

describe('regras de Components V2 em toda resposta', () => {
  // Uma mensagem V2 não pode levar content nem embeds, e Text Display vazio
  // é recusado. Como a recusa acontece no Discord, sem erro do nosso lado,
  // a checagem tem que ser aqui.
  function conferirV2(payload, onde) {
    assert.equal(payload.content, undefined, `${onde}: mensagem V2 não leva content`);
    assert.equal(payload.embeds, undefined, `${onde}: mensagem V2 não leva embeds`);

    const vazios = achar(payload.components, (item) => item.type === 10 && !String(item.content ?? '').trim());
    assert.deepEqual(vazios, [], `${onde}: Text Display sem texto`);

    const ids = achar(payload.components, (item) => item.type === 10).map((item) => item.id);
    assert.equal(ids.includes(undefined), false, `${onde}: todo texto tem id`);
    assert.deepEqual(ids, [...new Set(ids)], `${onde}: ids repetidos`);
  }

  // Passa por todo o fluxo e devolve cada payload V2 que sai daqui, de resposta
  // de interação ou de edição pelo webhook.
  async function todasAsRespostas() {
    const api = espionarApi();
    const saidas = [];
    const guardar = (onde, payload) => saidas.push({ onde, payload });

    for (const [nome, campos] of [['evento', EVENTO], ['parceria', PARCERIA], ['aviso', AVISO]]) {
      const primeira = await responder(envioDoModal(nome, campos));
      guardar(`primeira pré-visualização (${nome})`, primeira.data);

      const mensagem = mensagemDe(primeira);

      // Menus: adiam e editam pelo webhook.
      await responder(clique('mencao', nome, mensagem, ['everyone']));
      await responder(clique('mencao', nome, mensagem, ['ninguem']));
      await responder(clique('mencao', nome, mensagem, ['suporte']));
      await responder(clique('reacao', nome, mensagem, ['roxo']));
      await esperarPendentes();

      // Salvar a edição do texto.
      await responder(envioDoModal(nome, campos, { mensagem }));
      await esperarPendentes();

      // Cancelar.
      await responder(clique('cancelar', nome, mensagem));
      await esperarPendentes();
    }

    // Erro de validação e o Corrigir.
    const erro = await responder(envioDoModal('evento', { ...EVENTO, link: 'techgirls.dev' }));
    guardar('card de erro', erro.data);

    const semCampo = await responder(envioDoModal('evento', { ...EVENTO, onde: '' }));
    guardar('erro de campo obrigatório', semCampo.data);

    // Imagens: com arquivo e sem arquivo.
    const { mensagem } = await previaPronta();
    await responder(envioDeImagens('evento', [anexo('0', 'cartaz.png')], mensagem));
    await esperarPendentes();

    await responder(envioDoModal('evento', EVENTO, { mensagem }));
    await esperarPendentes();
    const comGaleria = { components: ultimaEdicao().components, attachments: [] };
    porTipo(comGaleria.components, 17)[0].components.push({
      type: 12, id: 5, items: [{ media: { url: 'attachment://cartaz.png' } }],
    });
    await responder(envioDeImagens('evento', [], comGaleria));
    await esperarPendentes();

    // Publicar: a mensagem publicada e a confirmação.
    const card = await comMencao('here');
    await responder(clique('publicar', 'evento', card));
    await esperarPendentes();

    for (const chamada of api.chamadas) {
      if (!chamada.corpo?.components) continue;
      guardar(`${chamada.metodo} ${chamada.url.replace('https://discord.com/api/v10', '')}`, chamada.corpo);
    }
    return saidas;
  }

  test('nenhuma resposta ou edição leva content, embeds ou texto vazio', async () => {
    const saidas = await todasAsRespostas();

    assert.ok(saidas.length >= 10, `varreu poucas respostas: ${saidas.length}`);
    for (const { onde, payload } of saidas) conferirV2(payload, onde);
  });

  test('toda atualização da pré-visualização vai com a flag de V2', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();

    await responder(clique('mencao', 'evento', mensagem, ['here']));
    await esperarPendentes();

    const edicao = api.edicao();
    assert.equal(edicao.corpo.flags, FLAGS_PREVIA, 'sem a flag, o Discord recusa a edição');
    assert.equal(edicao.url.endsWith('/webhooks/APP/tok/messages/@original'), true);
  });

  test('menus e botões adiam e editam pelo webhook, nunca respondem type 7', async () => {
    const api = espionarApi();
    const { mensagem } = await previaPronta();

    for (const acao of ['mencao', 'reacao', 'cancelar']) {
      const values = acao === 'cancelar' ? undefined : ['roxo'];
      const resposta = await responder(clique(acao, 'evento', mensagem, values));

      assert.equal(resposta.type, 6, `${acao}: resposta adiada`);
      assert.equal(resposta.data, undefined, `${acao}: adiamento não leva corpo`);
    }
    await esperarPendentes();

    assert.equal(api.chamadas.filter((c) => c.metodo === 'PATCH').length, 3);
  });

  test('se a edição falhar, o motivo vai inteiro para o console e a admin vê uma frase', async () => {
    const api = espionarApi({ falharEm: '@original' });
    const erros = [];
    const originalConsole = console.error;
    console.error = (...args) => erros.push(args.map(String).join(' '));

    try {
      const { mensagem } = await previaPronta();
      await responder(clique('mencao', 'evento', mensagem, ['here']));
      await esperarPendentes();
    } finally {
      console.error = originalConsole;
    }

    assert.match(erros.join('\n'), /Missing Access/, 'o corpo do erro aparece no console');
    assert.equal(api.chamadas.filter((c) => c.metodo === 'PATCH').length >= 2, true, 'tentou avisar a admin');
  });
});

describe('roteamento', () => {
  test('PING responde PONG', async () => {
    assert.deepEqual(await responder({ type: 1 }), { type: 1 });
  });

  test('modelo desconhecido no custom_id não quebra', async () => {
    const resposta = await responder(clique('publicar', 'sorteio', { components: [] }));
    assert.match(resposta.data.content, /versão antiga/);
  });
});
