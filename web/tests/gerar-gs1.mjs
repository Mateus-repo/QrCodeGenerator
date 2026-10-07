/**
 * Gera os casos de GS1-128 para o leitor independente.
 *
 *     node web/tests/gerar-gs1.mjs
 *     python web/tests/descodificar-gs1.py
 *
 * Os casos vem do `python-barcode` nao para copiar - ele **nao emite separadores**,
 * e e' exactamente o que esta em falta - mas para ter uma segunda implementacao
 * do mesmo FNC1 do inicio com que comparar o tamanho. A verificacao e' o ZXing.
 */

import { gs1_128 } from '../symbologies/gs1-128.js';

const CASOS = [
  // O GTIN sozinho, o caso mais simples: um campo de comprimento fixo.
  { entrada: '(01)04012345678901', nome: 'GTIN' },

  // GTIN e lote: o lote e' de comprimento variavel e vai no fim, por isso
  // **nao leva separador**. E' a regra "menos no ultimo".
  { entrada: '(01)04012345678901(10)LOTE-A1', nome: 'GTIN e lote' },

  // O mesmo, com o lote no meio: ai leva separador, porque ha campo depois.
  { entrada: '(01)04012345678901(10)LOTE-A1(17)270630', nome: 'lote no meio' },

  // Tres campos, dois variaveis, um fixo no fim.
  { entrada: '(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630', nome: 'tres campos' },

  // Espacos a volta do valor: a GS1 escreve assim nos exemplos e o espaco
  // nao faz parte do valor.
  { entrada: '(01)04012345678901(10) LOTE-A1 (17)270630', nome: 'com espacos' },

  // A data invalida: o mes 56 nao existe, e o regex da GS1 tem de recusar.
  { entrada: '(01)04012345678901(17)275630', nome: 'data invalida', erro: true },

  // O AI 415, um GLN de 13 digitos - outro campo fixo.
  { entrada: '(415)0123456789012(10)LOTE-B2', nome: 'GLN e lote' },

  // A posicao decimal implicita: 3103 e' "peso em quilos com 3 casas".
  { entrada: '(01)04012345678901(3103)000123', nome: 'peso com decimal' },
];

const casos = [];
for (const caso of CASOS) {
  if (caso.erro) {
    let lancou = false;
    try {
      gs1_128(caso.entrada);
    } catch {
      lancou = true;
    }
    if (!lancou) {
      throw new Error(`o encoder ACEITOU "${caso.entrada}", que devia recusar`);
    }
    casos.push({ ...caso, modulos: null, esperado: null });
    continue;
  }

  const c = gs1_128(caso.entrada);
  /*
   * O `gs1` e' a forma legivel, com os AIs entre parenteses - e e' o que se mostra
   * ao utilizador e o que o ZXing devolve em `text`. O `payload` e' a forma de
   * maquina, sem parenteses, com o separador **so depois de um campo variavel que
   * nao seja o ultimo** - e e' o que o ZXing devolve em `bytes`.
   *
   * As duas coisas sao do encoder, e nao se reconstroem aqui. A primeira versao
   * deste script montava o seu proprio payload juntando um separador entre todos
   * os campos, e o teste falhava em seis de oito - nao por o encoder estar
   * errado, mas por o gerador estar. Reconstruir aqui o que o encoder ja devolve
   * e' criar uma segunda fonte de verdade sobre a mesma regra, e e' assim que as
   * duas diviram.
   */
  /*
   * O `modules` e' o nome do campo no encoder, e nao `modulos`.
   *
   * **Este era um bug, e um bug que fazia o nivel 2 nao existir.** O script pedia
   * `c.modulos`, que da `undefined`, e o `JSON.stringify` **nao escreve uma chave
   * cujo valor e' `undefined`** — o `.gs1.json` saia sem `modulos`, e o
   * `descodificar-gs1.py` acabava em `KeyError: 'modulos'`.
   *
   * A `AGENTS.md` chama a isto o que ja aconteceu tres vezes: **o teste correu, e
   * o que ele exercita nao era a coisa defeituosa**. O erro aparecia — um
   * `KeyError` nao e' silencioso — mas **ninguem corria o script**, porque o
   * comando de leitura e' um passo a mais depois da suite e nao faz parte dela.
   *
   * A convencao do repositorio e' `modules` em todas as linguagens, e e' a que o
   * `linear.js` e o `app.js` leem. O `linear.test.mjs` verifica que cada registo
   * sabe codificar o seu exemplo, e e' por isso que apanha um nome errado **no
   * encoder**; o que nao apanha e' um nome errado **no gerador dos casos**.
   */
  casos.push({
    ...caso,
    modulos: c.modules,
    gs1: c.gs1,
    payload: c.payload,
    separadores: c.separadores,
    esperado: c.gs1,
  });
}

const { writeFileSync } = await import('node:fs');
const caminho = new URL('./.gs1.json', import.meta.url);
writeFileSync(caminho, JSON.stringify(casos), 'utf8');
console.log(`${casos.length} casos GS1-128 em ${caminho.pathname}`);
