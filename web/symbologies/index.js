/**
 * Simbologias de codigos de barras lineares.
 *
 * Um registo, para a interface nao precisar de saber nada sobre cada encoder.
 * Cada entrada diz o que codificar, que campo o utilizador preenche, e como se
 * valida a entrada — porque um codigo de barras nao leva um payload, leva um
 * valor, e as regras desse valor sao do dominio da simbologia e nao do gerador.
 *
 * O registo tambem e o ponto unico onde a altura e a legenda se decidem, que
 * sao coisas que dependem da simbologia e nao do desenho.
 */

import { ean13, ean8, upcA } from './upcean.js';
import { code128 } from './code128.js';

export { ean13, ean8, upcA } from './upcean.js';
export { code128 } from './code128.js';

/**
 * Altura da barra em modulos, por simbologia.
 *
 * Nao e arbitrario: um codigo de barras baixo demais nao e lido por leitores de
 * mao, e um alto demais desperdiça a etiqueta. Os valores sao os que se veem em
 * etiquetas reais. A relacao largura/altura normalizada vai de 1,5:1 (ITF) a
 * 3:1 (EAN).
 */
const ALTURA_PADRAO = {
  'EAN-13': 68,
  'EAN-8': 62,
  'UPC-A': 68,
  'Code 128': 60,
};

/**
 * Simbologias expostas na interface.
 *
 * `validar` recebe o que o utilizador escreveu e devolve o valor normalizado,
 * ou lanca. Nao ha "corrige o que der": um EAN com um digito a menos nao e um
 * EAN, e fingir que e produz um codigo que nao escaneia.
 */
export const SIMBOLOGIAS = [
  {
    id: 'ean13',
    symbology: 'EAN-13',
    rotulo: 'EAN-13',
    grupo: 'PRODUTO',
    descricao: '13 dígitos. O código de barras dos produtos de supermercado.',
    campo: { key: 'valor', label: 'Código', placeholder: '400638133393', dica: '12 ou 13 dígitos. O último é calculado.' },
    validar(valor) {
      const limpo = String(valor).replace(/[\s-]/g, '');
      if (limpo.length !== 12 && limpo.length !== 13) {
        throw new Error(
          `EAN-13 tem 13 dígitos. Recebeste ${limpo.length}. ` +
            'Escreve os 12 primeiros e o último calcula-se.',
        );
      }
      return limpo.slice(0, 12);
    },
    encode: ean13,
  },
  {
    id: 'ean8',
    symbology: 'EAN-8',
    rotulo: 'EAN-8',
    grupo: 'PRODUTO',
    descricao: '8 dígitos. Para embalagens pequenas onde um EAN-13 não cabe.',
    campo: { key: 'valor', label: 'Código', placeholder: '9638507', dica: '7 ou 8 dígitos. O último é calculado.' },
    validar(valor) {
      const limpo = String(valor).replace(/[\s-]/g, '');
      if (limpo.length !== 7 && limpo.length !== 8) {
        throw new Error(
          `EAN-8 tem 8 dígitos. Recebeste ${limpo.length}. ` +
            'Escreve os 7 primeiros e o último calcula-se.',
        );
      }
      return limpo.slice(0, 7);
    },
    encode: ean8,
  },
  {
    id: 'upca',
    symbology: 'UPC-A',
    rotulo: 'UPC-A',
    grupo: 'PRODUTO',
    descricao: '12 dígitos. O equivalente norte-americano do EAN-13.',
    campo: { key: 'valor', label: 'Código', placeholder: '03600029145', dica: '11 ou 12 dígitos. O último é calculado.' },
    validar(valor) {
      const limpo = String(valor).replace(/[\s-]/g, '');
      if (limpo.length !== 11 && limpo.length !== 12) {
        throw new Error(
          `UPC-A tem 12 dígitos. Recebeste ${limpo.length}. ` +
            'Escreve os 11 primeiros e o último calcula-se.',
        );
      }
      return limpo.slice(0, 11);
    },
    encode: upcA,
  },
  {
    id: 'code128',
    symbology: 'Code 128',
    rotulo: 'Code 128',
    grupo: 'LOGISTICA',
    descricao: 'Letras, números e pontuação. O das etiquetas de encomenda.',
    campo: { key: 'valor', label: 'Conteúdo', placeholder: 'MAST-2024-0001', dica: 'ASCII: até 127, sem acentos. O código escolhe o melhor conjunto sozinho.' },
    validar(valor) {
      const texto = String(valor);
      if (texto.length === 0) throw new Error('Code 128: escreve alguma coisa para codificar.');
      for (const c of texto) {
        if (c.codePointAt(0) > 127) {
          throw new Error(
            `Code 128 é ASCII e "${c}" não é. Para acentos ou alfabetos não latinos, usa QR.`,
          );
        }
      }
      return texto;
    },
    encode: code128,
  },
];

export function simbologiaPorId(id) {
  return SIMBOLOGIAS.find((s) => s.id === id) ?? null;
}

/**
 * Codifica um valor e junta-lhe o que o desenho precisa de saber.
 *
 * O encoder devolve os modulos; a altura e a legenda sao daqui, porque dependem
 * da simbologia e nao do algoritmo de codificacao.
 */
export function codificar(id, valor) {
  const definicao = simbologiaPorId(id);
  if (definicao === null) {
    throw new Error(`Simbologia desconhecida: "${id}"`);
  }

  const normalizado = definicao.validar(valor);
  const codigo = definicao.encode(normalizado);

  return {
    ...codigo,
    id: definicao.id,
    rotulo: definicao.rotulo,
    alturaModulos: ALTURA_PADRAO[codigo.symbology] ?? 60,
    /** A legenda e o que vai impresso por baixo, já com o dígito de controlo. */
    legenda: codigo.caption,
  };
}
