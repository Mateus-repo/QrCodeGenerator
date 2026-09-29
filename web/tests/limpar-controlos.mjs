/**
 * Limpa os caracteres de controlo literais de um ficheiro, por ponto de codigo.
 *
 *     node web/tests/limpar-controlos.mjs <ficheiro>
 *
 * **Por que e' que isto e' preciso.** Escrever `'\u0000'` num ficheiro atraves
 * da ferramenta de escrita, ou escrever o caractere de controlo directamente,
 * dao o mesmo resultado: o Node e o Python leem o ficheiro como texto, mas o
 * caractere de controlo fica la e conta como uma entrada. O sintoma e' sempre o
 * mesmo - uma tabela que devia ter 64 entradas tem 81, e `node --check` aprova.
 *
 * Nao ha nada de errado com o Node, nem com o editor: um byte 0x00 e' um byte
 * valido num ficheiro de texto, e o que falha e' a **intencao** - um `TABELA`
 * com 64 elementos e' uma lista de codigos, nao de caracteres. A lista de
 * codigos tem de ser escrita com escapes, e e' por isso que a correccao e' feita
 * depois de escrever e nao antes.
 *
 * Este script substitui cada caractere de controlo pelo escape que o produz, e
 * **conta o que trocou** - um script que corrige em silencio e' um script em que
 * nao se pode confiar.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const caminho = process.argv[2];
if (!caminho) {
  console.error('uso: node web/tests/limpar-controlos.mjs <ficheiro>');
  process.exit(2);
}

let texto = readFileSync(caminho, 'utf8');
let trocados = 0;

// Os controlos que interessam: tudo abaixo de 0x20 mais o DEL. O tabulador e o
// LF e o CR ficam de fora de proposito - sao separadores de linha legitimos.
for (let c = 0; c < 0x20; c++) {
  if (c === 0x09 || c === 0x0a || c === 0x0d) continue;

  const caractere = String.fromCharCode(c);
  if (!texto.includes(caractere)) continue;

  const quantos = texto.split(caractere).length - 1;
  // O escape tem de ter quatro digitos hexadecimais, para o 0x09 e o 0x0d
  // darem a mesma largura que os outros.
  const escape = '\\u' + c.toString(16).padStart(4, '0');
  texto = texto.split(caractere).join(escape);
  trocados += quantos;
}

const del = String.fromCharCode(0x7f);
if (texto.includes(del)) {
  trocados += texto.split(del).length - 1;
  texto = texto.split(del).join('\\u007f');
}

writeFileSync(caminho, texto, 'utf8');

/** Quantos controlos literais ficaram, que tem de ser zero. */
const restantes = [...texto].filter((c) => {
  const n = c.charCodeAt(0);
  return (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || n === 0x7f;
}).length;

console.log(`${caminho}: ${trocados} trocados, ${restantes} controlos literais restantes`);
process.exit(restantes === 0 ? 0 : 1);
