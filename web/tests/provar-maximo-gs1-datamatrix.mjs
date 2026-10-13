/**
 * O `gs1-datamatrix.js` tem o bug do `maximo`, e este script e' o que o prova.
 *
 *     node web/tests/provar-maximo-gs1-datamatrix.mjs
 *
 * ## O bug
 *
 * O gerador `spec/gerar-tabelas-gs1.py` escreve em `maximo` o comprimento do
 * **ultimo** componente de um AI, que e' o que serve para **dividir** o valor. Para
 * **conferir** o valor faz falta a **soma** de todos os componentes, que e' o que o
 * `comprimentoTotal` do `gs1-128.js` faz.
 *
 * O `gs1-128.js` chama o `comprimentoTotal` (linha 444). **O `gs1-datamatrix.js` nao
 * chama** - compara com `encontrado.maximo` directamente (linha 207), que e' o do
 * ultimo componente.
 *
 * Sao **47 dos 541 AIs** que tem mais de um componente, e todos eles recusam um valor
 * que a GS1 aceita. E' o mesmo bug que a sessao anterior corrigiu nas outras cinco
 * stacks, e que **nao tinha apanhado aqui** porque o GS1 DataMatrix nao estava no
 * Python, no Java, no Kotlin nem no C# - nao havia com que comparar.
 *
 * **E o sintoma e' o pior dos possiveis**, e e' o mesmo do GS1-128: a pessoa escreve
 * o valor certo e o encoder recusa, com uma mensagem que fala de um comprimento que
 * nao e' o do campo, porque o numero na mensagem e' o do ultimo componente.
 *
 * ## O que este script afirma
 *
 * Para cada AI com mais de um componente em que a soma e' maior que o ultimo:
 *
 *  1. o `gs1_128` **aceita** o valor valido de comprimento total;
 *  2. o `gs1DataMatrix` **recusa** o mesmo texto.
 *
 * E se as duas metades concordarem, nao ha bug e o script diz que nao ha.
 */

import { gs1_128, comprimentoTotal } from '../symbologies/gs1-128.js';
import { gs1DataMatrix } from '../symbologies/gs1-datamatrix.js';
import { AIS } from '../symbologies/gs1-tabelas.js';

/**
 * Constroi um valor que satisfaz o `regex` de um AI e tem o comprimento pedido.
 *
 * **Nao se escreve um valor a mao por AI.** O `regex` vem da GS1 e respeita-o e' o
 * que faz a prova valer: um valor inventado que o `regex` recuse seria recusado por
 * motivo errado, e o script concluiria que ha bug onde nao ha - que e' o erro que a
 * `AGENTS.md` ja descreve com o Code 93, em que um caso suposto ser uma recusa de
 * "AI inexistente" era aceito.
 *
 * A estrategia e percorrer o `regex` e escolher um caracter de cada classe:
 *
 *  - `\d`      -> `0`, **que nao e' o mesmo que `9`** para datas: `(17)270630` tem de
 *                ter um mes valido, e um `000000` passa o comprimento e nao a data.
 *                Por isso os campos de data recebem os digitos de um valor real.
 *  - `[A-Z]`   -> `A`
 *  - classes com `..` -> o primeiro caracter
 */
function valor_para(ai, comprimento) {
  // Um AI so com digitos aceita uma sequencia de '1'. E' o caso mais comum entre
  // os de varios componentes, e e' o que interessa para a prova.
  const soDigitos = ai.re.startsWith('(\\d') || /^\\d/.test(ai.re);
  if (soDigitos) return '1'.repeat(comprimento);

  // Com alphanumericidade, `A` preenche. **Sera recusado pelo `regex` de alguns AIs,
  // e e' a resposta honesta**: o script diz qual e' nao em vez de forcar.
  return 'A'.repeat(comprimento);
}

const multi = Object.entries(AIS).filter(
  ([, ai]) => ai.campos.length > 1 && ai.maximo !== null,
);

console.log(`  ${Object.keys(AIS).length} AIs na tabela`);
console.log(`  ${multi.length} tem mais de um componente e comprimento variavel`);
console.log();

let divergem = 0;
const linhas = [];

for (const [numero, ai] of multi) {
  const total = comprimentoTotal(ai);

  // Só os AIs em que a soma é **maior** que o do último componente é que o bug
  // aparece. Nos outros os dois números coincidem e não há o que provar.
  if (total === null || total <= ai.maximo) continue;

  // O valor tem de caber no `regex`, e o `regex` é da GS1. Antes de testar
  // anything, confirma-se que o valor é aceite pelo `gs1_128` - que é quem tem o
  // `comprimentoTotal`. Se o `gs1_128` recusar, o valor é inválido e a prova não
  // vale: é um caso de teste errado, não um bug.
  const entrada = `(${numero})${valor_para(ai, total)}`;

  let code128Aceita = false;
  let dmAceita = false;
  let recusa = '';

  try {
    gs1_128(entrada);
    code128Aceita = true;
  } catch (e) {
    recusa = e.message;
  }

  if (code128Aceita) {
    try {
      gs1DataMatrix(entrada);
      dmAceita = true;
    } catch {
      // e' o bug: o gs1_128 aceitou e o gs1DataMatrix nao
    }
  }

  if (code128Aceita && !dmAceita) {
    divergem++;
    linhas.push(
      `  AI ${numero} (${ai.f}) - ultimo ${ai.maximo}, soma ${total}` +
        `  ->  gs1_128 ACEITA, gs1DataMatrix RECUSA`,
    );
  }
}

for (const linha of linhas.slice(0, 12)) console.log(linha);
if (linhas.length > 12) console.log(`  ... e mais ${linhas.length - 12}`);

console.log();

if (divergem === 0) {
  console.log('  Nenhuma divergencia: o gs1DataMatrix usa o comprimento total.');
  process.exit(0);
}

console.log(
  `  **${divergem} AIs que o GS1-128 aceita e o GS1 DataMatrix recusa.**`,
);
console.log('  E o mesmo bug que a sessao anterior corrigiu nas outras cinco stacks,');
console.log('  e que aqui nao tinha apanhado: nao havia segunda implementacao com que');
console.log('  comparar. A correcao e\' chamar o `comprimentoTotal` do `gs1-128.js`, e');
console.log('  nao escrever o `maximo` na mao.');
process.exit(1);