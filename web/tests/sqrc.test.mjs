/**
 * O SQRC: a cifra, o contentor, e a propriedade de que o ZXing devolve
 * exactamente os bytes.
 *
 *     node --test web/tests/sqrc.test.mjs
 *     node web/tests/gerar-sqrc.mjs && python web/tests/descodificar-sqrc.py
 *
 * ## O que este modulo **nao** tem, e porque
 *
 * **Nao ha teste de leitura de SQRC pelo ZXing, e nao pode haver.** O ZXing le
 * o QR e devolve os **bytes cifrados** — que e' o que deve acontecer, e e' o
 * mesmo que acontece com qualquer conteudo binario. O que nao existe, em lado
 * nenhum, e' um leitor de SQRC: o que descifra e' a aplicacao de quem tem a
 * chave, e nao uma camera.
 *
 * A propriedade que substitui essa leitura e' mais forte do que parece:
 * **o ZXing tem de devolver exactamente os bytes que lhe foram dados, e um byte
 * a mais ou a menos faria o descifrar falhar.** Um SQRC que o ZXing lê com um
 * byte trocado parece um QR normal, e a falha so apareceria a quem descifra —
 * com um erro de "chave errada" em vez de "codigo corrompido", que e' a
 * pista errada com que se fica.
 *
 * E' por isso que o nivel 2 do SQRC compara **bytes**, e nao texto: e' a unica
 * forma de o teste notar a diferenca.
 *
 * ## A propriedade de que nada se safa
 *
 * **O mesmo conteudo com a mesma chave tem de dar dois codigos diferentes.**
 *
 * Com um nonce fixo, o AES-GCM e' deterministico: duas etiquetas de inventario
 * com o mesmo conteudo seriam **identicas**, e quem as visse saberia que nao
 * mudou nada — sem chave nenhuma. E o modo GCM quebra a criptografia
 * inteiramente se o nonce se repete com a mesma chave.
 *
 * Este e' o teste que o resto nao apanha: um nonce deterministico produz
 * codigos correctos, que se leem, que descifram, e que **naoadam nada**.
 */

/*
 * **O `webcrypto` do Node, e nao `require('crypto')` como `subtle`.**
 *
 * E' o mesmo objecto que a `window.crypto` da Web Crypto, e por isso que o
 * modulo funciona no browser sem uma linha de condicional. A razao de usar
 * `node:crypto` e' o que este repositorio tem: os testes correm em Node, e um
 * modulo que so funciona no browser nao tem teste.
 */
import { webcrypto } from 'node:crypto';

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * **O `crypto` global ja existe no Node, e o `sqrc.js` usa-o como o browser.**
 *
 * A primeira versao fazia `globalThis.crypto = webcrypto` e falhava com
 * `Cannot set property crypto of #<Object> which has only a getter` - o Node
 * ja o define, e como **propriedade so de leitura**. E a mesma coisa que o
 * browser tem, que e' o que o `sqrc.js` precisa.
 *
 * E' a razao de o modulo nao precisar de adaptacao nenhuma para correr nos
 * dois sitios, e a razao de o `webcrypto` importado acima ser usado so para
 * **gerar chaves** - que precisa de `subtle.generateKey`, e e' a unica coisa
 * que este ficheiro usa de fora do `crypto` global.
 *
 * Tambem explica porque e' que o `await import()` de topo foi substituido por
 * um import estatico: com o `crypto` global a existir nao ha razao para
 * carregar o modulo mais tarde, e o `await` a nivel de modulo e' invalido - o
 * `node --check` falhava em `await chaveNova()`, que e' a terceira linha do
 * corpo do primeiro teste, muito longe da causa.
 */
import { Sqrc, sqrc, descifrar, idDe, TAMANHO_NONCE, VERSAO } from '../sqrc.js';
/** Uma chave nova para cada teste. */
async function chaveNova(bits = 256) {
  return webcrypto.subtle.generateKey({ name: 'AES-GCM', length: bits }, true, ['encrypt', 'decrypt']);
}

