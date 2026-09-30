/**
 * O SVG tem de levar o logótipo, e o PNG tem de o levar no mesmo sítio.
 *
 *     node --test web/tests/svg-logotipo.test.mjs
 *
 * ## O bug que este teste apanha
 *
 * O `toSvg` fazia `const { zona, ... } = options`, e **`options` nunca teve
 * `zona`** — a zona apagada vive dentro de `qr`. A condição `imagem && zona` era
 * portanto sempre falsa, e o SVG saía **sem logótipo nenhum**.
 *
 * **Não há sintoma nenhum disto**, e é o que o torna perigoso:
 *
 * - um SVG sem `<image>` é um SVG válido;
 * - o botão de exportar funciona e o ficheiro abre;
 * - **o QR lê-se na mesma**, porque o logótipo é uma imagem e não parte do
 *   código.
 *
 * O sintoma é "o logo desapareceu do ficheiro", que não se parece com um bug do
 * gerador. E o ficheiro que a pessoa recebe tem o nome certo e o conteúdo
 * diferente do PNG — que é o que o `ver-frameqr-nivel3.py` existe para apanhar.
 *
 * **A armadilha de não haver sintoma é que o teste estrutural passa.** Um SVG sem
 * `<image>` continua a ter `viewBox`, `path` e `rect`, e todas as asserções
 * sobre a estrutura passam.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encode, toSvg } from '../qrcode.js';
import { aplicarFrame } from '../frameqr.js';

const PAYLOAD = 'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';

/** Um logótipo falso, com o que o `toSvg` lê: dimensões e `src`. */
const LOGOTIPO = { naturalWidth: 240, naturalHeight: 160, src: 'logo.png' };

function comZona(modulos = 7) {
  const info = encode(PAYLOAD, { ecl: 'H' });
  return { info, codigo: aplicarFrame(info, { modulos }) };
}

test('o SVG leva o logótipo quando a zona apagada está presente', () => {
  const { codigo } = comZona();

  const svg = toSvg(PAYLOAD, {
    ecl: 'H',
    border: 4,
    escala: 9,
    qr: codigo,
    logotipo: LOGOTIPO,
  });

  assert.ok(
    svg.includes('<image'),
    'o SVG saiu sem <image> — o logótipo desaparecia do ficheiro exportado',
  );
  assert.ok(svg.includes(LOGOTIPO.src), 'o <image> não aponta para o logótipo');
});

test('sem logótipo o SVG não leva <image>, e isso é o normal', () => {
  const { codigo } = comZona();

  const svg = toSvg(PAYLOAD, { ecl: 'H', border: 4, escala: 9, qr: codigo });

  assert.ok(!svg.includes('<image'), 'sem logótipo não devia haver <image>');
  assert.ok(svg.includes('<path'), 'o QR em si tem de lá estar');
});

test('o logótipo do SVG sai centrado, e não no canto', () => {
  const { info, codigo } = comZona();
  const escala = 9;
  const border = 4;

  const svg = toSvg(PAYLOAD, {
    ecl: 'H',
    border,
    escala,
    qr: codigo,
    logotipo: LOGOTIPO,
  });

  const tag = svg.match(/<image[^>]*>/)[0];
  const x = Number(tag.match(/x="([\d.]+)"/)[1]);
  const y = Number(tag.match(/y="([\d.]+)"/)[1]);

  /*
   * **O centro é o do `viewBox`, e o `viewBox` inclui a margem.**
   *
   * A primeira versão deste teste comparava com `info.size / 2`, e o logótipo
   * estava 4 módulos "fora" — que era a margem de cada lado, não um erro.
   * **Um teste que dá a razão errada é pior do que não haver teste**, porque
   * leva a
   * pessoa a mudar o código que está certo.
   * O `viewBox` é `0 0 (size + 2*border)`, e por isso que o centro é
   * `(size + 2*border) / 2` — e não `size / 2`.
   */
  const viewbox = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const centro = viewbox[0] + viewbox[2] / 2;
  const largura = Number(tag.match(/width="([\d.]+)"/)[1]);
  const altura = Number(tag.match(/height="([\d.]+)"/)[1]);

  assert.ok(
    Math.abs(x + largura / 2 - centro) <= 0.05,
    `o logótipo do SVG está ${x + largura / 2 - centro} módulos do centro`,
  );
  assert.ok(
    Math.abs(y + altura / 2 - centro) <= 0.05,
    `o logótipo do SVG está ${y + altura / 2 - centro} módulos do centro em y`,
  );

  // **E o tamanho é o da zona, em módulos** — nem maior, nem menor. Uma imagem
  // maior taparia código que a correcção de erros tem de reconstruir.
  assert.ok(
    Math.abs(largura - (codigo.zona.fim - codigo.zona.inicio)) < 0.05,
    `o logótipo tem ${largura} módulos e a zona ${codigo.zona.fim - codigo.zona.inicio}`,
  );

  assert.ok(x > 0 && y > 0, 'o logótipo não pode estar na margem');
});

test('o SVG sem zona e o SVG com zona têm o mesmo path', () => {
  const { info, codigo } = comZona();

  const sem = toSvg(PAYLOAD, { ecl: 'H', border: 4, escala: 9, qr: info });
  const com = toSvg(PAYLOAD, {
    ecl: 'H',
    border: 4,
    escala: 9,
    qr: codigo,
    logotipo: LOGOTIPO,
  });

  /**
   * **A zona apagada tem de mudar o `path`, e só o `path`.**
   *
   * Se o `path` fosse igual, o SVG não teria o buraco do logótipo: levaria a
   * imagem por cima de um QR cheio. O QR lê-se na mesma — a correcção de erros
   * não tem o que reconstruir porque nada foi apagado — e o resultado é um
   * logótipo escuro e ilegível sobre barras pretas.
   *
   * **É o bug inverso ao do `options.zona`**, e a mesma função. Um ponha o
   * logótipo a mais, o outro tira-o de todo.
   */
  const pathDe = (s) => s.match(/<path d="([^"]*)"/)[1];
  assert.notEqual(
    pathDe(com),
    pathDe(sem),
    'o SVG com logótipo tem de ter o path diferente: é o buraco da zona',
  );

  // **E mais curto**, porque há menos módulos escuros.
  assert.ok(
    pathDe(com).length < pathDe(sem).length,
    'a zona apagada tem de encurtar o path do SVG',
  );
});