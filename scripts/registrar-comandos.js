// Registra os slash commands no servidor da Tech Girls.
// Guild commands (não globais): aparecem na hora, sem esperar propagação.
//
//   npm run comandos          registra de verdade
//   npm run comandos -- --ver só mostra o payload, sem chamar a API
//
// Atenção: o PUT é uma sobrescrita em bloco. Ele substitui TODOS os comandos
// deste app neste servidor, então esta lista precisa estar sempre completa.

import { carregarAmbiente, chamarApi, exigir } from './comum.js';

// Tipos da API, para o código não ficar cheio de número solto.
const CHAT_INPUT = 1;
const SUBCOMANDO = 1;

// default_member_permissions: "0" esconde o comando de todo mundo, menos de quem
// tem permissão de administrador. As admins podem liberar cargos específicos depois,
// em Configurações do servidor > Integrações > Manage (seção 8 do CLAUDE.md).
const SO_ADMIN = '0';

const COMANDOS = [
  {
    name: 'vaga',
    description: 'Publicar ou encerrar uma vaga no fórum',
    type: CHAT_INPUT,
    default_member_permissions: SO_ADMIN,
    options: [
      {
        type: SUBCOMANDO,
        name: 'nova',
        description: 'Abrir o formulário para publicar uma vaga nova',
      },
      {
        type: SUBCOMANDO,
        name: 'encerrar',
        description: 'Encerrar a vaga deste post: aplica a tag, tranca e arquiva',
      },
    ],
  },
  {
    name: 'anuncio',
    description: 'Publicar um anúncio no canal de avisos',
    type: CHAT_INPUT,
    default_member_permissions: SO_ADMIN,
  },
];

// Confere os limites da API antes de enviar: erro daqui é mais claro que um 400.
function validar(comandos) {
  const nomeValido = /^[-_\p{Ll}\p{Lm}\p{Lo}\p{N}]{1,32}$/u;
  const problemas = [];

  const conferirNome = (item, onde) => {
    if (!nomeValido.test(item.name)) {
      problemas.push(`${onde}: nome "${item.name}" fora do formato aceito (minúsculas, sem espaço, até 32 caracteres).`);
    }
    if (!item.description || item.description.length > 100) {
      problemas.push(`${onde}: descrição precisa ter de 1 a 100 caracteres.`);
    }
  };

  for (const comando of comandos) {
    conferirNome(comando, `/${comando.name}`);
    for (const opcao of comando.options ?? []) {
      conferirNome(opcao, `/${comando.name} ${opcao.name}`);
    }
  }

  if (problemas.length) {
    console.error('Payload inválido:');
    for (const problema of problemas) console.error(`  ${problema}`);
    process.exit(1);
  }
}

function descrever(comando) {
  const subcomandos = (comando.options ?? [])
    .filter((opcao) => opcao.type === SUBCOMANDO)
    .map((opcao) => opcao.name);
  const sufixo = subcomandos.length ? ` (${subcomandos.join(', ')})` : '';
  return `/${comando.name}${sufixo}`;
}

async function principal() {
  const ambiente = carregarAmbiente();
  const soVer = process.argv.includes('--ver');

  validar(COMANDOS);

  if (soVer) {
    console.log(JSON.stringify(COMANDOS, null, 2));
    console.log(`\nNada foi enviado. São ${COMANDOS.length} comandos: ${COMANDOS.map(descrever).join(', ')}`);
    return;
  }

  exigir(ambiente, ['DISCORD_TOKEN', 'DISCORD_APPLICATION_ID', 'GUILD_ID']);

  const caminho = `/applications/${ambiente.DISCORD_APPLICATION_ID}/guilds/${ambiente.GUILD_ID}/commands`;
  const registrados = await chamarApi('PUT', caminho, { token: ambiente.DISCORD_TOKEN, corpo: COMANDOS });

  console.log(`\nRegistrados no servidor ${ambiente.GUILD_ID}:`);
  for (const comando of registrados) {
    console.log(`  ${comando.id}  ${descrever(comando)}  default_member_permissions=${comando.default_member_permissions}`);
  }
  console.log('\nOs comandos aparecem só para quem tem permissão de administrador.');
  console.log('Para liberar outros cargos: Configurações do servidor > Integrações > Tech Girls > Manage.');
}

principal().catch((erro) => {
  console.error('\nDeu errado:', erro.message);
  process.exit(1);
});