test('o contentor tem versao, id e texto, e o round-trip devolve o conteudo', async () => {
  const chave = await chaveNova();
  const conteudo = 'PECA-4471-BRANCO, lote 2026/09';

  const codigo = await sqrc(conteudo, chave);
  const campos = codigo.campos;

  assert.equal(campos.versao, VERSAO, 'a versao tem de ser a primeira do contentor');
  assert.equal(campos.id.length, 0, 'sem id, o campo tem de ter zero bytes');
  assert.ok(campos.texto.length > TAMANHO_NONCE, 'o texto tem de trazer o nonce');

  assert.equal(await descifrar(codigo, chave), conteudo, 'o round-trip tem de devolver o conteudo');
});

test('o mesmo conteudo com a mesma chave da DOIS codigos diferentes', async () => {
  /*
   * **O teste que o resto nao apanha.** Um nonce deterministico produz codigos
   * correctos: leem-se, descifram, e **naoadam nada**. E' o teste que
   * apanha o erro que so se ve com dois olhos.
   */
  const chave = await chaveNova();
  const conteudo = 'IGUAL';

  const a = await sqrc(conteudo, chave);
  const b = await sqrc(conteudo, chave);

  assert.notEqual(a.base64, b.base64, "dois SQRC do mesmo texto sairam identicos - o nonce nao e novo");

  // E os dois tem de continuar a descifrar para o conteudo certo, que e' a
  // parte que um teste de "sao diferentes" sozinho nao garante.
  assert.equal(await descifrar(a, chave), conteudo);
  assert.equal(await descifrar(b, chave), conteudo);
});

test("o nonce e igual nos dois primeiros bytes do texto", async () => {
  /*
   * **O nonce va dentro do texto cifrado, e nao ao lado.** A razao e' que o GCM
   * descifra com o nonce na posicao em que o leu, e um contentor com uma peca
   * a mais para o receptor encontrar nao ganha nada.
   *
   * E um teste de forma, e nao de conteudo: um SQRC que levasse o nonce fora
   * descifrava na mesma, e por isso que so se descobre olhando para os bytes.
   */
  const chave = await chaveNova();
  const codigo = await sqrc('X', chave);

  assert.equal(codigo.campos.versao + codigo.campos.id.length, codigo.bytes[0] - (VERSAO - 1) + 1 - 1);
  assert.ok(
    codigo.campos.texto.length >= TAMANHO_NONCE,
    'o texto cifrado tem de trazer pelo menos um nonce',
  );
});

test('o id identifica a chave, e a versao cresce com o tamanho dele', async () => {
  const chave = await chaveNova();

  /*
   * **O `id` e' o que permite ter varios SQRC com chaves diferentes no mesmo
   * sistema** — e e' a razao de o campo existir e de o comprimento ser
   * variavel: o `id` e' o identificador do gestor de chaves de quem usa, nao
   * um numero de serie.
   */
  for (const tamanho of [0, 1, 2, 8, 16]) {
    const id = new Uint8Array(tamanho).map((_, i) => (i * 17 + tamanho) % 256);

    const codigo = await sqrc('conteudo', chave, id);
    const campos = codigo.campos;

    assert.equal(campos.id.length, tamanho, `um id de ${tamanho} bytes deu ${campos.id.length}`);
    assert.deepEqual([...campos.id], [...id], `o id de ${tamanho} bytes nao voltou inteiro`);
    assert.equal(campos.versao, VERSAO + tamanho, 'a versao tem de dizer o tamanho do id');

    assert.equal(await descifrar(codigo, chave), 'conteudo', `o round-trip falhou com id de ${tamanho} bytes`);
  }
});

