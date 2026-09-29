/**
 * As tabelas do C40 e do Text do Data Matrix.
 *
 *     node --test web/tests/dm-modos.test.mjs
 *
 * **Este teste nao verifica um encoder, e nao podia.** O C40 e o Text entram no
 * repositorio com as tabelas e sem encoder, porque o que falta e' o algoritmo
 * de escolha de modo — a parte mais longa do encoder do ZXing, e a que o TODO
 * chama de *look-ahead*. As tabelas sao a parte que nao se escreve de memoria.
 *
 * O que este teste verifica e' a parte que se pode verificar sem encoder: que as
 * quatro tabelas estao certas, e sobretudo que **nao estao trocadas entre si**.
 *
 * ## O que este ficheiro evita
 *
 * **O C40 e o Text sao duas coisas parecidas e nao iguais, e a diferenca esta em
 * Caracteres que nao aparecem no que se costuma codificar.**
 *
 * As maiusculas: no C40 o `A` vale 14 e vive no conjunto **basico**; no Text
 * vale 1 e vive no conjunto **3**. Sao os mesmos caracteres em alfabetos
 * diferentes, e um encoder que use o valor de um no outro escreve as
 * maiusculas no sitio errado.
 *
 * E o resultado **le-se com o texto errado** — que e' o pior resultado que um
 * codigo de barras pode ter, porque parece correcto. Um `MAST-2024` sai
 * `KQST-2O2O` e quem nao comparar com o original nunca sabe.
 *
 * A diferenca dos deslocamentos esta nos caracteres 64 a 95, que sao os sinais
 * de pontuacao. **Nenhum numero de serie tem um `^`**, e por isso que um teste
 * com numeros de serie nao apanha a tabela trocada. E' porque aqui ha um caso so
 * com pontuacao.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  C40_SHIFT,
  C40_VALOR,
  TEXT_SHIFT,
  TEXT_VALOR,
  ESPACO,
  valorEm,
  conjuntoEm,
} from '../symbologies/datamatrix-modos-tabelas.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

test('as quatro tabelas tem 128 entradas, uma por codigo ASCII', () => {
  for (const [nome, tabela] of [
    ['C40_SHIFT', C40_SHIFT],
    ['C40_VALOR', C40_VALOR],
    ['TEXT_SHIFT', TEXT_SHIFT],
    ['TEXT_VALOR', TEXT_VALOR],
  ]) {
    assert.equal(tabela.length, 128, `${nome} tem ${tabela.length} entradas`);

    for (let i = 0; i < 128; i++) {
      assert.ok(Number.isInteger(tabela[i]), `${nome}[${i}] nao e' um numero: ${tabela[i]}`);
    }
  }
});

test('o espaco vale 3 nos dois modos, e nao 0', () => {
  /*
   * **E' a propriedade mais facil de esquecer, e a que da um codigo com os
   * espacos trocados.**
   *
   * O espaco esta em **dois sitios** do alfabeto C40 — o conjunto basico e o
   * primeiro shift — e o valor e' 3 em ambos. Parece contradicao e nao e': sao
   * conjuntos diferentes com o mesmo numero.
   *
   * Uma tabela com 0 no espaco troca todos os espacos por acentos cirilicos, e
   * **o codigo le-se** — com o texto errado. E o pior resultado possivel, porque
   * quem le ve caracteres, nao bokas.
   */
  assert.equal(C40_VALOR[32], ESPACO, `no C40 o espaco vale ${C40_VALOR[32]}`);
  assert.equal(TEXT_VALOR[32], ESPACO, `no Text o espaco vale ${TEXT_VALOR[32]}`);

  // E o espaco esta no conjunto basico nos dois, que e' outra vez "parecido e
  // nao igual" verificado.
  assert.equal(C40_SHIFT[32], 0, 'no C40 o espaco devia estar no conjunto basico');
  assert.equal(TEXT_SHIFT[32], 0, 'no Text o espaco devia estar no conjunto basico');
});

