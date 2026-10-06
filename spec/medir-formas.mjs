// Mede quantos modulos cada FORMA apaga, para a mesma caixa.
//
//     node spec/medir-formas.mjs
//
// **A forma nao e' um pormenor estetico: e' o numero de modulos apagados que
// decide se o codigo se le.** Para uma caixa dada o quadrado e' o pior, porque
// enche os cantos; um circulo inscrito na mesma caixa apaga menos modulos e por
// isso le-se melhor **com o mesmo logotipo**.
//
// **E' essa a razao de a DENSO oferecer formas.** O que o site deles diz e' que
// "the canvas area does not interfere with code reading", e a verdade e' mais
// estreita: nao e' que a forma seja segura em si, e' que algumas formas
// **apagam menos area com o mesmo logotipo**. Um losango e' uma economia maior
// ainda, e uma estrela maior ainda — a estrela so apaga as pontas.
//
// **A conta vem de `contarApagados`, que e' a mesma funcao que o encoder usa.**
// Um script que refizesse a conta com a sua propria formula daria numeros que
// nao correspondem aos do que a aplicacao faz, e a diferenca apareceria como
// "o script diz que cabe e a aplicacao diz que nao", sem forma de saber qual
// dos dois tem razao.

import { encode } from '../web/qrcode.js';
import { contarApagados, FORMAS, modulosMaximos } from '../web/frameqr.js';

const PAYLOAD = 'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';

const info = encode(PAYLOAD, { ecl: 'H' });

console.log(`QR de ${info.size}x${info.size}, ECC H, com o anel de 2 modulos.`);
console.log('');
console.log('caixa   forma        apagados   % da caixa   vs quadrado');
console.log('-'.repeat(62));

for (const lado of [5, 7, 9, 11]) {
  const base = contarApagados(info, lado, 'quadrado');

  for (const [id, nome] of FORMAS) {
    const apagados = contarApagados(info, lado, id);
    const dif = apagados - base;
    const pct = (apagados / (lado * lado)) * 100;

    console.log(
      `${String(lado).padStart(4)}   ${nome.padEnd(12)} ` +
        `${String(apagados).padStart(7)}   ` +
        `${pct.toFixed(0).padStart(7)}%   ` +
        (dif === 0 ? '=' : (dif > 0 ? '+' + dif : String(dif))),
    );
  }

  console.log('');
}

/*
 * **Isto e' a razao pela qual o limite medido tem de ser por forma.**
 *
 * `modulosMaximos` devolve o maior logotipo que o QR aguenta, e a resposta
 * muda com a forma: **o mesmo QR aguenta um logotipo maior em estrela do que
 * em quadrado**, porque a estrela apaga menos area. Dar um unico numero para
 * todas as formas e保守 — e conservador demais para quem escolheu a forma
 * precisamente por ser mais legivel.
 *
 * A razao de o limite ser medido e nao deduzido e' a da AGENTS.md: a
 * percentagem de correccao de erros da norma e' de codewords e nao de area, e
 * so vale com os erros espalhados. Uma mancha e' contigua, e uma mancha e' o
 * pior caso. **Quem mede e' o ZXing.**
 */
console.log('O maior logotipo que este QR aguenta, por forma:');
console.log('');
console.log('ECC   forma        modulos   area apagada');
console.log('-'.repeat(56));

for (const ecc of ['M', 'Q', 'H']) {
  const infoEcl = encode(PAYLOAD, { ecl });
  const alturas = [];

  for (const [id, nome] of FORMAS) {
    const max = modulosMaximos(infoEcl.size, ecc, 2, id);
    const apagados = max > 0 ? contarApagados(infoEcl, max, id) : 0;
    alturas.push(
      `  ${ecc}   ${nome.padEnd(12)} ${String(max).padStart(6)}   ` +
        `${(apagados / (infoEcl.size ** 2) * 100).toFixed(2).padStart(6)}%`,
    );
  }

  console.log(alturas.join('\n'));
  console.log('');
}

console.log('Para o limite absoluto — quantos modulos cada forma aguenta de facto — a');
console.log('medicao e\' com o ZXing, e nao se deduz da percentagem da norma:');
console.log('  node web/tests/varredura-frameqr.mjs');
console.log('  python web/tests/analisar-frameqr.py');