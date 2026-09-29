/**
 * Gera os casos de GS1 DataMatrix para o leitor independente.
 *
 *     node web/tests/gerar-gs1-datamatrix.mjs
 *     python web/tests/descodificar-gs1-datamatrix.py
 *
 * O `gerar-dm-fnc1.mjs` mediu o que o leitor faz **antes** deste encoder
 * existir, e o que ficou medido e' o que este script testa:
 *
 *  - `]d2` com FNC1 no início, `]d1` sem;
 *  - `ContentType.GS1` com FNC1, `Text` sem;
 *  - `0x1D` nos bytes onde está o separador;
 *  - `<GS>` no texto, e os AI entre parênteses.
 */

import { writeFileSync } from 'node:fs';
import { gs1DataMatrix } from '../symbologies/gs1-datamatrix.js';

const CASOS = [
  { entrada: '(01)04012345678901', nome: 'GTIN' },
  { entrada: '(01)04012345678901(10)LOTE-A1', nome: 'GTIN e lote' },
  { entrada: '(01)04012345678901(10)LOTE-A1(17)270630', nome: 'lote no meio' },
  { entrada: '(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630', nome: 'tres campos' },
  { entrada: '(01)04012345678901(10) LOTE-A1 (17)270630', nome: 'com espacos' },
  { entrada: '(415)0123456789012(10)LOTE-B2', nome: 'GLN e lote' },
  { entrada: '(01)04012345678901(3103)000123', nome: 'peso com decimal' },
  { entrada: '(01)04012345678901(17)275630', nome: 'data invalida', erro: true },
];

const casos = CASOS.map((caso) => {
  if (caso.erro) {
    let lancou = false;
    try {
      gs1DataMatrix(caso.entrada);
    } catch {
      lancou = true;
    }
    if (!lancou) {
      throw new Error(`o encoder ACEITOU "${caso.entrada}", que devia recusar`);
    }
    return { ...caso, modules: null, esperado: null, payload: null, separadores: 0 };
  }

  const c = gs1DataMatrix(caso.entrada);
  return {
    ...caso,
    modules: c.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
    colunas: c.colunas,
    linhas: c.linhas,
    /** A forma humana, que e' o `text` que o leitor devolve. */
    esperado: c.gs1,
    /** A forma de maquina, que e' o que vai nos `bytes`. */
    payload: c.payload,
    separadores: c.separadores,
  };
});

writeFileSync(new URL('./.gs1-datamatrix.json', import.meta.url), JSON.stringify(casos), 'utf8');
console.log(`${casos.length} casos de GS1 DataMatrix`);
