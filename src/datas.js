// Conversão de data e hora digitada pelas admins, sempre em horário de Brasília.
// Brasília é UTC−3 e hoje não tem horário de verão (seção 8.3 do CLAUDE.md).
// Se o horário de verão voltar, este é o único arquivo a mexer.

const HORAS_ATRAS_DE_UTC = 3;
const FORMATO = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;

/**
 * Lê "DD/MM/AAAA HH:MM" como horário de Brasília.
 * Devolve { unix } em segundos, ou { erro } com uma frase para a admin.
 */
export function lerDataBrasilia(texto) {
  const achado = String(texto).trim().match(FORMATO);
  if (!achado) {
    return { erro: 'A data precisa estar no formato DD/MM/AAAA HH:MM, por exemplo 15/10/2026 19:00.' };
  }

  const [, dia, mes, ano, hora, minuto] = achado.map(Number);

  if (hora > 23 || minuto > 59) {
    return { erro: 'A hora precisa estar entre 00:00 e 23:59.' };
  }

  // Confere se a data existe mesmo: 31/02 vira 03/03 se a gente não olhar.
  const meiaNoite = new Date(Date.UTC(ano, mes - 1, dia));
  const existe = meiaNoite.getUTCFullYear() === ano
    && meiaNoite.getUTCMonth() === mes - 1
    && meiaNoite.getUTCDate() === dia;
  if (!existe) {
    return { erro: 'Essa data não existe no calendário, confira o dia e o mês.' };
  }

  const unix = Math.floor(Date.UTC(ano, mes - 1, dia, hora + HORAS_ATRAS_DE_UTC, minuto) / 1000);
  return { unix };
}

// Volta do unix para o texto em Brasília, para o card mostrar os dois formatos.
export function formatarBrasilia(unix) {
  const emBrasilia = new Date((unix - HORAS_ATRAS_DE_UTC * 3600) * 1000);
  const doisDigitos = (numero) => String(numero).padStart(2, '0');

  const data = `${doisDigitos(emBrasilia.getUTCDate())}/${doisDigitos(emBrasilia.getUTCMonth() + 1)}/${emBrasilia.getUTCFullYear()}`;
  return `${data} às ${doisDigitos(emBrasilia.getUTCHours())}:${doisDigitos(emBrasilia.getUTCMinutes())}`;
}

/**
 * Texto do campo "Quando": o timestamp nativo, que cada pessoa vê no próprio fuso,
 * e embaixo o horário de Brasília por extenso, para não deixar dúvida.
 */
export function textoDeQuando(unix) {
  return `<t:${unix}:F>\n${formatarBrasilia(unix)}, horário de Brasília`;
}

// Recupera o unix guardado no campo "Quando" da pré-visualização.
export function lerUnixDoTexto(texto) {
  const achado = String(texto ?? '').match(/<t:(\d+):F>/);
  return achado ? Number(achado[1]) : null;
}
