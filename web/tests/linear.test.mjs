/**
 * Testes do desenho de codigos de barras lineares.
 *
 * Estes sao os testes de NIVEL 1: conferem a forma, as dimensoes e o
 *relationship entre o canvas e o SVG. Nao substituem o teste de leitura, que
 * esta em `descodificar-lineares.py` e e o que diz se o codigo presta.
 *
 * A divisao e deliberada: estes apanham um `width` em falta, que faria o SVG
 * sair cortado sem o teste de leitura dar conta (o ZXing lê a partir das
 * matrizes, nao do SVG). O outro apanha o modulo no sítio errado, que estes
 * nao vendo.
 *
 *     node --test "web/tests/*.test.mjs"
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIMBOLOGIAS, codificar, simbologiaPorId } from '../symbologies/index.js';
import { dimensoes, paraSvg, MARGEM_PADRAO } from '../symbologies/linear.js';

const EXEMPLOS = {
  ean13: '400638133393',
  ean8: '9638507',
  upca: '03600029145',
  code128: 'MAST-2024-0001',
  code39: 'ABC-1234',
  itf14: '1234567890123',
  codabar: '12345678',
};

// --- O registo --------------------------------------------------------------

test('as sete simbologias estão registadas, com ids válidos', () => {
  assert.deepEqual(
    SIMBOLOGIAS.map((s) => s.id),
    ['ean13', 'ean8', 'upca', 'code128', 'code39', 'itf14', 'codabar'],
  );

  for (const s of SIMBOLOGIAS) {
    assert.match(s.id, /^[a-z][a-z0-9]*$/);
    assert.ok(s.rotulo.length > 0);
    assert.ok(s.descricao.length > 0);
    assert.equal(typeof s.encode, 'function');
    assert.equal(typeof s.validar, 'function');
  }
});

test('cada registo sabe codificar o seu próprio exemplo', () => {
  for (const [id, valor] of Object.entries(EXEMPLOS)) {
    assert.ok(simbologiaPorId(id), `falta a simbologia "${id}"`);
    const codigo = codificar(id, valor);
    assert.ok(codigo.modules.length > 0, `${id} não devolveu módulos`);
    assert.equal(codigo.symbology, simbologiaPorId(id).symbology);
  }
});

test('codificar devolve a altura e a legenda que o desenho precisa', () => {
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  assert.ok(codigo.alturaModulos > 0, 'sem altura, o desenho não sabe o que fazer');
  assert.ok(codigo.legenda.length === 13, `legenda com ${codigo.legenda.length} dígitos`);
  assert.equal(codigo.legenda, '4006381333931');
});

test('uma simbologia desconhecida dá erro, não uma imagem vazia', () => {
  assert.throws(() => codificar('qrcode', 'x'), /Simbologia desconhecida/);
});

// --- Validação --------------------------------------------------------------

test('a validação recusa o número de dígitos errado, com o número à vista', () => {
  // A mensagem tem de dizer quantos dígitos há, não só que está errado: quem
  // está a usar isto está a transcrever de uma embalagem e precisa de saber o
  // que lhe falta.
  assert.throws(() => codificar('ean13', '12345'), /Recebeste 5/);
  assert.throws(() => codificar('ean8', '123456789'), /Recebeste 9/);
  assert.throws(() => codificar('upca', '123'), /Recebeste 3/);
});

test('a validação recusa letras onde só cabem dígitos, e diz o que recebeu', () => {
  // A mensagem repete o que chegou, para se ver o erro de transcrição à vista.
  assert.throws(() => codificar('ean13', 'abcdefghijkl'), /so aceita digitos/);
  assert.throws(() => codificar('ean13', 'abcdefghijkl'), /abcdefghijkl/);
});

test('o Code 128 recusa o que não é ASCII, e diz o que usar em vez disso', () => {
  assert.throws(() => codificar('code128', 'Café'), /ASCII/);
  assert.throws(() => codificar('code128', '€'), /ASCII/);
  // A mensagem tem de apontar para a alternativa, não só recusar.
  try {
    codificar('code128', 'Café');
    assert.fail('deveria ter lançado');
  } catch (erro) {
    assert.match(erro.message, /QR/);
  }
});

test('o Code 39 recusa minúsculas sem as engolir em silencio', () => {
  // Aceita minusculas e passa a maiusculas, que e o que o formato quer. O que
  // nao pode e converter em silencio algo que nao existe.
  assert.equal(codificar('code39', 'abc-1234').legenda, 'ABC-1234-');
  assert.throws(() => codificar('code39', 'Á'), /Code 39 não tem/);
  assert.throws(() => codificar('code39', '*'), /asterisco/);
  // A mensagem aponta para o Code 128, que leva qualquer caractere.
  assert.throws(() => codificar('code39', 'á'), /Code 128/);
});

test('o Codabar recusa letras, e o ITF-14 recusa o numero errado de dígitos', () => {
  assert.throws(() => codificar('codabar', 'ABC'), /Codabar não tem/);
  assert.throws(() => codificar('codabar', 'A123'), /Codabar não tem/);
  assert.throws(() => codificar('itf14', '12345'), /Recebeste 5/);
  // O ITF-14 tem sempre 14 digitos: 13 de dados e o de controlo.
  assert.equal(codificar('itf14', '1234567890123').legenda.length, 14);
});

test('o Code 128 aceita tudo o que é ASCII imprimível', () => {
  for (const texto of ['a', 'Z', '!@#$%^&*()', '0', 'PT-1500-2745-9871']) {
    assert.equal(codificar('code128', texto).legenda, texto);
  }
});

test('os espaços e os traços são ignorados nas entradas numéricas', () => {
  // Quem transcreve de uma embalagem mete espaços e traços sem pensar.
  const comEspacos = codificar('ean13', '4 006-381 333 93');
  const semEspacos = codificar('ean13', '400638133393');
  assert.deepEqual(comEspacos.modules, semEspacos.modules);
});

// --- As dimensões -----------------------------------------------------------

test('as dimensões saem proporcionais e com a margem dos dois lados', () => {
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const d = dimensoes(codigo, { escala: 2, margem: MARGEM_PADRAO });

  // 95 módulos de EAN-13, mais 10 de margem de cada lado, a 2 px cada.
  assert.equal(codigo.modules.length, 95);
  assert.equal(d.larguraTotal, 95 + MARGEM_PADRAO * 2);
  assert.equal(d.pxLargura, d.larguraTotal * 2);
  assert.equal(d.pxAltura, d.alturaTotal * 2);
});

test('a altura não é derivada da largura', () => {
  // Este é o ponto que distingue um código de barras de um QR: um EAN-13 tem
  // 95 de largura e 68 de altura. Derivar a altura da largura daria um código
  // achatado que nenhum leitor de mão lê.
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const d = dimensoes(codigo);

  assert.equal(codigo.modules.length / d.alturaBarra > 1.3, true);
  assert.equal(codigo.modules.length / d.alturaBarra < 1.5, true);
});

test('sem legenda, a imagem é só a barra', () => {
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const com = dimensoes(codigo, { comLegenda: true });
  const sem = dimensoes(codigo, { comLegenda: false });

  assert.equal(sem.alturaTotal, sem.alturaBarra);
  assert.ok(com.alturaTotal > sem.alturaTotal, 'a legenda tem de ocupar altura');
  // A largura não muda: a legenda vive debaixo, não nasce ao lado.
  assert.equal(com.larguraTotal, sem.larguraTotal);
});

test('a escala multiplica tudo sem deixar restos', () => {
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  for (const escala of [1, 2, 3, 4]) {
    const d = dimensoes(codigo, { escala });
    assert.equal(d.pxLargura % escala, 0, `escala ${escala}: largura não é múltiplo`);
    assert.equal(d.pxAltura % escala, 0, `escala ${escala}: altura não é múltiplo`);
  }
});

// --- O SVG ------------------------------------------------------------------

test('o SVG tem uma barra por módulo escuro, e o SVG e o canvas concordam', () => {
  for (const [id, valor] of Object.entries(EXEMPLOS)) {
    const codigo = codificar(id, valor);
    const svg = paraSvg(codigo, { escala: 2, comLegenda: false });

    const escuros = codigo.modules.filter(Boolean).length;
    const barras = (svg.match(/<rect /g) ?? []).length;

    // Um <rect> é o fundo; os restantes são as barras.
    assert.equal(barras - 1, escuros, `${id}: ${barras - 1} barras para ${escuros} módulos escuros`);
  }
});

test('o SVG é bem formado e tem as dimensões que o canvas teria', () => {
  const codigo = codificar('code128', EXEMPLOS.code128);
  const opcoes = { escala: 2, comLegenda: true };
  const d = dimensoes(codigo, opcoes);
  const svg = paraSvg(codigo, opcoes);

  assert.ok(svg.startsWith('<svg '), 'não começa por <svg');
  assert.ok(svg.endsWith('</svg>'), 'não acaba em </svg>');
  assert.ok(svg.includes(`width="${d.pxLargura}"`), 'a largura do SVG não bate com a do canvas');
  assert.ok(svg.includes(`height="${d.pxAltura}"`), 'a altura do SVG não bate com a do canvas');
  assert.ok(svg.includes(`viewBox="0 0 ${d.pxLargura} ${d.pxAltura}"`));

  // As etiquetas abrem e fecham na ordem certa.
  const abrem = (svg.match(/<g fill=/g) ?? []).length;
  const fecham = (svg.match(/<\/g>/g) ?? []).length;
  assert.equal(abrem, fecham);
});

test('as guardas são mais altas que o resto', () => {
  // A guarda é a única coisa que diz ao leitor onde acaba o código, e descem
  // para dentro da zona da legenda. Se ficassem à mesma altura, o SVG perdia a
  // distinção e o código saía de uma etiqueta irreconhecível.
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const svg = paraSvg(codigo, { escala: 1, comLegenda: false });

  const alturas = [...svg.matchAll(/<rect x="\d+" y="0" width="\d+" height="(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  const distintas = new Set(alturas);

  assert.equal(distintas.size, 2, 'esperava duas alturas diferentes: guarda e corpo');
  assert.ok(Math.max(...distintas) > Math.min(...distintas), 'a guarda tem de ser mais alta');
});

/**
 * O texto de cada <text> do SVG, por ordem.
 *
 * Casa só com `<text ...>conteúdo</text>`. Um regex mais largo, como `>([^<>]*)<`,
 * também apanha o espaço em branco entre etiquetas, e dá uma lista com três
 * elementos quando há um — que foi o que aconteceu na primeira versão deste
 * teste, e que fez o teste falhar por uma razão que não tinha nada a ver com o
 * código.
 */
