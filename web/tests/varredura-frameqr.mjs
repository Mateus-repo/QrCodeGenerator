/**
 * Varrimento do tamanho maximo de logotipo que o ZXing ainda le.
 *
 *     node web/tests/varredura-frameqr.mjs
 *
 * Gera, para cada payload e cada nivel de correccao, uma serie de FrameQR de
 * tamanho crescente, e o script Python seguinte le-os todos. O resultado nao e
 * uma deducao: e a medicao do ponto em que a correccao de erros deixa de
 * chegar.
 *
 * Sai com fraccoes de 0.02 para ter precisao de meio modulo, porque a
 * diferenca entre "le" e "nao le" costuma ser um unico modulo e o que interessa
 * e saber onde e que se perde.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encode } from '../qrcode.js';
import { aplicarFrame, modulosMaximos } from '../frameqr.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.frameqr.json');

const PAYLOADS = [
  'https://exemplo.pt',
  'https://exemplo.pt/painel/2026/09?utm=origem=frameqr',
  '00020126580014br.gov.bcb.pix0136123e4567e12b12d1a4564266554400005204000053039865410.505802BR5913Fulano de Tal6008BRASILIA62070503***6304ABCD',
];

const NIVEIS = ['L', 'M', 'Q', 'H'];

const casos = [];

for (const payload of PAYLOADS) {
  for (const ecl of NIVEIS) {
    const maximo = Math.max(
      ...PAYLOADS.map((p) => modulosMaximos(encode(p, { ecl }).size, ecl)),
    );

    // De 0 ate um pouco acima do tecto teorico, de um em um modulo. E ao
    // modulo: a diferenca entre "le" e "nao le" costuma ser um unico modulo,
    // e um passo de 2 daria um limite com dois modulos de erro — que num
    // logotipo pequeno e metade dele.
    for (let modulos = 0; modulos <= maximo + 2; modulos += 1) {
      const qr = encode(payload, { ecl });
      const codigo = aplicarFrame(qr, { modulos, margemMinima: 2 });

      casos.push({
        payload,
        ecl,
        modulosPedidos: modulos,
        size: qr.size,
        version: qr.version,
        modulosApagados: codigo.apagados,
        percentagem: Number(codigo.percentagem.toFixed(2)),
        // `Array.from` e obrigatorio: a matriz e um array de `Uint8Array`, e o
        // `JSON.stringify` serializa uma `Uint8Array` como objecto. No Python
        // isso chega como dicionario, onde `'0'` e verdadeiro e o QR sai todo
        // preto.
        modules: codigo.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
      });
    }
  }
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(`${casos.length} casos de varredura gerados\n`);