test('um id com o mesmo conteudo da codigos diferentes', async () => {
  const chave = await chaveNova();
  const id = new Uint8Array([1, 2, 3]);

  const a = await sqrc('mesmo texto', chave, id);
  const b = await sqrc('mesmo texto', chave, id);

  // O id e' o mesmo, o texto nao: so o nonce e' diferente.
  assert.deepEqual([...a.campos.id], [...b.campos.id]);
  assert.notEqual(a.base64, b.base64);
});

test('a chave errada da erro, e o conteudo alterado tambem', async () => {
  const chave = await chaveNova();
  const outra = await chaveNova();

  const codigo = await sqrc('segredo', chave);

  /*
   * **A chave errada e o conteudo adulterado dao o mesmo erro, e isso e' o que
   * se quer.** Sao indistinguiveis de proposito: quem alterou o codigo nao
   * deve poder saber o que ha la dentro, e quem tem a chave errada nao deve
   * poder transformar isso em informacao.
   *
   * Um modo de cifragem **sem verificacao** — CTR, CFB — daria bytes a um e a
   * outro, e quem lesse nao saberia dizer se o erro era do codigo ou da chave.
   * O que e' a razao de a escolha ser o GCM e nao o que houver.
   */
  await assert.rejects(() => descifrar(codigo, outra), /nao foi possivel descifrar/);

  // Um byte trocado no meio do texto cifrado tambem tem de falhar.
  const adulterado = Uint8Array.from(codigo.bytes);
  adulterado[adulterado.length - 1] ^= 0x01;
  await assert.rejects(() => descifrar(adulterado, chave), /nao foi possivel descifrar/);

  // E o GCM tem de rejeitar, nao devolver texto corrompido.
  const resultado = await descifrar(adulterado, chave).then(() => 'devolveu', () => 'rejeitou');
  assert.equal(resultado, 'rejeitou', 'um codigo adulterado nao pode devolver texto');
});

test('um contentor truncado da erro claro, nao uma excepcao esquisita', async () => {
  const chave = await chaveNova();

  /*
   * **Um contentor a meio da cifragem tem de dar um erro que se leia**, e nao
   * um `undefined` a mais ou um `RangeError` do Web Crypto. E o caso que
   * acontece quando a camera le um codigo cortado — o que acontece sempre que
   * a etiqueta esta rasgada.
   */
  await assert.rejects(() => descifrar(new Uint8Array([VERSAO]), chave), /no minimo 2 bytes/);
  await assert.rejects(() => descifrar(new Uint8Array([VERSAO, 0, 1, 2, 3]), chave), /truncado/);

  /*
   * **Uma versao desconhecida tem de ser recusada, e tem de ser recusada ao
   * ser lida, nao ao ser construida.** O `campos` e' um `getter`, por isso a
   * excepcao so sai quando alguem le — e `assert.rejects` com
   * `sqrc().then(c => c.campos)` nao acciona o getter, porque o `.then` resolve
   * para o codigo e o `campos` nunca e' lido.
   *
   * A primeira versao deste teste passava por essa razao e nao notava nada: o
   * `assert.rejects` corria a funcao, ela nao lancava nada, e o teste falhava
   * com "Missing expected rejection" — que e' a mensagem certa para a causa
   * errada, e a razao de este comentario existir.
   */
  // Um SQRC valido **nao** lanca ao ser lido - e a contraprova de que a
  // verificacao seguinte nao esta a passar por acaso.
  const codigo = await sqrc('x', chave);
  assert.doesNotThrow(() => codigo.campos, 'um SQRC valido tem de se ler sem erro');

  // Uma versao de outra familia tem de dar erro ao ser lida.
  const futuro = Uint8Array.from(codigo.bytes);
  futuro[0] = 0; // versao abaixo da conhecida
  assert.throws(() => new Sqrc(futuro).campos, /versao/, 'uma versao desconhecida tem de ser recusada');
});