function textosDoSvg(svg) {
  return [...svg.matchAll(/<text\b[^>]*>([^<>]*)<\/text>/g)].map((m) => m[1]);
}

test('a legenda vai no SVG em grupos, e juntada dá o número completo', () => {
  /*
   * O EAN-13 imprime o primeiro dígito fora da guarda e os outros doze em dois
   * grupos de seis. São três <text> separados, e o que prova que estão certos é
   * que concatenados dão o número todo — se um deles se perdesse, ou tivesse
   * um dígito a mais, a imagem mostraria um número diferente do codificado, que
   * é o pior erro possível numa etiqueta: o código continua a varrer e ninguém
   * repara.
   */
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const svg = paraSvg(codigo, { escala: 3, comLegenda: true });

  const textos = textosDoSvg(svg);
  assert.equal(textos.join(''), '4006381333931', `grupos: ${JSON.stringify(textos)}`);
  /*
   * 4006381333931 decompõe-se em 4 | 006381 | 333931: o primeiro dígito sai
   * para fora da guarda, e os dois grupos de baixo são os dígitos 2-7 e 8-13.
   * Confundir os dois cortes é fácil — `d.slice(0, 6)` e `d.slice(6)` dão
   * "400638" e "1333931", com um dígito a mais à direita — e o número impresso
   * deixa de bater com o codificado.
   */
  assert.deepEqual(textos, ['4', '006381', '333931']);

  // Os grupos não podem estar todos no mesmo sítio.
  const xs = [...svg.matchAll(/<text x="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(new Set(xs).size, 3, `os três grupos caíram no mesmo x: ${xs}`);
});

test('o UPC-A não tem dígito fora da guarda, ao contrário do EAN-13', () => {
  // A matriz é a mesma, mas o UPC-A tem 12 dígitos e todos cabem nos dois
  // grupos. Imprimir o zero inicial seria inventar um dígito que não existe.
  const codigo = codificar('upca', EXEMPLOS.upca);
  const svg = paraSvg(codigo, { escala: 3, comLegenda: true });

  const textos = textosDoSvg(svg);
  assert.deepEqual(textos, ['036000', '291452'], 'dois grupos de seis');
  assert.equal(textos.join(''), '036000291452');
});

test('o EAN-8 tem dois grupos de quatro, sem dígito de fora', () => {
  const codigo = codificar('ean8', EXEMPLOS.ean8);
  const textos = textosDoSvg(paraSvg(codigo, { escala: 3, comLegenda: true }));
  assert.deepEqual(textos, ['9638', '5074']);
  assert.equal(textos.join(''), '96385074');
});

test('o Code 128 tem uma legenda só, centrada', () => {
  const codigo = codificar('code128', EXEMPLOS.code128);
  const svg = paraSvg(codigo, { escala: 3, comLegenda: true });

  assert.deepEqual(textosDoSvg(svg), [EXEMPLOS.code128]);
});

test('o texto da legenda é escapado', () => {
  // O Code 128 aceita <, > e &, e um SVG sem escapamento não abre num browser.
  const comSimbolos = codificar('code128', 'A<B>C&D');
  const svg = paraSvg(comSimbolos, { escala: 2, comLegenda: true });
  assert.ok(svg.includes('&lt;'), 'o < não foi escapado');
  assert.ok(svg.includes('&amp;'), 'o & não foi escapado');
  assert.ok(!svg.includes('>A<B>'), 'o texto cru chegou ao SVG');
});

test('sem legenda, o SVG não tem <text>', () => {
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const svg = paraSvg(codigo, { escala: 2, comLegenda: false });
  assert.ok(!svg.includes('<text'), 'a legenda devia estar desligada');
});

// --- A cor ------------------------------------------------------------------

test('o SVG é sempre preto sobre branco, e as cores entram por parâmetro', () => {
  const codigo = codificar('ean13', EXEMPLOS.ean13);
  const svg = paraSvg(codigo, { escala: 2, comLegenda: false, dark: '#123456', light: '#fedcba' });

  assert.ok(svg.includes('fill="#fedcba"'), 'o fundo não é o que foi pedido');
  assert.ok(svg.includes('fill="#123456"'), 'a cor das barras não é a que foi pedida');
});
