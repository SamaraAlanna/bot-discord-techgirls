// Tudo que é específico do servidor Tech Girls mora aqui.
// IDs de canais não entram neste arquivo: vêm das vars do wrangler.toml, pelo env.
// Os IDs de tags e cargos abaixo vieram de `npm run ids` (scripts/listar-ids.js).

// Os cards recebem cor em inteiro decimal (seção 9.4 do CLAUDE.md).
const cor = (hex) => parseInt(hex.slice(1), 16);

export const CORES = {
  VAGA: cor('#D81E9E'), // magenta-500
  ANUNCIO: cor('#7341C0'), // roxo-500
  ENCERRADA: cor('#4A2A8C'), // roxo-700, também usado no log
};

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

// Cada área é tag do fórum e também cargo do servidor: o post da vaga menciona
// o cargo da área (seção 8.1). `cargoId` nulo quer dizer cargo não encontrado,
// e aí a vaga sai sem essa menção, com o motivo no console. Do mesmo jeito, `id`
// nulo quer dizer tag não encontrada no fórum, e a vaga sai sem a tag da área.
export const TAGS_AREA = [
  { valor: 'desenvolvimento', rotulo: 'Desenvolvimento', id: '1549751047856332860', cargoId: '1550832287115907092' },
  { valor: 'dados', rotulo: 'Dados', id: '1549751067615563877', cargoId: '1550832389830352986' },
  { valor: 'design-ux', rotulo: 'Design e UX', id: '1549751087471534100', cargoId: '1550832425892974683' },
  { valor: 'qa', rotulo: 'QA', id: '1549751105825538118', cargoId: '1550835960013660273' },
  { valor: 'infra-cloud', rotulo: 'Infra e Cloud', id: '1549751126465716234', cargoId: '1550832474286981120' },
  { valor: 'cyberseguranca', rotulo: 'Cybersegurança', id: '1550834294375710851', cargoId: '1550832672840880128' },
  { valor: 'suporte-tecnico', rotulo: 'Suporte Técnico', id: '1550834325094928404', cargoId: '1550833315643129986' },
  { valor: 'produto-gestao', rotulo: 'Produto e Gestão', id: '1549751148272160918', cargoId: '1550832562686009355' },
];

// Funções de cada área, oferecidas no menu Função da pré-visualização.
// Não viram tag (o post aceita no máximo 5): só o cargo, que entra na menção.
// A chave é o `valor` da área em TAGS_AREA.
export const FUNCOES_POR_AREA = {
  desenvolvimento: [
    { valor: 'front-end', rotulo: 'Front-End', cargoId: '1509281269501132860' },
    { valor: 'back-end', rotulo: 'Back-End', cargoId: '1509286904586047549' },
    { valor: 'full-stack', rotulo: 'Full Stack', cargoId: '1550830838361366629' },
    { valor: 'mobile', rotulo: 'Mobile', cargoId: '1550832048082788373' },
    { valor: 'games', rotulo: 'Games', cargoId: '1550832082752901160' },
  ],
  dados: [
    { valor: 'analista-dados', rotulo: 'Analista de Dados', cargoId: '1509287206500434083' },
    { valor: 'engenharia-dados', rotulo: 'Engenharia de Dados', cargoId: '1550831977320419410' },
    { valor: 'ciencia-dados', rotulo: 'Ciência de Dados', cargoId: '1550832010161946634' },
  ],
  'design-ux': [
    { valor: 'ux-design', rotulo: 'UX Design', cargoId: '1509287480413655040' },
    { valor: 'ui-design', rotulo: 'UI Design', cargoId: '1509909556283576471' },
    { valor: 'ux-ui-design', rotulo: 'UX/UI Design', cargoId: '1550830959367163954' },
  ],
  qa: [
    { valor: 'qa-manual', rotulo: 'QA Manual', cargoId: '1509287247994949632' },
    { valor: 'qa-automacao', rotulo: 'QA Automação', cargoId: '1550831785057976361' },
  ],
  'infra-cloud': [
    { valor: 'devops', rotulo: 'DevOps', cargoId: '1509286553434718348' },
    { valor: 'cloud', rotulo: 'Cloud', cargoId: '1550839064125767680' },
    { valor: 'sre', rotulo: 'SRE', cargoId: '1550831861289197609' },
  ],
  cyberseguranca: [
    { valor: 'appsec', rotulo: 'AppSec', cargoId: '1509287339191701554' },
    { valor: 'blue-team', rotulo: 'Blue Team', cargoId: '1550832876105367582' },
    { valor: 'red-team', rotulo: 'Red Team', cargoId: '1550832922896892005' },
    { valor: 'grc', rotulo: 'GRC', cargoId: '1550832964869554206' },
  ],
  'suporte-tecnico': [
    { valor: 'suporte-n1', rotulo: 'Suporte N1', cargoId: '1550833358806716497' },
    { valor: 'suporte-n2', rotulo: 'Suporte N2', cargoId: '1550833387697082489' },
    { valor: 'service-desk', rotulo: 'Service Desk', cargoId: '1550833438817394758' },
    { valor: 'field-service', rotulo: 'Field Service', cargoId: '1550833471377637467' },
  ],
  'produto-gestao': [
    { valor: 'po', rotulo: 'PO', cargoId: '1509287534490943548' },
    { valor: 'pm', rotulo: 'PM', cargoId: '1550830998910935110' },
    { valor: 'scrum-master', rotulo: 'Scrum Master', cargoId: '1550832166206701598' },
  ],
};

