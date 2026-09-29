/**
 * Gera os casos de Code 32 para o leitor independente.
 *
 *     node web/tests/gerar-code32.mjs
 *     python web/tests/descodificar-code32.py
 *
 * O Code 32 **nao tem leitor proprio no ZXing**, ao contrario de todos os outros
 * codigos de barras deste repositorio. O `Code32` existe no enum e tem escritor
 * - o que permite gerar uma referencia - mas nao tem `Code32Reader.java`.
 *
 * O que o ZXing le, ao encontrar este codigo, e' **Code 39**, porque o Code 32 e'
 * um Code 39 com outra checksum e o leitor nao tem como saber a checksum a
 * priori. E' o que a regra do repositorio obriga a verificar: nao interessa o
 * nome que o ZXing da, interessa o texto que ele devolve.
 */

import { writeFileSync } from 'node:fs';
import { code32 } from '../symbologies/code32.js';

const CASOS = [
  { entrada: '12345', nome: 'cinco digitos' },
  { entrada: '0', nome: 'um digito' },
  { entrada: '9', nome: 'nove' },
  { entrada: '999999', nome: 'seis noves' },
  { entrada: '88888888', nome: 'oito oitos' },
  { entrada: '03176752', nome: 'issn de revista' },

  // **O maximo sao oito digitos.** O limite veio do Zint, que recusa com
  // "Input length 10 too long (maximum 8)", e nao de um numero inventado.
  // Sem esta verificacao, um numero de dez digitos produzia um codigo que se
  // desenhava bem e nao era um Code 32.
  { entrada: '123456789', nome: 'nove digitos', erro: true },
  { entrada: '1234567890', nome: 'dez digitos', erro: true },

  // So digitos: qualquer outra coisa nao e' um Code 32, e a mensagem tem de
  // dizer porquê - que o Code 32 e' o codigo do sector das revistas.
  { entrada: 'ABC', nome: 'letras', erro: true },
  { entrada: '123-45', nome: 'com hifen', erro: true },
  { entrada: '12 345', nome: 'com espaco', erro: true },
];

const casos = CASOS.map((caso) => {
  if (caso.erro) {
    let lancou = false;
    try {
      code32(caso.entrada);
    } catch {
      lancou = true;
    }
    if (!lancou) {
      throw new Error(`o encoder ACEITOU "${caso.entrada}", que devia recusar`);
    }
    return { ...caso, modules: null, guards: [], caption: null };
  }

  const c = code32(caso.entrada);
  return { ...caso, modules: c.modules, guards: c.guards, caption: c.caption };
});

writeFileSync(new URL('./.code32.json', import.meta.url), JSON.stringify(casos), 'utf8');
console.log(`${casos.length} casos de Code 32`);
