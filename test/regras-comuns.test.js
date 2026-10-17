// Regras que valem para o /vaga e o /anuncio juntos: canal permitido, limites de
// caracteres e formulário novo sempre em branco. Runner nativo do Node: `npm test`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';

import { montarCartao as cartaoDoAnuncio, montarModalTexto, textoDaPrevia as apoioDoAnuncio } from '../src/componentes/anuncio-componentes.js';
import { campoDeTexto } from '../src/componentes/comum.js';
import {
  MAXIMOS,
  montarCartao as cartaoDaVaga,
  montarModal,
  textoDaPrevia as apoioDaVaga,
  textoSimples,
} from '../src/componentes/vaga-componentes.js';
import { CANAIS_PERMITIDOS, FUNCOES_POR_AREA, TAGS_AREA, TAGS_MODALIDADE, TAGS_SENIORIDADE } from '../src/config.js';
import { rotear } from '../src/index.js';
import { MODELOS } from '../src/modelos.js';

const env = {
  GUILD_ID: 'G1',
  CANAL_VAGAS_ID: 'CV',
  CANAL_ANUNCIOS_ID: 'CA',
  CANAL_LOG_ID: 'CL',
  DISCORD_TOKEN: 'token-de-teste',
};

const pendentes = [];
const ctx = { waitUntil: (promessa) => pendentes.push(promessa) };
const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  pendentes.length = 0;
});

// Nada de rede nestes testes: qualquer chamada devolve um corpo genérico.
const semRede = () => {
  globalThis.fetch = async () => new Response('{"id":"MSG1"}', { status: 200 });
};

const MEMBRO = { user: { id: 'ADMIN1', username: 'samara' } };

const comando = (nome, subcomando, { canal = 'CL', id = 'INTER1' } = {}) => ({
  type: 2, id, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
  channel: { id: canal, type: 0 }, channel_id: canal,
  data: { name: nome, options: [{ name: subcomando, type: 1 }] },
});

const responder = async (interacao, ambiente = env) => JSON.parse(await (await rotear(interacao, ambiente, ctx)).text());

// Cala o console.error e devolve o que foi escrito nele.
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

describe('canal permitido', () => {
  const COMANDOS = [['vaga', 'nova'], ['anuncio', 'evento'], ['anuncio', 'parceria'], ['anuncio', 'aviso']];

  for (const [nome, subcomando] of COMANDOS) {
    test(`/${nome} ${subcomando} no canal de log abre o formulário`, async () => {
      const resposta = await responder(comando(nome, subcomando));
      assert.equal(resposta.type, 9);
    });

    test(`/${nome} ${subcomando} em outro canal responde efêmero dizendo onde usar`, async () => {
      const { resultado: resposta, registrado } = await comConsole(() => responder(comando(nome, subcomando, { canal: 'OUTRO' })));

      assert.equal(resposta.type, 4, 'não abre formulário');
      assert.equal(resposta.data.flags, 64, 'efêmera');
      assert.equal(resposta.data.content, 'Use este comando em <#CL>.');
      assert.deepEqual(resposta.data.allowed_mentions, { parse: [] });
      assert.match(registrado, /\[canais\] .* usado no canal OUTRO; permitidos: CL/);
    });
  }

  test('o /vaga encerrar segue a regra dele, mesmo no canal de log', async () => {
    const { resultado: resposta } = await comConsole(() => responder(comando('vaga', 'encerrar')));
    assert.match(resposta.data.content, /dentro do post da vaga/);
  });

  test('sem a var do canal no ambiente, o comando não roda em lugar nenhum', async () => {
    const { CANAL_LOG_ID, ...semLog } = env;
    const { resultado: resposta } = await comConsole(() => responder(comando('vaga', 'nova'), semLog));

    assert.equal(resposta.type, 4);
    assert.match(resposta.data.content, /ainda não tem canal liberado/);
  });

  test('a lista do config usa nomes de vars que existem no wrangler.toml', () => {
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    const nomes = Object.values(CANAIS_PERMITIDOS).flat();

    assert.deepEqual(CANAIS_PERMITIDOS, { 'vaga nova': ['CANAL_LOG_ID'], anuncio: ['CANAL_LOG_ID'] });
    for (const nome of nomes) assert.match(toml, new RegExp(`^${nome}\\s*=`, 'm'), `${nome} no [vars]`);
  });
});

