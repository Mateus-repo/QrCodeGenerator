/**
 * Gera Data Matrix para o leitor externo ler.
 *
 *   node web/tests/gerar-datamatrix.mjs
 *   python web/tests/descodificar-datamatrix.py
 *
 * Os casos vão aos extremos de propósito: o payload de uma letra, o que dá o
 * símbolo de 10x10; texto, que é o modo ASCII; números, que é o modo de
 * pares de dígitos e que é onde o Data Matrix mostra o que sabe fazer; texto
 * com acentos, que é o deslocamento para ASCII estendido e o dobro de
 * codewords; e payloads grandes, que forçam a passar por símbolos com blocos
 * de correcção de erros — que é onde o entrelaçamento se vê.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dataMatrix } from '../symbologies/datamatrix.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.datamatrix.json');

const PAYLOADS = [
  'A',
  'AB',
  'MAST-2024-0001',
  '4531234567890123',
  '12345678901234567890123456789012',
  '0000000000000000000000000',
  // O deslocamento para ASCII estendido: cada acento custa dois codewords.
  'Fatura nº 2026/09 — açúcar, €45,80',
  'Lote ✅ 42 — pronto 🚀',
  // Payloads que passam por símbolos com mais do que um bloco de correcção.
  'X'.repeat(120),
  'Y'.repeat(400),
  'Z'.repeat(900),
  '9'.repeat(1400),
];

const casos = [];

for (const payload of PAYLOADS) {
  const codigo = dataMatrix(payload);
  casos.push({
    payload,
    colunas: codigo.colunas,
    linhas: codigo.linhas,
    dados: codigo.dados,
    correccao: codigo.correccao,
    usado: codigo.usado,
    // `Array.from` e obrigatorio, pelo mesmo motivo que no PDF417: a matriz e
    // um array de `Uint8Array`, e o `JSON.stringify` serializa uma
    // `Uint8Array` como objecto em vez de lista.
    modules: codigo.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
  });
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(`${casos.length} casos de Data Matrix gerados\n`);
