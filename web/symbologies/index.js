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
import { code39 } from './code39.js';
import { itf, itf14 } from './itf.js';
import { codabar } from './codabar.js';
import { code93 } from './code93.js';
import { gs1_128 } from './gs1-128.js';

export { ean13, ean8, upcA } from './upcean.js';
export { code128 } from './code128.js';
export { code39 } from './code39.js';
export { itf, itf14 } from './itf.js';
export { codabar } from './codabar.js';
export { code93 } from './code93.js';
export { gs1_128 } from './gs1-128.js';

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
  'GS1-128': 60,
  'Code 39': 55,
  'Code 93': 50,
  'ITF': 50,
  'ITF-14': 50,
  Codabar: 50,
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
  {
    id: 'gs1-128',
    symbology: 'GS1-128',
    rotulo: 'GS1-128',
    grupo: 'LOGISTICA',
    descricao:
      'O Code 128 com campos separados. Etiquetas de encomenda, caixas de ' +
      'farmácia, tudo o que leva mais do que um código de barras.',
    campo: {
      key: 'valor',
      label: 'Campos GS1',
      placeholder: '(01)04012345678901(10)LOTE-A1(17)270630',
      dica:
        'Cada campo começa por (AI) entre parênteses. O (01) é o GTIN de 14 ' +
        'dígitos, o (10) o lote e o (17) a validade. As datas vão em AAMMDD.',
    },
    /*
     * A validação é a do encoder, e não uma cópia daqui.
     *
     * Cada um dos outros campos deste registo reescreve as regras à sua maneira,
     * porque cada simbologia tem as suas. O GS1-128 tem **541 regras** - uma por
     * AI, cada uma com o seu comprimento e a sua expressão regular, todas numa
     * tabela gerada da fonte oficial. Escrever as regras outra vez aqui seria
     * criar uma segunda fonte de verdade sobre a mesma coisa, e as duas iam
     * divergir sem que nada dissesse: a validação de aqui passaria, a do encoder
     * não, e o erro apareceria no momento de gerar em vez de ao escrever.
     *
     * A única coisa que fica aqui é o mínimo: não estar vazio.
     */
    validar(valor) {
      const texto = String(valor).trim();
      if (texto.length === 0) {
        throw new Error('GS1-128: escreve os campos, como (01)04012345678901(10)LOTE-A1.');
      }
      return texto;
    },
    encode: gs1_128,
  },
  {
    id: 'code39',
    symbology: 'Code 39',
    rotulo: 'Code 39',
    grupo: 'INDUSTRIA',
    descricao: '43 caracteres, só de um lado. Automóveis e defesa.',
    campo: { key: 'valor', label: 'Conteúdo', placeholder: 'ABC-1234', dica: 'Maiúsculas, números, e - . $ / + % e espaço. O dígito de controlo é acrescentado.' },
    validar(valor) {
      const texto = String(valor).toUpperCase();
      if (texto.length === 0) throw new Error('Code 39: escreve alguma coisa para codificar.');
      const admitidos = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
      for (const c of texto) {
        if (c === '*') {
          throw new Error(
            'Code 39: o asterisco é o início e a paragem, e não pode estar nos dados.',
          );
        }
        if (!admitidos.includes(c)) {
          throw new Error(
            `Code 39 não tem "${c}". Só leva maiúsculas, números, e - . $ / + % e espaço. ` +
              'Para minúsculas ou acentos, use Code 128.',
          );
        }
      }
      return texto;
    },
    encode: code39,
  },
  {
    id: 'code93',
    symbology: 'Code 93',
    rotulo: 'Code 93',
    grupo: 'INDUSTRIA',
    descricao:
      'Automóveis, defesa, saúde. Traz minúsculas e dois dígitos de ' +
      'controlo, e é 13% mais curto que o Code 39 para o mesmo texto.',
    campo: {
      key: 'valor',
      label: 'Conteúdo',
      placeholder: 'Lote-2024-A',
      dica:
        'ASCII completo, minúsculas incluídas. Vai com dois dígitos de ' +
        'controlo, que são calculados e impressos por baixo.',
    },
    /*
     * A validação do Code 93 é a do encoder, e por uma razão que vale a pena:
     * o Code 93 é **ASCII completo** — traz minúsculas, o Code 39 não traz, e
     * esse é o motivo de existir. A validação aqui só verifica que não está
     * vazio, e tudo o resto — acentos recusados, asterisco recusado — vem do
     * `code93.js`, que sabe as regras porque as usa.
     *
     * A alternativa, reescrever as regras neste registo, criaria uma segunda
     * fonte de verdade sobre o que o Code 93 aceita. E o registo já tem esse
     * problema noutro sítio: o HTML e este ficheiro são o mesmo conjunto escrito
     * duas vezes, e o `formatos.test.mjs` existe por causa disso.
     */
    validar(valor) {
      const texto = String(valor);
      if (texto.length === 0) {
        throw new Error('Code 93: escreve alguma coisa para codificar.');
      }
      return texto;
    },
    encode: code93,
  },
  {
    id: 'itf14',
    symbology: 'ITF-14',
    rotulo: 'ITF-14',
    grupo: 'LOGISTICA',
    descricao: 'Caixas de cartão. Imprime-se no próprio cartão canelado, sem etiqueta.',
    campo: { key: 'valor', label: 'Código', placeholder: '1234567890123', dica: '13 dígitos. O último é calculado.' },
    validar(valor) {
      const limpo = String(valor).replace(/[\s-]/g, '');
      if (limpo.length !== 13) {
        throw new Error(
          `ITF-14 tem 14 dígitos, dos quais 13 de dados. Recebeste ${limpo.length}. ` +
            'O último, o de controlo, calcula-se.',
        );
      }
      return limpo;
    },
    encode: itf14,
  },
  {
    id: 'codabar',
    symbology: 'Codabar',
    rotulo: 'Codabar',
    grupo: 'INDUSTRIA',
    descricao: 'Bancos de sangue, arquivos, etiquetas de laboratório. Os caracteres de início e paragem dizem quem leu.',
    campo: { key: 'valor', label: 'Conteúdo', placeholder: '12345678', dica: '0-9 e - $ / : + . — sem espaços e sem letras.' },
    validar(valor) {
      const texto = String(valor);
      if (texto.length === 0) throw new Error('Codabar: escreve alguma coisa para codificar.');
      const admitidos = '0123456789-$/:+.';
      for (const c of texto.toUpperCase()) {
        if (!admitidos.includes(c)) {
          throw new Error(
            `Codabar não tem "${c}". Só leva 0-9 e - $ / : + . — ` +
              'não tem letras nem espaços. Para texto, use Code 128.',
          );
        }
      }
      return texto.toUpperCase();
    },
    encode: codabar,
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
