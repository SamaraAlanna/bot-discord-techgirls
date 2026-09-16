// Lista os IDs do servidor que o config.js precisa: tags do fórum de vagas e cargos.
// Roda no Node, fora do Worker. Lê o DISCORD_TOKEN do .dev.vars e os IDs do wrangler.toml.
//
//   npm run ids
//
// Só faz leitura na API do Discord. Nada é alterado no servidor.

import { carregarAmbiente, chamarApi, exigir } from './comum.js';

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

// Indexa por nome normalizado e guarda os nomes repetidos, que deixariam a escolha ambígua.
function indexar(itens) {
  const indice = new Map();
  const repetidos = [];
  for (const item of itens) {
    const chave = normalizar(item.name);
    if (indice.has(chave)) repetidos.push(item);
    else indice.set(chave, item);
  }
  return { indice, repetidos };
}

// Mostra o que foi encontrado em um grupo e o que falta. Marca em `usados` o que casou,
// para no fim sabermos o que sobrou, sem acusar os outros grupos de sobra.
function conferirGrupo(rotulo, esperados, indice, usados) {
  const faltando = [];
  const linhas = [];

  for (const esperado of esperados) {
    const achado = indice.get(normalizar(esperado));
    if (!achado) {
      faltando.push(esperado);
      continue;
    }
    const diferente = achado.name !== esperado ? `  (no servidor: ${achado.name})` : '';
    linhas.push(`  ${achado.id}  ${esperado}${diferente}`);
    usados.add(achado.id);
  }

  console.log(`\n${rotulo}`);
  console.log(linhas.join('\n') || '  (nenhum encontrado)');
  if (faltando.length) {
    console.log(`  ⚠ esperado pelo CLAUDE.md e não encontrado: ${faltando.join(', ')}`);
  }
  return faltando;
}

async function principal() {
  const ambiente = carregarAmbiente();
  exigir(ambiente, ['DISCORD_TOKEN', 'GUILD_ID', 'CANAL_VAGAS_ID', 'CANAL_ANUNCIOS_ID', 'CANAL_LOG_ID']);
  const token = ambiente.DISCORD_TOKEN;

  // 1. Canais: confere se os IDs configurados apontam mesmo para os canais certos.
  const canais = await chamarApi('GET', `/guilds/${ambiente.GUILD_ID}/channels`, { token });
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
  const canalVagas = await chamarApi('GET', `/channels/${ambiente.CANAL_VAGAS_ID}`, { token });
  const tags = canalVagas.available_tags ?? [];
  const { indice: indiceTags, repetidos: tagsRepetidas } = indexar(tags);
  const tagsUsadas = new Set();

  console.log(`\nTAGS DO FÓRUM (${tags.length} de 20 possíveis)`);
  for (const [grupo, esperadas] of Object.entries(TAGS_ESPERADAS)) {
    conferirGrupo(`Tags: ${grupo}`, esperadas, indiceTags, tagsUsadas);
  }

  const tagsSobrando = tags.filter((tag) => !tagsUsadas.has(tag.id));
  if (tagsSobrando.length) {
    console.log(`\n  ⚠ tags do fórum fora do CLAUDE.md: ${tagsSobrando.map((t) => `${t.name} (${t.id})`).join(', ')}`);
  }
  if (tagsRepetidas.length) {
    console.log(`  ⚠ tags com nome repetido: ${tagsRepetidas.map((t) => `${t.name} (${t.id})`).join(', ')}`);
  }

  // 3. Cargos. Aqui não listamos o que sobra: o servidor tem dezenas de cargos legítimos
  // fora da seção 9.3. Interessa o que falta, o que é ambíguo e o que não é mencionável.
  const guilda = await chamarApi('GET', `/guilds/${ambiente.GUILD_ID}`, { token });
  const cargos = guilda.roles ?? [];
  const { indice: indiceCargos, repetidos: cargosRepetidos } = indexar(cargos);
  conferirGrupo('CARGOS DE MOMENTO DE CARREIRA', CARGOS_ESPERADOS, indiceCargos, new Set());

  const ehEsperado = (cargo) => CARGOS_ESPERADOS.some((nome) => normalizar(nome) === normalizar(cargo.name));
  const ambiguos = cargosRepetidos.filter(ehEsperado);
  if (ambiguos.length) {
    console.log(`  ⚠ mais de um cargo com esse nome, confira qual é o certo: ${ambiguos.map((c) => `${c.name} (${c.id})`).join(', ')}`);
  }

  // O bot só consegue mencionar cargo marcado como mencionável no servidor.
  const naoMencionaveis = cargos.filter((cargo) => ehEsperado(cargo) && !cargo.mentionable);
  if (naoMencionaveis.length) {
    console.log(`  ⚠ não estão mencionáveis: ${naoMencionaveis.map((c) => c.name).join(', ')}`);
    console.log('    Ajuste em Configurações do servidor > Cargos > "Permitir que qualquer pessoa mencione este cargo".');
  } else {
    console.log('  Todos os cargos acima estão mencionáveis.');
  }

  console.log('\nPronto. Cole a saída acima no chat ou preencha os IDs em src/config.js.');
}

principal().catch((erro) => {
  console.error('\nDeu errado:', erro.message);
  process.exit(1);
});
