/**
 * Gera os SQRC **com logotipo** para o ZXing os ler.
 *
 *   node web/tests/gerar-sqrc-frameqr.mjs
 *   python web/tests/descodificar-sqrc-frameqr.py
 *
 * Este e' o **nivel 3 do SQRC**: nao e' a cifra que se verifica, e' o que
 * **sai do cliente** depois de apagados os modulos para o logotipo caber.
 *
 * ## Porque e' um ficheiro a parte
 *
 * Porque o `descodificar-sqrc.py` verifica uma coisa e este verifica outra, e
 * juntá-las seria verificar duas coisas com uma:
 *
 *  - o `descodificar-sqrc.py` diz que **os bytes do contentor chegam intactos**.
 *    E' a propriedade da cifra, e verifica-se sem logótipo;
 *  - este diz que **o QR com a zona apagada ainda se lê**. E' a propriedade da
 *    correcção de erros, e é a que se estraga com um logotipo.
 *
 * E a razao de serem separados: **um codigo com a zona apagada que nao lê dá
 * "chave errada"** a quem tentar descifrar. O sintoma aponta para a chave, que
 * esta impecavel, e nao para o codigo, que tem um buraco do tamanho de um
 * logotipo. E' o mesmo mecanismo do bug do descentrado de quatro modulos: o QR
 * continuava a ler, o desenho saia torto, e nenhum teste falhava. **Por isso o
 * que se exporta tem de se ler E estar no sitio.**
 *
 * ## O que se compara
 *
 * **Os bytes, e nao o texto.** A base64 que volta tem de ser **identica** a que
 * entrou. Um modulo apagado a mais produz um QR que ainda se lê — com o texto
 * errado — e a unica forma de o apanhar e' comparar a base64 caractere a
 * caractere.
 *
 * E ha o **controlo**: cada payload vai duas vezes, uma sem logotipo e uma com.
 * Sem o controlo, um renderizador de teste defeituoso aparece como "a correcção
 * de erros não funciona", e a investigação começa pelo sitio errado.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encode } from '../qrcode.js';
import { aplicarFrame, modulosMaximos } from '../frameqr.js';
import { sqrc } from '../sqrc.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.sqrc-frameqr.json');

/** Os mesmos conteudos do nivel 2, para comparar. */
const PAYLOADS = [
  'https://exemplo.pt',
  'https://exemplo.pt/painel/2026/09/inventario/peca-4471/lote-a1',
  'PEÇA-4471-BRANCO, lote 2026/09, prateleira B-12',
];

const NIVEIS = ['M', 'Q', 'H'];

/*
 * A chave de todos os casos.
 *
 * **A mesma, e por uma razao que o `gerar-sqrc.mjs` ja explica**: se cada SQRC
 * tivesse a sua, um bug que trocasse o nonce entre casos passava despercebido.
 * Com uma chave so, um nonce trocado da erro.
 *
 * E o **id de 3 bytes** em todos: e' o que prova que a versao cresce com o
 * `id` no caminho do browser, e nao so no modulo. Um contentor com id que
 * apanha a versao errada desenha-se bem e nao descifra.
 */
const CHAVE_CRUA = new Uint8Array(32).map((_, i) => (i * 7 + 13) % 256);
const ID = new Uint8Array([0x10, 0x20, 0x30]);

const casos = [];

const material = await crypto.subtle.importKey(
  'raw',
  CHAVE_CRUA,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);

for (const conteudo of PAYLOADS) {
  for (const ecl of NIVEIS) {
    const codigoSqrc = await sqrc(conteudo, material, ID);
    const base64 = codigoSqrc.base64;

    const qr = encode(base64, { ecLevel: ecl });
    const maximo = modulosMaximos(qr.size, ecl);

    /*
     * **Quando o limite e' zero nao ha caso com logotipo**, e nao se inventa
     * um: e' o que acontece com ECC M num codigo pequeno, porque a correccao
     * de erros nao tem modulos a mais para reconstruir a zona.
     *
     * A primeira versao saltava o caso e **o registo saia sem o `ecl`**, que
     * aparecia como `undefined` na lista e fazia o script parecer ter gerado
     * casos que nao gerou. O sintoma — `undefined v 6` — parece um bug de
     * extracao, e e' o registo a ser construido a meio.
     */
    if (maximo === 0) continue;

    // O controlo: sem logotipo, tem de ler. Sem ele, um renderizador de teste
    // defeituoso aparece como "a correccao de erros nao funciona".
    for (const modulos of [0, maximo]) {
      const controlo = modulos === 0;
      const codigo = aplicarFrame(qr, { modulos });

      casos.push({
        conteudo,
        ecl,
        controlo,
        modulosPedidos: modulos,
        size: qr.size,
        version: qr.version,
        modulosApagados: codigo.apagados,
        percentagem: Number(codigo.percentagem.toFixed(2)),
        base64,
        tamanho: codigoSqrc.bytes.length,
        versaoSqrc: codigoSqrc.campos.versao,
        /*
         * `Array.from` e' obrigatorio, e a razao esta no `gerar-frameqr.mjs`: a
         * matriz e' um array de `Uint8Array`, e o `JSON.stringify` de um
         * `Uint8Array` da `{"0":1,...}`. No Python isso chega como dicionario,
         * `'0'` e verdadeiro, e todos os modulos saem escuros.
         */
        modules: codigo.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
      });
    }
  }
}

writeFileSync(SAIDA, JSON.stringify({ casos, chaveBase64: Buffer.from(CHAVE_CRUA).toString('base64') }, null, 1));

console.log(`${casos.length} SQRC com logotipo gerados`);
for (const c of casos) {
  console.log(
    `  ${c.ecl} v${String(c.version).padStart(2)} ${String(c.size).padStart(2)}x${String(c.size).padStart(2)}` +
      ` ${String(c.modulosApagados).padStart(3)} apagados (${String(c.percentagem).padStart(5)}%)` +
      `  ${c.controlo ? 'controlo' : 'logo'}`,
  );
}
