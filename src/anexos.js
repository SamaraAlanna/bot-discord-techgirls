// Imagens do anúncio: validação e download.
//
// Arquivo enviado por modal é mídia **efêmera** do CDN, e é por isso que isso
// funciona: o Worker consegue baixar mídia efêmera, mas não a permanente (seção 9.1).
// Os bytes passam pela memória do isolate, que tem 128 MB, daí os limites abaixo.

const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const EXTENSOES_ACEITAS = /\.(png|jpe?g|gif|webp)$/i;

export const MAXIMO_DE_IMAGENS = 4;
export const MAXIMO_POR_IMAGEM = 5 * 1024 * 1024;
export const MAXIMO_EM_MB = MAXIMO_POR_IMAGEM / 1024 / 1024;

function ehImagem(anexo) {
  if (anexo.content_type) return TIPOS_ACEITOS.includes(anexo.content_type);
  return EXTENSOES_ACEITAS.test(anexo.filename ?? '');
}

/**
 * Lê os anexos do envio do modal e confere tipo, tamanho e quantidade.
 * Tudo isso vem no payload, então dá para recusar antes de baixar qualquer byte.
 * Devolve { imagens } ou { erro } com uma frase para a admin.
 */
export function validarImagensDoModal(interacao, chaves) {
  const resolvidos = interacao.data?.resolved?.attachments ?? {};
  const anexos = (chaves ?? []).map((chave) => resolvidos[chave]).filter(Boolean);

  if (!anexos.length) return { imagens: [] };

  if (anexos.length > MAXIMO_DE_IMAGENS) {
    return { erro: `Dá para anexar no máximo ${MAXIMO_DE_IMAGENS} imagens. Tire algumas e tente de novo.` };
  }

  // Os erros não citam nome de arquivo nem tamanho: o detalhe vai para o console,
  // a admin recebe uma frase que diz o que fazer (seção 9.6).
  const foraDoTipo = anexos.find((anexo) => !ehImagem(anexo));
  if (foraDoTipo) {
    console.warn('Anexo recusado por tipo:', foraDoTipo.filename, foraDoTipo.content_type);
    return { erro: 'Só dá para anexar imagens (PNG, JPG, GIF ou WEBP).' };
  }

  const grande = anexos.find((anexo) => anexo.size > MAXIMO_POR_IMAGEM);
  if (grande) {
    console.warn('Anexo recusado por tamanho:', grande.filename, grande.size);
    return { erro: `Uma das imagens passa de ${MAXIMO_EM_MB} MB. Diminua o tamanho e tente de novo.` };
  }

  return { imagens: anexos };
}

/**
 * Baixa os anexos pelas URLs que vieram na interação.
 * Lança no primeiro problema: publicar metade das imagens seria pior que não publicar.
 */
export async function baixarImagens(anexos) {
  const arquivos = [];

  for (const anexo of anexos) {
    const nome = anexo.filename ?? 'imagem';
    const resposta = await fetch(anexo.url);

    if (!resposta.ok) {
      throw new Error(`download de ${nome} devolveu ${resposta.status}`);
    }

    arquivos.push({
      nome,
      tipo: anexo.content_type ?? 'application/octet-stream',
      bytes: await resposta.arrayBuffer(),
    });
  }

  return arquivos;
}

/**
 * Lista de anexos a manter numa edição de mensagem.
 * Na v10 da API, editar sem mandar `attachments` apaga os anexos existentes,
 * então toda atualização da pré-visualização precisa repetir esta lista.
 */
export function anexosParaManter(mensagem) {
  return (mensagem?.attachments ?? []).map((anexo) => ({ id: anexo.id, filename: anexo.filename }));
}
