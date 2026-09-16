// Tudo que é específico do servidor Tech Girls mora aqui.
// IDs de canais não entram neste arquivo: vêm das vars do wrangler.toml, pelo env.
// Os IDs de tags e cargos abaixo vieram de `npm run ids` (scripts/listar-ids.js).

// Embeds recebem cor em inteiro decimal (seção 9.4 do CLAUDE.md).
const cor = (hex) => parseInt(hex.slice(1), 16);

export const CORES = {
  VAGA: cor('#7341C0'), // roxo-500
  ANUNCIO: cor('#D81E9E'), // magenta-500
  ENCERRADA: cor('#4A2A8C'), // roxo-700, também usado no log
};

// Rodapé dos embeds: texto, sem ícone.
export const RODAPE = { text: 'Tech Girls' };

// Tags do fórum de vagas. O código mapeia sempre por ID, nunca por nome:
// renomear a tag no servidor não pode quebrar o bot.
export const TAGS_SENIORIDADE = [
  { valor: 'estagio', rotulo: 'Estágio', id: '1549750831543361596' },
  { valor: 'trainee', rotulo: 'Trainee', id: '1549750855085858977' },
  { valor: 'junior', rotulo: 'Júnior', id: '1549750878787862598' },
  { valor: 'pleno', rotulo: 'Pleno', id: '1549750896567779369' },
  { valor: 'senior', rotulo: 'Sênior', id: '1549750914922057728' },
  { valor: 'especialista', rotulo: 'Especialista', id: '1549750934303678534' },
  { valor: 'lideranca', rotulo: 'Liderança', id: '1549750954474340423' },
];

export const TAGS_MODALIDADE = [
  { valor: 'remoto', rotulo: 'Remoto', id: '1549750989618151464' },
  { valor: 'hibrido', rotulo: 'Híbrido', id: '1549751011877457930' },
  { valor: 'presencial', rotulo: 'Presencial', id: '1549751029803786291' },
];

export const TAGS_AREA = [
  { valor: 'desenvolvimento', rotulo: 'Desenvolvimento', id: '1549751047856332860' },
  { valor: 'dados', rotulo: 'Dados', id: '1549751067615563877' },
  { valor: 'design-ux', rotulo: 'Design e UX', id: '1549751087471534100' },
  { valor: 'qa', rotulo: 'QA', id: '1549751105825538118' },
  { valor: 'infra-cloud', rotulo: 'Infra e Cloud', id: '1549751126465716234' },
  { valor: 'produto-gestao', rotulo: 'Produto e Gestão', id: '1549751148272160918' },
];

// Tag de status, aplicada por /vaga encerrar.
export const TAG_ENCERRADA_ID = '1549751166152343633';

// Cargos mencionáveis em anúncios (seção 9.3). Todos estavam marcados como
// mencionáveis no servidor em 16/09/2026: o bot não tem permissão de mencionar todos,
// então desmarcar um deles faz o anúncio sair sem notificar ninguém.
export const CARGOS = [
  { valor: 'quero-entrar', rotulo: 'Quero entrar', emoji: '🌱', id: '1549727295953174649' },
  { valor: 'em-transicao', rotulo: 'Em transição', emoji: '🔄', id: '1549727504867004416' },
  { valor: 'estagio', rotulo: 'Estágio', emoji: '🎓', id: '1549727596743368725' },
  { valor: 'trainee', rotulo: 'Trainee', emoji: '🧭', id: '1549727719355326554' },
  { valor: 'junior', rotulo: 'Júnior', emoji: '💻', id: '1549727955092111440' },
  { valor: 'pleno', rotulo: 'Pleno', emoji: '🚀', id: '1549728020166869032' },
  { valor: 'senior', rotulo: 'Sênior', emoji: '⭐', id: '1549728075909046312' },
  { valor: 'especialista', rotulo: 'Especialista', emoji: '🧠', id: '1549728162655768736' },
  { valor: 'lideranca', rotulo: 'Liderança', emoji: '👑', id: '1549728215873101824' },
];

// Busca por valor, do jeito que os menus devolvem a escolha.
export function acharPorValor(lista, valor) {
  return lista.find((item) => item.valor === valor) ?? null;
}
