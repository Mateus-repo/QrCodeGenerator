/**
 * As tabelas dos codigos de barras, comparadas com as de referencia.
 *
 * Existe por causa de um erro que aconteceu duas vezes. Escrever a tabela de
 * um codigo de barras de memoria da errado — o Code 39 saiu com doze
 * elementos por caractere em vez de nove, e o ITF ficou com dois elementos na
 * moldura de paragem em vez de tres. Nos dois casos o codigo desenhava-se com
 * o aspecto de estar certo, os testes passavam, e o leitor devolvia outra
 * coisa, ou nada.
 *
 * Por isso as tabelas nao sao "confia em mim". Sao comparadas, entrada a
 * entrada, com as do `python-barcode` — uma implementacao de referencia em
 * Python puro, cujas tabelas estao no codigo-fonte em forma legivel. Uma
 * transcricao errada passa a ser um teste vermelho, e nao um codigo que nao le.
 *
 * Este e um teste de NIVEL 0: diz que a tabela esta certa, antes de qualquer
 * discussao sobre codificacao. O teste de leitura, em
 * `descodificar-lineares.py`, diz se o codigo funciona.
 *
 *     python web/tests/extrair-tabelas.py
 *     node --test "web/tests/*.test.mjs"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALFABETO_CODE39, PADROES_CODE39 } from '../symbologies/code39.js';
import { INICIO_ITF, PARAGEM_ITF, PADROES_ITF } from '../symbologies/itf.js';
import { PADROES_CODABAR, INICIO_PARAGEM_CODABAR } from '../symbologies/codabar.js';
import { L, R, GUARDA_INICIO, GUARDA_CENTRO, GUARDA_FIM } from '../symbologies/upcean.js';

const aqui = dirname(fileURLToPath(import.meta.url));
// Nao se chama JSON: o nome tapava o JSON global, e JSON.parse deixava de existir.
const CAMINHO = join(aqui, '.tabelas.json');

/**
 * Sem a referencia, o teste nao corre — e diz porquê.
 *
 * Saltá-lo em silencio seria pior do que falhar: a tabela nao verificada e
 * exactamente o que produziu os dois bugs que estes testes existem para apanhar.
 */
const temReferencia = existsSync(CAMINHO);