describe('limites dos formulários', () => {
  // Todo formulário que o bot abre, em branco.
  const FORMULARIOS = [
    ['vaga', montarModal()],
    ...Object.values(MODELOS).map((modelo) => [`anuncio ${modelo.valor}`, montarModalTexto(modelo)]),
  ];

  const camposDeTexto = (formulario) => formulario.components.filter((label) => label.component.type === 4);

  for (const [nome, formulario] of FORMULARIOS) {
    test(`${nome}: todo campo de texto tem max_length e avisa o limite na descrição`, () => {
      assert.ok(formulario.title.length <= 45, 'título do modal');
      for (const label of camposDeTexto(formulario)) {
        const { max_length: maximo, custom_id: id, placeholder } = label.component;
        const milhar = String(maximo).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        assert.ok(Number.isInteger(maximo) && maximo >= 1 && maximo <= 4000, `${id}: max_length dentro da doc`);
        assert.ok(label.description.endsWith(`Até ${milhar} caracteres.`), `${id}: ${label.description}`);
        assert.ok(label.description.length <= 100, `${id}: descrição do Label passa de 100`);
        assert.ok(label.label.length <= 45, `${id}: rótulo do Label passa de 45`);
        assert.ok(!placeholder || placeholder.length <= 100, `${id}: placeholder passa de 100`);
      }
    });
  }

  test('o texto que já existia na descrição continua, com o limite no fim', () => {
    const evento = montarModalTexto(MODELOS.evento);
    const quando = evento.components.find((label) => label.component.custom_id === 'quando');
    const descricao = evento.components.find((label) => label.component.custom_id === 'oque');

    assert.equal(quando.description, 'Formato DD/MM/AAAA HH:MM. A hora é lida como horário de Brasília. Até 16 caracteres.');
    assert.equal(descricao.description, 'Até 1.500 caracteres.', 'número com ponto de milhar');
  });

  test('o título da vaga cabe no nome do post, e os links cabem no botão', () => {
    assert.ok(MAXIMOS.titulo <= 100, 'nome do post no fórum: 1 a 100');
    assert.ok(MAXIMOS.link <= 512, 'url do botão: até 512');
    for (const modelo of Object.values(MODELOS)) {
      const link = modelo.campos.find((campo) => campo.papel === 'link');
      assert.ok(link.maximo <= 512, `${modelo.valor}: url do botão`);
    }
  });

  test('valor pré-preenchido nunca passa do máximo do campo', () => {
    const campo = campoDeTexto({ rotulo: 'X', id: 'x', estilo: 1, obrigatorio: true, maximo: 10, valor: 'a'.repeat(25) });
    assert.equal(campo.component.value, 'a'.repeat(10));
  });
});

describe('pior caso na publicação', () => {
  const maior = (lista) => lista.reduce((a, b) => (b.rotulo.length > a.rotulo.length ? b : a));
  const cheio = (tamanho) => 'a'.repeat(tamanho);
  const ID = '1'.repeat(19);

  // Soma de todos os Text Display, que é o que as fontes da comunidade limitam a 4000.
  const textosDe = (componentes, achados = []) => {
    for (const item of componentes ?? []) {
      if (item.type === 10) achados.push(item.content);
      if (item.components) textosDe(item.components, achados);
    }
    return achados;
  };

  function conferirV2(componentes, onde) {
    const todos = textosDe(componentes);
    const total = todos.reduce((soma, conteudo) => soma + conteudo.length, 0);
    assert.ok(total <= 4000, `${onde}: ${total} caracteres no total`);
    for (const conteudo of todos) assert.ok(conteudo.length <= 2000, `${onde}: um texto com ${conteudo.length}`);
  }

  // Área com o maior nome que também tenha a função de maior nome dela.
  const area = TAGS_AREA.reduce((a, b) => {
    const tamanho = (item) => item.rotulo.length + maior(FUNCOES_POR_AREA[item.valor]).rotulo.length;
    return tamanho(b) > tamanho(a) ? b : a;
  });
  const escolhas = {
    area: area.valor,
    funcao: maior(FUNCOES_POR_AREA[area.valor]).valor,
    senioridade: maior(TAGS_SENIORIDADE).valor,
    modalidade: maior(TAGS_MODALIDADE).valor,
  };
  const valoresDaVaga = {
    titulo: cheio(MAXIMOS.titulo),
    empresa: cheio(MAXIMOS.empresa),
    link: `https://${cheio(MAXIMOS.link - 'https://'.length - 4)}.com`,
    local: cheio(MAXIMOS.local),
    descricao: cheio(MAXIMOS.descricao),
  };
  const cargos = [{ rotulo: 'a', id: ID }, { rotulo: 'b', id: ID }];

  test('vaga: o texto simples da criação cabe nos 2000 do content', () => {
    const conteudo = textoSimples({ valores: valoresDaVaga, escolhas, cargos });
    // length conta unidades UTF-16, que é sempre maior ou igual à contagem de caracteres.
    assert.ok(conteudo.length <= 2000, `${conteudo.length} caracteres`);
  });

  test('vaga: card publicado e pré-visualização cabem numa mensagem V2', () => {
    const autora = { id: ID };
    conferirV2(cartaoDaVaga({ valores: valoresDaVaga, escolhas, autora, cargos, controles: false }), 'card');
    conferirV2(
      [{ type: 10, content: apoioDaVaga(escolhas, valoresDaVaga) }, ...cartaoDaVaga({ valores: valoresDaVaga, escolhas, autora })],
      'pré-visualização',
    );
  });

  for (const modelo of Object.values(MODELOS)) {
    test(`anuncio ${modelo.valor}: card e pré-visualização cabem numa mensagem V2`, () => {
      const valores = {};
      for (const campo of modelo.campos) {
        if (campo.papel === 'data') valores[campo.id] = '4102444800'; // vira <t:...:F>
        else if (campo.papel === 'link') valores[campo.id] = `https://${cheio(campo.maximo - 12)}.com`;
        else valores[campo.id] = cheio(campo.maximo);
      }
      const estado = { modelo, valores, autora: { id: ID }, escolha: 'suporte', imagens: [] };

      conferirV2(cartaoDoAnuncio({ ...estado, controles: false }), 'card');
      conferirV2([{ type: 10, content: apoioDoAnuncio('everyone', { emBranco: true }) }, ...cartaoDoAnuncio(estado)], 'pré-visualização');
    });
  }
});

