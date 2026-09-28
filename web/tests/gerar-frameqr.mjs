/**
 * Confirma que o logótipo recomendado pelo proprio codigo se le.
 *
 *     node web/tests/gerar-frameqr.mjs
 *     python web/tests/descodificar-frameqr.py
 *
 * Este e o teste que vale. Os outros medem; este pergunta a pergunta que o
 * utilizador faz, que e "se eu puser o logotipo no tamanho que a aplicacao
 * recomenda, o codigo le?". Se `modulosMaximos` errar para o lado optimistic,
 * este teste e vermelho — e e o unico sitio onde isso se mostra, porque nenhum
 * teste estrutural sabe o que e um QR que nao le.
 *
 * E cada caso vai ate `modulosMaximos`, e nao a uma fracao dela. Um logótipo a
 * 20% do maximo e um teste que passa e nao diz nada: o que interessa e o
 * limite, porque e no limite que o codigo para de ler.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encode } from '../qrcode.js';
import { aplicarFrame, modulosMaximos, MARGEM } from '../frameqr.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.frameqr.json');

/** Textos de tamanhos muito diferentes: o QR sai em versões muito diferentes. */
const PAYLOADS = [
  'https://exemplo.pt',
  'https://exemplo.pt/painel/2026/09?utm=origem=frameqr',
  '00020126580014br.gov.bcb.pix0136123e4567e12b12d1a4564266554400005204000053039865410.505802BR5913Fulano de Tal6008BRASILIA62070503***6304ABCD',
];

const NIVEIS = ['L', 'M', 'Q', 'H'];

const casos = [];

for (const payload of PAYLOADS) {
  for (const ecl of NIVEIS) {
    // O controlo: sem logótipo, tem de ler. Sem ele, um renderizador de teste
    // defeituoso aparece como "a correcção de erros não funciona".
    for (const modulos of [0, modulosMaximos(encode(payload, { ecl }).size, ecl)]) {
      const qr = encode(payload, { ecl });
      const codigo = aplicarFrame(qr, { modulos, margemMinima: MARGEM });

      casos.push({
        payload,
        ecl,
        controlo: modulos === 0,
        modulosPedidos: modulos,
        size: qr.size,
        version: qr.version,
        modulosApagados: codigo.apagados,
        percentagem: Number(codigo.percentagem.toFixed(2)),
        /*
         * `Array.from` e obrigatorio. A matriz do QR e um array de
         * `Uint8Array`; `linha.map(...)` devolve outra `Uint8Array`, e o
         * `JSON.stringify` serializa uma `Uint8Array` como objecto. No Python
         * isso chega como dicionario, e `'0'` e verdadeiro: todos os modulos
         * saiam escuros e o ZXing nao lia nada.
         */
        modules: codigo.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
      });
    }
  }
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(`${casos.length} casos de FrameQR gerados\n`);