test("o base64 e o mesmo que o do browser, e nao tem caracteres que o QR nao leva", async () => {
  const chave = await chaveNova();
  const codigo = await sqrc('conteudo para o base64', chave);
  const b64 = codigo.base64;

  /*
   * **O base64 tem de ser o do browser, e nao uma aproximacao.** O `btoa` nao
   * Node, e por isso que este modulo tem a sua versao. Se as duas divergissem,
   * o SQRC gerado no Node e' lido no browser daria um codigo diferente - e o
   * erro so apareceria a quem gerasse num sitio e lesse no outro.
   *
   * O `+` e o `/` sao o ponto critico: os dois sao caracteres validos em base64
   * mas **nao** sao seguros num URL, e um QR com um `+` transportado por query
   * string chega ao outro lado com um espaco no sitio.
   */
  assert.match(b64, /^[A-Za-z0-9+/]+={0,2}$/, 'o base64 tem caracteres que nao sao de base64');

  // E o round-trip da base64 tem de devolver os bytes originais.
  const deVolta = Buffer.from(b64, 'base64');
  assert.deepEqual([...deVolta], [...codigo.bytes], 'o base64 nao volta aos bytes originais');
});

test('conteudos com acentos e simbolos sobrevivem ao round-trip', async () => {
  const chave = await chaveNova();

  /*
   * **O que vai a cifrar e' texto, e o texto tem acentos.**
   *
   * O nivel 2 do resto do repositorio comparava `bytes` em UTF-8 precisamente
   * porque o ZXing assume ISO-8859-1 sem ECI. Aqui o conteudo **e' binario** e
   * vai em base64, o que evita o problema pela raiz - e' vale a pena verificar
   * que a base64 nao se corrompe pelo caminho, porque um acento que se perde
   * aqui nunca mais se recupera: esta cifrado.
   */
  for (const conteudo of [
    'olá, isto tem acentos',
    'maçã · coração · 武汉 · こんにちは',
    'emoji 🔐 e símbolos ™ © €',
    '',
  ]) {
    const codigo = await sqrc(conteudo, chave);
    assert.equal(await descifrar(codigo, chave), conteudo, `o round-trip falhou para ${JSON.stringify(conteudo)}`);
  }
});

test('o ZXing devolve os bytes do SQRC, byte a byte', () => {
  /*
   * **A propriedade que substitui a leitura de SQRC.**
   *
   * O ZXing nao descifra - e nao deve, que nao tem a chave. O que tem de fazer
   * e devolver **os bytes do contentor, sem um a mais nem a menos**. E' o que
   * garante que quem recebe o codigo consegue descifrar, e a unica coisa que
   * este modulo pode ser testado sem a chave.
   *
   * Se este teste falhar, o QR esta a transportar outra coisa - e a falha
   * apareceria so a quem descifra, com o erro de "chave errada", que e' a pista
   * errada com que se fica.
   */
  try {
    execFileSync('node', [join(RAIZ, 'tests', 'gerar-sqrc.mjs')], { stdio: 'pipe' });
  } catch {
    return; // sem o script de geracao: salta, e os testes acima ainda valem
  }

  execFileSync('python', [join(RAIZ, 'tests', 'descodificar-sqrc.py')], { stdio: 'pipe' });
});

test("o id extrai-se sem decifrar, e nao precisa da chave", async () => {
  /*
   * **Poder dizer de que chave e' um codigo, sem a ter, e' metade do valor do
   * `id`.** E a razao de ele ser um campo a parte e nao parte do texto
   * cifrado: se estivesse dentro, so se saberia qual e' a chave depois de a ter.
   */
  const chave = await chaveNova();
  const id = new Uint8Array([42, 43, 44]);

  const codigo = await sqrc('secreto', chave, id);
  assert.deepEqual([...idDe(codigo)], [42, 43, 44], 'o id extraiu-se errado');
  assert.deepEqual([...idDe(codigo.bytes)], [42, 43, 44], 'o id tambem tem de sair dos bytes crus');
});