// Opção padrão do menu Função: a vaga não menciona cargo de função nenhuma.
export const FUNCAO_NAO_ESPECIFICADA = { valor: 'nao-especificar', rotulo: 'Não especificar' };

// Tag de status, aplicada por /vaga encerrar.
export const TAG_ENCERRADA_ID = '1549751166152343633';

// Opções do menu de menção do /anuncio, na ordem da seção 9.3.
// Os cargos de momento de carreira não entram aqui: anúncio é para o servidor inteiro.
// `id` só existe para cargo; @everyone e @here são menções do próprio Discord.
export const MENCOES = [
  { valor: 'ninguem', rotulo: 'Ninguém', descricao: 'Publica sem menção nenhuma' },
  { valor: 'everyone', rotulo: '@everyone', descricao: 'Notifica todo mundo do servidor' },
  { valor: 'here', rotulo: '@here', descricao: 'Notifica quem está online agora' },
  {
    valor: 'suporte',
    rotulo: 'Suporte',
    emoji: '⚙️',
    id: '1509902310518816908',
    descricao: 'Notifica o cargo Suporte',
  },
];

// As duas que notificam o servidor inteiro, e por isso ganham aviso na pré-visualização.
export const MENCOES_AMPLAS = ['everyone', 'here'];

// Reações que o bot pode deixar no anúncio recém-publicado (seção 9.7).
// `caractere` é o que vai codificado na URL da API de reação.
export const REACOES = [
  { valor: 'nenhuma', rotulo: 'Nenhuma', descricao: 'Publica sem reagir' },
  { valor: 'roxo', rotulo: '💜', caractere: '💜', descricao: 'Carinho e apoio' },
  { valor: 'festa', rotulo: '🎉', caractere: '🎉', descricao: 'Comemoração' },
  { valor: 'estudo', rotulo: '📚', caractere: '📚', descricao: 'Conteúdo para estudar' },
  { valor: 'olhos', rotulo: '👀', caractere: '👀', descricao: 'Fica de olho' },
  { valor: 'confirmado', rotulo: '✅', caractere: '✅', descricao: 'Confirmação de presença' },
];

// A reação já nasce escolhida, então ela não trava o botão Publicar.
export const REACAO_PADRAO = 'nenhuma';
