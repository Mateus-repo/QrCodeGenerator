// Mede o quociente de cada forma: quantos módulos apaga, em relação ao
// quadrado, na mesma caixa.
//
//     node spec/medir-quocientes.mjs
//
// **O quociente é o que faz `modulosMaximos` ser por forma.** Quem escolhe um
// círculo em vez de um quadrado escolheu-o porque lê melhor, e dar-lhe o mesmo
// limite é保守 — conservador demais para quem fez a escolha certa.
//
// **A percentagem de correcção de erros do QR conta *codewords errados* e não
// área**, e não pode ser convertida para módulos apagados sem uma medição. Por
// isso que este quociente é medido e não deduzido — e por isso que é medido
// entre formas, onde a conversão é uma divisão e não um salto de unidades.

import { encode } from '../web/qrcode.js';
import { contarApagados, FORMAS } from '../web/frameqr.js';

const PAYLOAD = 'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';

const info = encode(PAYLOAD, { ecl: 'H' });

// **Vários lados, porque o quociente não é constante.** Uma forma tem
// bordasrights e uma outra não, e a diferença é maior numa caixa pequena.
const LADOS = [5, 7, 9, 11, 13, 15, 17];

const quocientes = {};

console.log('lado  ' + FORMAS.map(([, nome]) => nome.padEnd(13)).join(''));
console.log('-'.repeat(8 + FORMAS.length * 14));

for (const lado of LADOS) {
  const base = contarApagados(info, lado, 'quadrado');
  const linha = [String(lado).padEnd(6)];

  for (const [id] of FORMAS) {
    const apagados = contarApagados(info, lado, id);
    const q = apagados / base;

    // **A média das caixas, não a última.** E a razão de não usar a caixa
    // maior: a maior é a que mais se parece com a área, e a que faz o quociente
    // tender para 1 — que é o número que não serve para nada.
    quocientes[id] = quocientes[id] === undefined
      ? []
      : quocientes[id];
    quocientes[id].push(q);

    linha.push((q.toFixed(3) + '        ').slice(0, 14));
  }

  console.log(linha.join(''));
}

console.log();
console.log('O quociente a por no `modulosMaximos`:');
console.log('');

for (const [id, nome] of FORMAS) {
  const qs = quocientes[id];
  const media = qs.reduce((a, b) => a + b, 0) / qs.length;
  const min = Math.min(...qs);
  const max = Math.max(...qs);

  console.log(
    `  ${nome.padEnd(13)} media ${media.toFixed(3)}   ` +
      `min ${min.toFixed(3)}   max ${max.toFixed(3)}`,
  );
}

console.log();
console.log('Qual usar? A média ou o mínimo?');
console.log('');
console.log('A média é o número certo para uma pessoa que escolheu a forma sem saber');
console.log('nada: é o comportamento típico dela.');
console.log('');
console.log('O mínimo é o número certo para uma garantia: é o pior caso, e nunca');
console.log('recomenda um logótipo grande demais. **É este que vai no código**, porque');
console.log('a `AGENTS.md` é explícita sobre qual das duas falhas é pior: um logótipo');
console.log('pequeno demais é feio e um grande demais é um código que não lê.');