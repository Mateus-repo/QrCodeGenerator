/**
 * Gera os QR de conteudo cifrado (SQRC) para o ZXing os ler.
 *
 *   node web/tests/gerar-sqrc.mjs
 *   python web/tests/descodificar-sqrc.py
 *
 * Este e' o teste de nivel 2 do SQRC, e **nao e' um teste de descifracao**: nem
 * o ZXing descifra nem deve. O que o ZXing faz e' ler o QR e devolver **os
 * bytes do contentor**, e a propriedade que se verifica e' que sao
 * **exactamente** os bytes que lhe foram dados.
 *
 * Por que e' esta e nao outra: um SQRC que o ZXing le com **um byte a mais ou a
 * menos** parece um QR normal, e a falha so apareceria a quem tentasse
 * descifrar - com o erro de "chave errada". A pista errada com que se fica e'
 * metade do problema: quem vai ao terreno verificar a etiqueta vaisuspeitar do
 * software e nao do codigo.
 *
 * E' por isso que este nivel compara **bytes** e nao texto. Uma comparacao de
 * texto normalizaria o que sobrasse e perderia exactamente a diferenca que
 * importa.
 *
 * Este script escreve o ficheiro e nao escreve para a saida standard, por uma
 * razao pouco obvia: o `>` do Windows PowerShell 5.1 produz UTF-16 e nao UTF-8,
 * e o Python depois falha a ler o JSON.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqrc } from '../sqrc.js';
import { encode } from '../qrcode.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.sqrc.json');

/*
 * Os casos, e a razao de cada um.
 *
 * **O `id` de comprimentos diferentes e' o que prova que a versao cresce.** Com
 * um unico comprimento, um contentor que ignora o `id` e' indistinguivel de um
 * que o respeita — e a falha apareceria so a quem tivesse SQRC de chaves
 * diferentes no mesmo sistema, que e' exactamente o caso de uso do `id`.
 */
const CASOS = [
  { nome: 'curto', conteudo: 'A', id: [] },
  { nome: 'id-1-byte', conteudo: 'PECA-4471', id: [7] },
  { nome: 'id-3-bytes', conteudo: 'ARMAZEM-A/2026/09/LOTE-4471', id: [0x10, 0x20, 0x30] },
  { nome: 'id-16-bytes', conteudo: 'chave-de-armazem-lisboa', id: Array.from({ length: 16 }, (_, i) => i) },
  { nome: 'com-acentos', conteudo: 'peça-francesa — cœur — 30 €', id: [9] },
  { nome: 'longo', conteudo: 'X'.repeat(200), id: [1, 2] },
  { nome: 'vazio', conteudo: '', id: [] },
];

/**
 * A chave de todos os casos.
 *
 * **A mesma chave para todos**, de proposito. E' o que torna o teste mais forte
 * de uma maneira que nao se ve: se cada SQRC tivesse a sua chave, um bug que
 * trocasse o nonce entre casos passaria despercebido, porque cada um se
 * descifraria bem sozinho. Com uma chave so, um nonce trocado da erro.
 *
 * E o mesmo nonce de cada vez que nao pode acontecer: o `sqrc()` cria um
 * `crypto.getRandomValues` novo de cada vez, e um bug ai daria dois SQRC
 * identicos — o que o `descodificar-sqrc.py` verifica.
 */
const CHAVE_CRUA = new Uint8Array(32).map((_, i) => (i * 7 + 13) % 256);

const principal = {
  name: 'AES-GCM',
  length: 256,
};

async function chaveDeTeste() {
  const material = await crypto.subtle.importKey('raw', CHAVE_CRUA, principal, false, ['encrypt', 'decrypt']);
  return material;
}

const chave = await chaveDeTeste();
const casos = [];

for (const caso of CASOS) {
  const codigo = await sqrc(caso.conteudo, chave, new Uint8Array(caso.id));

  /*
   * **A base64 vai no JSON em vez dos bytes crus.**
   *
   * O `JSON.stringify` de um `Uint8Array` da `{"0":31,"1":...}`, que sao
   * indices e nao bytes. E um contentor de 300 bytes em JSON assim fica com
   * seis caracteres por byte, e a diferenca entre `31` e `[31]` passa a ser um
   * bug de codificacao e nao um bug de SQRC.
   */
  casos.push({
    nome: caso.nome,
    base64: codigo.base64,
    tamanho: codigo.bytes.length,
    versao: codigo.campos.versao,
    tamanhoId: caso.id.length,
  });

  /*
   * E o QR, com a base64 como conteudo, que e' o que vai no codigo de barras.
   *
   * **A matriz vai como array de arrays e nao como o que o `encode` devolve.**
   * O `modules` do encoder e' um array de `Uint8Array`, e o `JSON.stringify`
   * de um `Uint8Array` da `{"0":1,"1":1,...}` — sao indices como chaves, nao
   * valores. O Python lia um dicionario em vez de uma lista, e o
   * `modulos[0]` dava `KeyError: 0` — que e' uma mensagem que nao tem nada a
   * ver com o que se estava a fazer.
   *
   * Os outros geradores de nivel 2 fazem o mesmo, e a razao e' a mesma: e' o
   * JSON que tem de se ler, e o JSON nao tem `Uint8Array`.
   */
  const { modules, version, ecl } = encode(codigo.base64, { ecLevel: 'M' });

  casos[casos.length - 1].modulos = modules.length;
  casos[casos.length - 1].versaoQr = version;
  casos[casos.length - 1].nivelQr = ecl;
  casos[casos.length - 1].conteudo = [...modules].map((linha) => [...linha]);
}

writeFileSync(SAIDA, JSON.stringify({ casos, chaveBase64: Buffer.from(CHAVE_CRUA).toString('base64') }, null, 1));

console.log(`${CASOS.length} SQRC gerados`);
for (const c of casos) {
  console.log(`  ${c.nome.padEnd(14)} ${String(c.tamanho).padStart(4)} bytes, versao ${c.versao}, QR ${c.modulos}x${c.modulos}`);
}
