/**
 * Bissecção: qual é o menor payload que o ZXing não lê?
 *
 *   node web/tests/biscar-pdf417.mjs
 *
 * Existe porque o PDF417 falha de formas que não dizem nada. Com um payload de
 * 34 caracteres e acentos, o ZXing não lia nada — e isso pode ser a
 * compactação, a estrutura, a correcção de erros, ou o modo de bytes. Em vez de
 * adivinhar, reduz-se o payload até ao mínimo que falha, e esse é o que se
 * estuda.
 *
 * O resultado vai para `.pdf417-biscar.json`, e o script Python seguinte lê.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pdf417 } from '../symbologies/pdf417.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.pdf417-biscar.json');

/**
 * Payloads escolhidos para apanhar cada modo, e as misturas entre eles.
 *
 * A ordem é de propósito: o texto simples primeiro, porque se aquilo falhar o
 * bug está na estrutura e não vale a pena olhar para o resto.
 */
const PAYLOADS = [
  'ABCDEF',
  'abcdef',
  'ABC123',
  '12345',
  'a-c',
  'a c',
  'a.b',
  'a,b',
  'a:b',
  'a;b',
  'a<b',
  'a=b',
  'a>b',
  'a?b',
  'a@b',
  'a[b',
  'a\\b',
  'a]b',
  'a^b',
  'a_b',
  'a`b',
  'a~b',
  'a!b',
  'a\tb',
  'a\nb',
  'a\rb',
  'a#b',
  "a'b",
  'a"b',
  'a(b',
  'a)b',
  'a*b',
  'a+b',
  'a,b;c<d>e=f>g?h',
  'a\u00e7b',
  'a\u20acb',
  '\u20ac',
  'a\u00e7\u00e7',
  'a\u00e7b\u20acc',
];

const NIVEIS = [0, 2];

const casos = [];
for (const payload of PAYLOADS) {
  for (const nivel of NIVEIS) {
    for (const colunas of [4, 6]) {
      try {
        const codigo = pdf417(payload, { colunas, nivel });
        casos.push({
          payload,
          nivel,
          colunasPedidas: colunas,
          linhas: codigo.linhas,
          colunas: codigo.colunas,
          palavras: codigo.palavras,
          modules: codigo.modules,
        });
      } catch (erro) {
        casos.push({ payload, nivel, colunasPedidas: colunas, erro: erro.message });
      }
    }
  }
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(`${casos.length} casos de bissecção gerados\n`);