describe('formulário novo vem em branco', () => {
  const valoresDe = (modal) => modal.components.map((label) => label.component.value).filter(Boolean);

  test('o /vaga nova não traz nada de uma vaga anterior', async () => {
    semRede();
    // Uma vaga inteira antes, passando pelo Corrigir, que é quem abre formulário preenchido.
    const envio = {
      type: 5, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
      data: {
        custom_id: 'vaga:nova:INTER1',
        components: [['titulo', 'Dev'], ['empresa', 'Acme'], ['link', 'errado']]
          .map(([id, value]) => ({ type: 18, component: { type: 4, custom_id: id, value } })),
      },
    };
    await comConsole(async () => {
      await responder(envio);
      await Promise.all(pendentes.splice(0));
    });

    const novo = await responder(comando('vaga', 'nova', { id: 'INTER2' }));
    assert.equal(novo.type, 9);
    assert.deepEqual(valoresDe(novo.data), [], 'nenhum campo pré-preenchido');
  });

  test('o /anuncio não traz nada de um anúncio anterior', async () => {
    for (const nome of Object.keys(MODELOS)) {
      const novo = await responder(comando('anuncio', nome, { id: `INTER-${nome}` }));
      assert.deepEqual(valoresDe(novo.data), [], `${nome}: nenhum campo pré-preenchido`);
    }
  });

  test('cada formulário aberto tem um custom_id próprio, com o id da interação', async () => {
    const primeiro = await responder(comando('vaga', 'nova', { id: '111' }));
    const segundo = await responder(comando('vaga', 'nova', { id: '222' }));
    assert.equal(primeiro.data.custom_id, 'vaga:nova:111');
    assert.equal(segundo.data.custom_id, 'vaga:nova:222');

    const anuncio = await responder(comando('anuncio', 'evento', { id: '333' }));
    assert.equal(anuncio.data.custom_id, 'anuncio:texto:evento:333');
    assert.ok(anuncio.data.custom_id.length <= 100, 'custom_id tem até 100 caracteres');
  });

  test('o envio de um formulário com custom_id único chega ao fluxo certo', async () => {
    semRede();
    const envio = (customId, campos) => ({
      type: 5, application_id: 'APP', token: 'tok', guild_id: 'G1', member: MEMBRO,
      data: {
        custom_id: customId,
        components: Object.entries(campos).map(([id, value]) => ({ type: 18, component: { type: 4, custom_id: id, value } })),
      },
    });

    const vaga = await responder(envio('vaga:nova:111', { titulo: 'Dev', empresa: 'Acme', link: 'https://acme.com' }));
    assert.equal(vaga.type, 5, 'vaga: adia e cria a pré-visualização');

    const anuncio = await responder(envio('anuncio:texto:aviso:333', { titulo: 'Oi', texto: 'Texto' }));
    assert.equal(anuncio.type, 4, 'anúncio: cria a pré-visualização');
    assert.ok(anuncio.data.components.some((item) => item.type === 17), 'com o card');
    await Promise.all(pendentes.splice(0));
  });
});