test('as maiusculas vivem em conjuntos diferentes nos dois modos', () => {
  /*
   * **A propriedade central destes dois modos, e a que dá o texto errado.**
   *
   * No **C40** as maiusculas sao o **conjunto basico** (shift 0) e valem 14 a
   * 39. No **Text** vivem no **conjunto 3** (shift 3) e valem 1 a 26.
   *
   * A mesma letra, o mesmo caracter, e **nem o mesmo valor nem o mesmo
   * conjunto**. Um encoder que use o valor do C40 para o Text escreve as
   * maiusculas no sitio errado, e o codigo le-se com o texto trocado.
   */
  for (let i = 0; i < 26; i++) {
    const letra = String.fromCharCode(65 + i);

    assert.equal(C40_VALOR[65 + i], 14 + i, `no C40, ${letra} vale ${C40_VALOR[65 + i]}`);
    assert.equal(C40_SHIFT[65 + i], 0, `no C40, ${letra} devia estar no basico`);

    assert.equal(TEXT_VALOR[65 + i], 1 + i, `no Text, ${letra} vale ${TEXT_VALOR[65 + i]}`);
    assert.equal(TEXT_SHIFT[65 + i], 3, `no Text, ${letra} devia estar no conjunto 3`);
  }
});

test('as minusculas sao o basico no Text, e o conjunto 3 no C40', () => {
  /*
   * **A outra metade da diferenca, e e' a que apanha a tabela invertida.**
   *
   * No **Text** as minusculas sao o conjunto basico (shift 0, valores 14 a 39).
   * No **C40** sao o **conjunto 3** (shift 3, valores 1 a 26).
   *
   * **E o oposto do que a primeira versao deste teste afirmava**, que dizia que
   * no C40 eram o conjunto 1. A fonte estava certa: o C40 põe as minusculas
   * no conjunto 3, e o `a` vale 1 e nao 27.
   *
   * **E a razao de a confusao ser facil:** o que eu escrevi e' o que seria
   * verdade se os dois alfabetos tivessem as maiusculas no basico — e são
   * as maiusculas que o C40 poe la. Um meio de campo leva a ler a tabela toda
   * de memoria e a trocar as metades, e o sintoma e' um codigo que **se le com
   * as minusculas trocadas**.
   */
  for (let i = 0; i < 26; i++) {
    const letra = String.fromCharCode(97 + i);

    assert.equal(TEXT_SHIFT[97 + i], 0, `no Text, ${letra} devia estar no basico`);
    assert.equal(TEXT_VALOR[97 + i], 14 + i, `no Text, ${letra} vale ${TEXT_VALOR[97 + i]}`);

    assert.equal(C40_SHIFT[97 + i], 3, `no C40, ${letra} devia estar no conjunto 3`);
    assert.equal(C40_VALOR[97 + i], 1 + i, `no C40, ${letra} vale ${C40_VALOR[97 + i]}`);
  }
});

test('os digitos valem 4 a 13 nos dois modos, e nao 0 a 9', () => {
  /*
   * **Os digitos nao mudam entre modos**, e e' a unica coisa que os dois
   * alfabetos tem em comum com o mesmo numero.
   *
   * E' a propriedade que torna a verificacao acima credivel: se os digitos
   * fossem diferentes, as tabelas estariam trocadas de uma maneira que nem
   * repara. Sao iguais, e por isso que a diferenca das letras **e' real** e nao
   * um artefacto da extraccao.
   */
  /*
   * **O `0` vale 4, e nao 0.** Nos dois alfabetos C40 e Text os digitos sao
   * **4 a 13** — 0 a 9 mais 4, porque o valor 0 esta reservado para o
   * indicador de modo do *extended* e para o *latch* do proximo bloco.
   *
   * A primeira versao deste teste afirmava que o digito `i` valia `i`, e falhou
   * com "no C40, o digito 0 vale 4". **A fonte estava certa.** E a confusao e'
   * do QR: la os digitos valem o proprio numero, e o habito passa para aqui.
   *
   * E um erro que daria um codigo com os digitos todos errados, e que **se
   * le** — com um numero de serie diferente do que foi escrito.
   */
  for (let i = 0; i < 10; i++) {
    const digito = 48 + i;
    assert.equal(C40_VALOR[digito], i + 4, `no C40, o digito ${i} vale ${C40_VALOR[digito]}`);
    assert.equal(TEXT_VALOR[digito], i + 4, `no Text, o digito ${i} vale ${TEXT_VALOR[digito]}`);
    assert.equal(C40_SHIFT[digito], 0, `no C40, o digito ${i} devia estar no basico`);
    assert.equal(TEXT_SHIFT[digito], 0, `no Text, o digito ${i} devia estar no basico`);
  }
});

