/**
 * Reduz um payload que não lê até ao menor que ainda não lê.
 *
 *   node web/tests/reduzir-pdf417.mjs
 *   python web/tests/descodificar-pdf417.py .pdf417-reduzir.json
 *
 * O PDF417 falha de formas que não dizem nada. Um payload de 34 caracteres com
 * acentos e emojis não lia nada, e as possibilidades eram a compactação, a
 * estrutura, a correcção de erros ou o modo de bytes — e um payload de três
 * caracteres passa em todos os quatro. Em vez de ir adivinhando, tira-se
 * caracteres até ao payload mínimo que falha, e estuda-se esse.
 *
 * O resultado é um ficheiro com os candidatos, do maior ao menor, para o
 * script de leitura tentar cada um. O menor que falha é onde está o bug.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pdf417 } from '../symbologies/pdf417.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.pdf417-reduzir.json');

const ORIGINAL = 'Fatura n\u00ba 2026/09 \u2014 a\u00e7\u00facar, \u20ac45,80';

const casos = [];

/** Gera o símbolo, e devolve `null` se o encoder recusar o payload. */
function tentar(payload, nivel, colunas) {
  try {
    const codigo = pdf417(payload, { colunas, nivel });
    return {
      payload,
      nivel,
      colunasPedidas: colunas,
      linhas: codigo.linhas,
      colunas: codigo.colunas,
      palavras: codigo.palavras,
      modules: codigo.modules,
    };
  } catch {
    return null;
  }
}

/** Todos os subconjuntos por eliminação, do original para baixo. */
function reduzir(texto) {
  const candidatos = [texto];
  let actual = texto;

  while (actual.length > 1) {
    let encolheu = false;
    for (let i = 0; i < actual.length; i++) {
      const corte = actual.slice(0, i) + actual.slice(i + 1);
      if (!candidatos.includes(corte)) candidatos.push(corte);
      actual = corte;
      encolheu = true;
      break;
    }
    if (!encolheu) break;
  }

  return candidatos;
}

for (const payload of [...new Set(reduzir(ORIGINAL))]) {
  for (const nivel of [0, 2]) {
    for (const colunas of [6]) {
      const caso = tentar(payload, nivel, colunas);
      if (caso) casos.push(caso);
    }
  }
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(
  `${casos.length} candidatos de "${ORIGINAL.length} caracteres" para reduzir\n`,
);