if (!temReferencia) {
  test('as tabelas de referencia estao disponiveis', () => {
    assert.fail(
      'falta web/tests/.tabelas.json — corre "python web/tests/extrair-tabelas.py" ' +
        '(precisa de "pip install python-barcode")',
    );
  });
} else {
  const referencia = JSON.parse(readFileSync(CAMINHO, 'utf8'));

  // --- Code 39 ------------------------------------------------------------

  test('Code 39: o alfabeto, pela mesma ordem', () => {
    // A ordem nao e arbitraria: e o valor de cada caractere para o digito de
    // controlo mod 43. Trocar dois caracteres diferentes nao muda o desenho de
    // nenhum padrao, e muda o digito de controlo.
    assert.deepEqual(ALFABETO_CODE39, referencia.code39.alfabeto);
  });

  test('Code 39: os 43 padroes, um a um', () => {
    assert.equal(PADROES_CODE39.length, 43, 'esperava 43 padroes');
    assert.deepEqual([...PADROES_CODE39], referencia.code39.padroes);
  });

  test('Code 39: cada padrao da nove elementos, tres deles largos', () => {
    // A verificacao que apanha a classe de erro do "doze elementos".
    for (const [i, padrao] of PADROES_CODE39.entries()) {
      const larguras = contarCorridas(padrao);
      assert.equal(
        larguras.length,
        9,
        `padrao ${i} ("${padrao}") tem ${larguras.length} elementos, e devem ser 9`,
      );
      const largos = larguras.filter((l) => l > 1).length;
      assert.equal(largos, 3, `padrao ${i} ("${padrao}") tem ${largos} largos, e devem ser 3`);
      assert.equal(
        larguras.reduce((a, b) => a + b, 0),
        padrao.length,
        `padrao ${i}: a soma das larguras nao da o comprimento da cadeia`,
      );
    }
  });

  // --- ITF ----------------------------------------------------------------

  test('ITF: as molduras e os dez padroes', () => {
    assert.equal(INICIO_ITF, referencia.itf.inicio);
    assert.equal(
      PARAGEM_ITF,
      referencia.itf.paragem,
      'a moldura de paragem tem tres elementos e termina em barra',
    );
    // A tabela do ITF e um objecto com os digitos como chaves, nao uma lista.
    assert.deepEqual(Object.values(PADROES_ITF), referencia.itf.padroes);
  });

  test('ITF: cada padrao tem cinco elementos com dois largos', () => {
    for (const [i, padrao] of Object.values(PADROES_ITF).entries()) {
      assert.equal(padrao.length, 5, `padrao ${i} ("${padrao}") nao tem cinco elementos`);
      const largos = [...padrao].filter((c) => c === 'W' || c === 'w').length;
      assert.equal(largos, 2, `padrao ${i} ("${padrao}") nao tem dois elementos largos`);
    }
  });

  test('ITF: a moldura de paragem acaba em barra', () => {
    // Sem a barra final o leitor nao sabe onde acaba o codigo. Foi
    // precisamente o que faltava na primeira versao.
    assert.equal(PARAGEM_ITF.length % 2, 1, 'a paragem tem um elemento a mais: a barra final');
    assert.equal(
      PARAGEM_ITF[PARAGEM_ITF.length - 1],
      'N',
      `a paragem deve terminar em barra estreita, e termina em "${PARAGEM_ITF[PARAGEM_ITF.length - 1]}"`,
    );
  });

  // --- Codabar ------------------------------------------------------------

  test('Codabar: os dezasseis caracteres e os quatro de paragem', () => {
    assert.deepEqual(PADROES_CODABAR, referencia.codabar.padroes);
    assert.deepEqual(INICIO_PARAGEM_CODABAR, referencia.codabar.inicioParagem);
  });

  test('Codabar: cada padrao tem sete elementos', () => {
    for (const [chave, padrao] of Object.entries({
      ...PADROES_CODABAR,
      ...INICIO_PARAGEM_CODABAR,
    })) {
      assert.equal(padrao.length, 7, `"${chave}" ("${padrao}") nao tem sete elementos`);
    }
  });

  // --- UPC/EAN ------------------------------------------------------------

  test('UPC/EAN: as tabelas L e R, e as guardas', () => {
    assert.deepEqual(Object.values(L), referencia.upcean.l);
    assert.deepEqual(Object.values(R), referencia.upcean.r);
    assert.equal(GUARDA_INICIO, referencia.upcean.guardaInicio);
    assert.equal(GUARDA_CENTRO, referencia.upcean.guardaCentro);
  });

  test('UPC/EAN: cada codigo de combinacao tem sete modulos', () => {
    for (const [digito, codigo] of Object.entries(L)) {
      assert.equal(codigo.length, 7, `L${digito} ("${codigo}") nao tem sete modulos`);
    }
    for (const [digito, codigo] of Object.entries(R)) {
      assert.equal(codigo.length, 7, `R${digito} ("${codigo}") nao tem sete modulos`);
    }
  });

  test('UPC/EAN: a guarda final e o inverso da guarda de inicio', () => {
    // Sanidade estrutural: sao 101 as duas, e e o que fecha o codigo.
    assert.equal(GUARDA_INICIO, '101');
    assert.equal(GUARDA_FIM, '101');
    assert.equal(GUARDA_CENTRO, '01010');
  });
}

/** Quantas corridas de caracteres iguais tem a cadeia, e com que largura. */
function contarCorridas(cadeia) {
  const larguras = [];
  let atual = cadeia[0];
  let n = 0;
  for (const bit of cadeia) {
    if (bit === atual) n += 1;
    else {
      larguras.push(n);
      atual = bit;
      n = 1;
    }
  }
  larguras.push(n);
  return larguras;
}
