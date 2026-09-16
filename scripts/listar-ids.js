// Lista os IDs do servidor que o config.js precisa: tags do fórum de vagas e cargos.
// Roda no Node, fora do Worker. Lê o DISCORD_TOKEN do .dev.vars e os IDs do wrangler.toml.
//
//   npm run ids
//
// Só faz leitura na API do Discord. Nada é alterado no servidor.

import { readFileSync } from 'node:fs';

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/tech-girls/bot-tech-girls, 0.1.0)';

// Nomes esperados, na ordem da seção 9.2 do CLAUDE.md.
const TAGS_ESPERADAS = {
  Senioridade: ['Estágio', 'Trainee', 'Júnior', 'Pleno', 'Sênior', 'Especialista', 'Liderança'],
  Modalidade: ['Remoto', 'Híbrido', 'Presencial'],
  Área: ['Desenvolvimento', 'Dados', 'Design e UX', 'QA', 'Infra e Cloud', 'Produto e Gestão'],
  Status: ['Encerrada'],
};

// Cargos da seção 9.3. O emoji fica fora da comparação: só o nome importa.
const CARGOS_ESPERADOS = [
  'Quero entrar', 'Em transição', 'Estágio', 'Trainee', 'Júnior',
  'Pleno', 'Sênior', 'Especialista', 'Liderança',
];

// Compara nomes ignorando acento, caixa, emoji e espaço sobrando.
function normalizar(nome) {
  return String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

// Lê pares CHAVE=VALOR de um arquivo, ignorando comentários e linhas vazias.
function lerPares(caminho, regex) {
  let conteudo;
  try {
    conteudo = readFileSync(new URL(caminho, import.meta.url), 'utf8');
  } catch {
    return {};
  }
  const pares = {};
  for (const linha of conteudo.split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    const achado = linha.match(regex);
    if (achado) pares[achado[1]] = achado[2].trim().replace(/^["']|["']$/g, '');
  }
  return pares;
}

function carregarAmbiente() {
  const dev = lerPares('../.dev.vars', /^\s*([A-Z_]+)\s*=\s*(.*)$/);
  const toml = lerPares('../wrangler.toml', /^\s*([A-Z_]+)\s*=\s*(.*)$/);
  return { ...toml, ...dev, ...process.env };
}

async function buscar(caminho, token) {
  const resposta = await fetch(API + caminho, {
    headers: { authorization: `Bot ${token}`, 'user-agent': USER_AGENT },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`GET ${caminho} devolveu ${resposta.status}. Resposta: ${corpo.slice(0, 300)}`);
  }
  return resposta.json();
}

// Mostra o que foi encontrado e o que está faltando em relação ao CLAUDE.md.
function conferir(rotulo, esperados, encontrados) {
  const porNome = new Map(encontrados.map((item) => [normalizar(item.name), item]));
  const faltando = [];
  const linhas = [];

  for (const esperado of esperados) {
    const achado = porNome.get(normalizar(esperado));
    if (achado) {
      linhas.push(`  ${achado.id}  ${esperado}`);
      porNome.delete(normalizar(esperado));
    } else {
      faltando.push(esperado);
    }
  }

  console.log(`\n${rotulo}`);
  console.log(linhas.join('\n') || '  (nenhum encontrado)');

  if (faltando.length) {
    console.log(`  ⚠ esperado pelo CLAUDE.md e não encontrado: ${faltando.join(', ')}`);
  }
  const sobrando = [...porNome.values()];
  if (sobrando.length) {
    console.log(`  ⚠ existe no servidor e não está no CLAUDE.md: ${sobrando.map((i) => `${i.name} (${i.id})`).join(', ')}`);
  }
  return { faltando, sobrando };
}

async function principal() {
  const ambiente = carregarAmbiente();
  const token = ambiente.DISCORD_TOKEN;

  if (!token) {
    console.error('Falta DISCORD_TOKEN. Copie o .dev.vars.example para .dev.vars e preencha o token.');
    process.exit(1);
  }
  for (const nome of ['GUILD_ID', 'CANAL_VAGAS_ID', 'CANAL_ANUNCIOS_ID', 'CANAL_LOG_ID']) {
    if (!ambiente[nome]) {
      console.error(`Falta ${nome} no wrangler.toml.`);
      process.exit(1);
    }
  }

  // 1. Canais: confere se os IDs configurados apontam mesmo para os canais certos.
  const canais = await buscar(`/guilds/${ambiente.GUILD_ID}/channels`, token);
  const porId = new Map(canais.map((canal) => [canal.id, canal]));

  console.log('\nCANAIS CONFIGURADOS');
  for (const nome of ['CANAL_VAGAS_ID', 'CANAL_ANUNCIOS_ID', 'CANAL_LOG_ID']) {
    const canal = porId.get(ambiente[nome]);
    console.log(canal
      ? `  ${nome.padEnd(18)} ${canal.id}  #${canal.name}  (type ${canal.type})`
      : `  ${nome.padEnd(18)} ${ambiente[nome]}  ⚠ não encontrado neste servidor`);
  }
  // Fórum é o type 15 (GUILD_FORUM).
  const forum = porId.get(ambiente.CANAL_VAGAS_ID);
  if (forum && forum.type !== 15) {
    console.log(`  ⚠ CANAL_VAGAS_ID não é um fórum (type ${forum.type}), então não tem tags.`);
  }

  // 2. Tags do fórum de vagas.
  const canalVagas = await buscar(`/channels/${ambiente.CANAL_VAGAS_ID}`, token);
  const tags = canalVagas.available_tags ?? [];
  console.log(`\nTAGS DO FÓRUM (${tags.length} de 20 possíveis)`);
  for (const [grupo, esperadas] of Object.entries(TAGS_ESPERADAS)) {
    conferir(`Tags: ${grupo}`, esperadas, tags);
  }

  // 3. Cargos. O bot só consegue mencionar cargo marcado como mencionável.
  const guilda = await buscar(`/guilds/${ambiente.GUILD_ID}`, token);
  const cargos = guilda.roles ?? [];
  conferir('CARGOS DE MOMENTO DE CARREIRA', CARGOS_ESPERADOS, cargos);

  const naoMencionaveis = cargos.filter(
    (cargo) => CARGOS_ESPERADOS.some((nome) => normalizar(nome) === normalizar(cargo.name)) && !cargo.mentionable,
  );
  if (naoMencionaveis.length) {
    console.log(`  ⚠ não estão mencionáveis: ${naoMencionaveis.map((c) => c.name).join(', ')}`);
    console.log('    Ajuste em Configurações do servidor > Cargos > "Permitir que qualquer pessoa mencione este cargo".');
  }

  console.log('\nPronto. Cole a saída acima no chat ou preencha os IDs em src/config.js.');
}

principal().catch((erro) => {
  console.error('\nDeu errado:', erro.message);
  process.exit(1);
});