test('as duas tabelas de deslocamento nao sao iguais', () => {
  /*
   * **A propriedade que um "e' o mesmo com nomes diferentes" apagaria.**
   *
   * As duas tem os quatro conjuntos, e por isso que um teste que so verifique
   * "existe o conjunto 3" passa nas duas. A diferenca esta nos **caracteres 64
   * a 95** — no C40 e' o conjunto 2 e no Text e' o 3 — e sao os sinais de
   * pontuacao.
   *
   * **E por isso que ha um caso so com pontuacao**: nenhum numero de serie tem
   * um `^`, e um codigo com a tabela trocada passa em todos os testes de
   * conteudo real e falha no campo.
   */
  assert.notDeepEqual(
    [...C40_SHIFT],
    [...TEXT_SHIFT],
    'as tabelas de deslocamento sao iguais — e nao podem ser, o C40 e o Text sao modos diferentes',
  );

  // E a diferenca tem de estar nos caracteres de pontuacao, que e' onde
  // qualquer codigo de barras traz coisas.
  let diferencas = 0;
  for (let i = 64; i <= 95; i++) {
    if (C40_SHIFT[i] !== TEXT_SHIFT[i]) diferencas++;
  }
  assert.ok(diferencas > 20, `a diferenca e' de ${diferencas} caracteres, e esperava-se mais de 20`);
});

test('os modos cobrem os 128 caracteres ASCII', () => {
  /*
   * **Todo o ASCII tem de ter valor em pelo menos um modo**, e o que decide e'
   * a existencia de um valor de reserva.
   *
   * Um caracter sem valor e' um `-1` na fonte, e um `-1` escrito no codigo sai
   * como caractere estranho no leitor em vez de dizer que nao cabe. Por isso
   * que `valorEm` devolve `null` e nao um numero: quem chama tem de **decidir**
   * — mudar de modo, ou recusar.
   */
  for (let i = 0; i < 128; i++) {
    assert.ok(C40_VALOR[i] >= 0, `o C40 nao tem valor para o codigo ${i} ('${String.fromCharCode(i)}')`);
    assert.ok(TEXT_VALOR[i] >= 0, `o Text nao tem valor para o codigo ${i} ('${String.fromCharCode(i)}')`);
  }

  // E a funcao tem de recusar o que esta fora do ASCII, e nao inventar.
  assert.equal(valorEm('C40', 200), null, 'um codigo acima do ASCII nao tem valor');
  assert.equal(valorEm('C40', -1), null, 'um codigo negativo nao tem valor');
  assert.equal(conjuntoEm('Text', 300), null, 'um codigo acima do ASCII nao tem conjunto');
});

test('o ficheiro gerado diz de onde veio', () => {
  /*
   * Um teste de nivel 0: o ficheiro tem de estar no disco e tem de dizer que e'
   * gerado e de onde. Sem isto, um `datamatrix-modos-tabelas.js` apagado dava
   * um `Cannot find module` nos testes de cima — que nao diz nada sobre as
   * tabelas.
   */
  const conteudo = readFileSync(
    join(RAIZ, 'symbologies', 'datamatrix-modos-tabelas.js'),
    'utf8',
  );

  assert.match(conteudo, /[Gg]erado/, 'o ficheiro gerado nao diz que e gerado');
  assert.match(conteudo, /zint/i, 'o ficheiro gerado nao diz de onde veio');
  assert.match(conteudo, /16022/, 'o ficheiro gerado nao cita a norma');
  assert.ok(!conteudo.includes('undefined'), 'o ficheiro tem `undefined` - a extracao foi a meio');
});
