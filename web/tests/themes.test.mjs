/**
 * Testes dos temas.
 *
 * Estes testes existem porque a alternativa é confiar no olho. Duas classes de
 * erro que o olho não apanha:
 *
 *  1. **Contraste insuficiente.** Uma cor "bonita" com texto por cima que não
 *     se lê. A WCAG 2.1 diz 4.5:1 para texto normal e 3:1 para texto grande.
 *     Foi assim que se descobriu que o cabeçalho do Ubuntu ficava a 1.98:1.
 *  2. **Um QR code tematizado.** Se um tema mudar a cor do canvas, o código
 *     deixa de se ler e ninguém descobre até alguém tentá-lo.
 *
 * Há 9 famílias e 3 modos, e o teste corre sobre as 27 combinações. É o
 * motivo de o CSS separar `data-theme` (a forma) de `data-modo` (a cor): com
 * os dois misturados seriam 27 blocos de paleta em vez de 18, e metade
 * repetia a mesma forma.
 *
 *     node --test "web/tests/*.test.mjs"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FAMILIAS,
  MODOS,
  FAMILIA_PADRAO,
  MODO_PADRAO,
  combinacoes,
  idsDeFamilia,
  idsDeModo,
} from '../themes.js';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const themesCss = readFileSync(join(web, 'themes.css'), 'utf8');
const stylesCss = readFileSync(join(web, 'styles.css'), 'utf8');
const themesJs = readFileSync(join(web, 'themes.js'), 'utf8');

/** As famílias pedidas, por id. */
const FAMILIAS_ESPERADAS = [
  'padrao',
  'win11',
  'win10',
  'win8',
  'win7',
  'winxp',
  'win95',
  'mac',
  'ubuntu',
];

// --- Cor e contraste --------------------------------------------------------

function hexParaRgb(hex) {
  const limpo = hex.replace('#', '').trim();
  const cheio = limpo.length === 3 ? [...limpo].map((c) => c + c).join('') : limpo;
  return [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16));
}

/** Lê `#rrggbb`, `#rrggbbaa` ou `rgba(r, g, b, a)`. */
function parseCor(valor) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(valor);
  if (hex) {
    const [r, g, b, a] = hexParaRgb(hex[1]);
    return [r, g, b, a === undefined ? 255 : a];
  }

  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(valor);
  if (rgba) {
    const alfa = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Math.round(alfa * 255)];
  }

  return null;
}

/**
 * Compõe uma cor translúcida sobre o que está por trás, como o browser faz.
 *
 * Sem isto, o tema do Windows 7 (superfície a 74% de branco) ficava sem
 * verificação de contraste nenhuma.
 */
function compor(cor, tras) {
  const [r, g, b, a] = cor;
  const alfa = a / 255;
  if (alfa >= 1) {
    return [r, g, b];
  }
  return [
    Math.round(r * alfa + tras[0] * (1 - alfa)),
    Math.round(g * alfa + tras[1] * (1 - alfa)),
    Math.round(b * alfa + tras[2] * (1 - alfa)),
  ];
}

/** Luminância relativa, tal como definida na WCAG 2.1. */
function luminancia(cor) {
  const canais = cor.slice(0, 3).map((valor) => {
    const s = valor / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- Leitura do CSS --------------------------------------------------------

/**
 * Extrai pares `--nome: valor;` de um bloco.
 *
 * Não é um parser de CSS: cobre o subconjunto que o themes.css usa. Se alguém
 * meter sintaxe mais complicada, o teste falha em vez de passar em silêncio.
 */
function variaveisDe(bloco) {
  const variaveis = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(bloco)) !== null) {
    variaveis.set(m[1], m[2].trim());
  }
  return variaveis;
}

/** O bloco `[data-theme='x']` — a forma, sem modo. */
function blocoDaForma(familia) {
  const encontrado = new RegExp(`\\[data-theme=['"]${familia}['"]\\]\\s*\\{([^}]*)\\}`).exec(themesCss);
  assert.ok(encontrado, `themes.css não define a forma do tema "${familia}"`);
  return variaveisDe(encontrado[1]);
}

/** O bloco `[data-theme='x'][data-modo='y']` — a paleta. */
function blocoDaPaleta(familia, modo) {
  const encontrado = new RegExp(
    `\\[data-theme=['"]${familia}['"]\\]\\[data-modo=['"]${modo}['"]\\]\\s*\\{([^}]*)\\}`,
  ).exec(themesCss);
  assert.ok(encontrado, `themes.css não define a paleta "${familia}" no modo "${modo}"`);
  return variaveisDe(encontrado[1]);
}

/**
 * A paleta efetiva de uma combinação.
 *
 * A cascata real é: `:root` em styles.css (os valores por omissão do site),
 * depois a forma da família em themes.css, depois a paleta do modo. O teste
 * respeita essa ordem, senão os tokens que só existem em styles.css — como o
 * `--campo-fundo: var(--fundo)` — apareciam como indefinidos.
 */
function paletaEfetiva(familia, modo) {
  const raiz = /:root\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(raiz, 'não encontrei o bloco :root em styles.css');

  const base = variaveisDe(raiz[1]);
  for (const [nome, valor] of blocoDaForma(familia)) {
    base.set(nome, valor);
  }
  for (const [nome, valor] of blocoDaPaleta(familia, modo)) {
    base.set(nome, valor);
  }
  return base;
}

/**
 * Cor de um token, já composta sobre o fundo quando é translúcida.
 *
 * Resolve `var(--outro)` antes de mais nada. `--campo-fundo: var(--fundo)` em
 * styles.css é uma delegação, não uma cor, e sem resolver isto o teste lia a
 * literalmente a palavra "var" e falhava sem dizer porquê.
 */
function corDe(paleta, nome, fundoBase) {
  const bruto = paleta.get(nome);
  assert.ok(bruto, `falta a variável ${nome}`);

  const delegacao = /^var\(\s*(--[\w-]+)\s*\)$/.exec(bruto);
  if (delegacao) {
    return corDe(paleta, delegacao[1], fundoBase);
  }

  const partes = parseCor(bruto);
  assert.ok(partes, `${nome} tem de ser uma cor, não "${bruto}"`);

  if (fundoBase) {
    return compor(partes, fundoBase);
  }
  return partes;
}

const rotulo = ({ familia, modo }) => `${familia}/${modo}`;

/**
 * As paletas que o CSS tem de ter.
 *
 * Só os dois modos concretos. O `sistema` não aparece: o JavaScript resolve-o
 * para um destes dois antes de escrever no atributo, e o CSS nunca define
 * cores para ele.
 */
const PALETAS = idsDeFamilia().flatMap((familia) => [
  { familia, modo: 'claro' },
  { familia, modo: 'escuro' },
]);

// --- Cobertura --------------------------------------------------------------

test('existem as famílias pedidas', () => {
  assert.deepEqual([...idsDeFamilia()].sort(), [...FAMILIAS_ESPERADAS].sort());
});

test('existem três modos: sistema, claro e escuro', () => {
  assert.deepEqual(idsDeModo(), ['sistema', 'claro', 'escuro']);
});

test('a lista do menu bate com a do CSS', () => {
  for (const familia of idsDeFamilia()) {
    blocoDaForma(familia);
    for (const modo of ['claro', 'escuro']) {
      blocoDaPaleta(familia, modo);
    }
  }
});

test('são 27 combinações e não há ids com caracteres estranhos', () => {
  assert.equal(combinacoes().length, 9 * 3);

  for (const id of idsDeFamilia()) {
    assert.match(id, /^[a-z][a-z0-9]*$/, `id de família inválido: "${id}"`);
  }
  for (const id of idsDeModo()) {
    assert.match(id, /^[a-z][a-z0-9]*$/, `id de modo inválido: "${id}"`);
  }
});

test('o CSS nunca vê o modo "sistema"', () => {
  // O JavaScript resolve "sistema" para "claro" ou "escuro" antes de escrever no
  // atributo. Se aparecesse no CSS, a paleta não existiria e o site arrancaria
  // sem cor nenhuma.
  assert.ok(
    !themesCss.includes("[data-modo='sistema']"),
    'o CSS não deve ter blocos para o modo "sistema": o JavaScript resolve-o',
  );
});

test('cada combinação define todos os tokens de cor', () => {
  const obrigatorias = [
    '--fundo',
    '--superficie',
    '--borda',
    '--borda-forte',
    '--texto',
    '--texto-suave',
    '--texto-fundo',
    '--texto-suave-fundo',
    '--primaria',
    '--primaria-texto',
    '--erro-fundo',
    '--erro-borda',
    '--erro-texto',
    '--foco',
    '--foco-fundo',
  ];

  for (const combinacao of PALETAS) {
    const paleta = paletaEfetiva(combinacao.familia, combinacao.modo);
    for (const nome of obrigatorias) {
      assert.ok(paleta.has(nome), `${rotulo(combinacao)} não define ${nome}`);
    }
  }
});

test('a forma de cada família não depende do modo', () => {
  /*
   * Se a forma estivesse dentro dos blocos de modo, mudar de claro para escuro
   * mudava o raio dos cantos e o tipo de letra — e o Windows 95 escuro deixava
   * de parecer Windows 95. É o erro estrutural que a separação evita.
   */
  for (const familia of idsDeFamilia()) {
    const forma = blocoDaForma(familia);
    for (const token of ['--raio', '--raio-sm', '--fonte']) {
      assert.ok(forma.has(token), `a forma de "${familia}" não define ${token}`);
    }

    // Nenhum bloco de modo pode redefinir a forma.
    for (const modo of ['claro', 'escuro']) {
      const paleta = blocoDaPaleta(familia, modo);
      for (const token of ['--raio', '--raio-sm', '--fonte', '--borda-largura']) {
        assert.ok(
          !paleta.has(token),
          `${familia}/${modo} redefine ${token}: a forma não pode depender do modo`,
        );
      }
    }
  }
});

// --- Contraste --------------------------------------------------------------

const PARES = [
  ['texto', 'superficie', 4.5, 'texto normal sobre a superfície'],
  ['texto-suave', 'superficie', 4.5, 'texto suave sobre a superfície'],
  ['texto', 'erro-fundo', 4.5, 'texto normal sobre o fundo de erro'],
  ['erro-texto', 'erro-fundo', 4.5, 'texto do erro'],
  ['primaria-texto', 'primaria', 4.5, 'texto do botão principal'],
  ['texto-fundo', 'fundo', 4.5, 'cabeçalho sobre o fundo da página'],
  ['texto-suave-fundo', 'fundo', 4.5, 'subtítulo e rodapé sobre o fundo'],
  ['foco', 'superficie', 3, 'contorno de foco sobre a superfície'],
  ['foco-fundo', 'fundo', 3, 'contorno de foco sobre o fundo da página'],
];

for (const combinacao of PALETAS) {
  const { familia, modo } = combinacao;

  test(`contraste de ${rotulo(combinacao)} cumpre a WCAG AA`, () => {
    const paleta = paletaEfetiva(familia, modo);

    // O fundo da página nunca é translúcido, por isso é a base de composição.
    const fundoPagina = corDe(paleta, '--fundo');
    const superficie = corDe(paleta, '--superficie', fundoPagina);

    for (const [frente, fundo, minimo, descricao] of PARES) {
      let tras;
      if (fundo === 'superficie') tras = superficie;
      else if (fundo === 'fundo') tras = fundoPagina;
      else tras = corDe(paleta, `--${fundo}`, fundoPagina);

      const frenteCor = corDe(paleta, `--${frente}`, tras);
      const razao = contraste(frenteCor, tras);

      assert.ok(
        razao >= minimo,
        `${rotulo(combinacao)}: ${descricao} dá ${razao.toFixed(2)}:1, mínimo ${minimo}:1`,
      );
    }
  });
}

test('o texto dos campos de texto contrasta com o seu próprio fundo', () => {
  // Os campos do Windows 95 escuro são pretos, não da cor da página. Se o
  // `--campo-texto` não acompanhasse, o campo ficava preto sobre preto.
  for (const combinacao of PALETAS) {
    const { familia, modo } = combinacao;
    const paleta = paletaEfetiva(familia, modo);

    const fundoPagina = corDe(paleta, '--fundo');
    const campo = corDe(paleta, '--campo-fundo', fundoPagina);
    const texto = corDe(paleta, '--campo-texto', campo);

    const razao = contraste(texto, campo);
    assert.ok(
      razao >= 4.5,
      `${rotulo(combinacao)}: texto do campo sobre o campo dá ${razao.toFixed(2)}:1`,
    );
  }
});

test('a cor do texto de cada modo é realmente clara ou escura', () => {
  // Um "modo escuro" com texto escuro é o erro mais óbvio de todos, e nenhum
  // teste de contraste apanha: o contraste entre duas cores escuras é alto.
  for (const familia of idsDeFamilia()) {
    for (const modo of ['claro', 'escuro']) {
      const paleta = paletaEfetiva(familia, modo);
      const fundo = luminancia(corDe(paleta, '--fundo'));
      const texto = luminancia(corDe(paleta, '--texto'));

      if (modo === 'claro') {
        assert.ok(texto < fundo, `${familia}/claro tem texto mais claro do que o fundo`);
      } else {
        assert.ok(texto > fundo, `${familia}/escuro tem texto mais escuro do que o fundo`);
      }
    }
  }
});

test('o texto do botão principal sobrevive a todos os pontos do gradiente', () => {
  /*
   * Um gradiente tem um ponto mais claro e outro mais escuro, e o pior para o
   * texto é o extremo que mais se afasta da cor do texto. Com texto branco, é a
   * ponta mais clara: a luminância tem de ficar abaixo de 0.183 para o branco
   * chegar a 4.5:1.
   *
   * O botão do Luna tinha esse brilho, e foi assim que "Guardar PNG" ficou com
   * texto branco sobre um azul claro a 2.9:1. O Lighthouse não o apanha:
   * não sabe avaliar gradientes, e o `background-color` de um elemento com
   * gradiente é transparente. Só um teste que leia as paragens do gradiente
   * é que o vê.
   */
  const alvos = [
    // Cada paragem do gradiente tem de aguentar o texto que lhe assenta: o
    // botão principal tem o seu, os secundários herdam o do painel.
    { token: '--botao-primario-gradiente', descricao: 'botao primário', texto: '--primaria-texto' },
    { token: '--botao-gradiente', descricao: 'botao secundário', texto: '--texto' },
  ];

  for (const combinacao of PALETAS) {
    const { familia, modo } = combinacao;
    const paleta = paletaEfetiva(familia, modo);

    for (const { token, descricao, texto: tokenTexto } of alvos) {
      const bruto = paleta.get(token);
      if (!bruto || !bruto.includes('gradient')) continue;

      // As paragens de um linear-gradient: cores hex ou rgb(a).
      const cores = [...bruto.matchAll(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/gi)].map((m) => m[0]);
      assert.ok(cores.length >= 2, `${rotulo(combinacao)}: ${token} não tem paragens legíveis`);

      const texto = corDe(paleta, tokenTexto);

      for (const cor of cores) {
        const razao = contraste(texto, parseCor(cor));
        assert.ok(
          razao >= 4.5,
          `${rotulo(combinacao)}: ${descricao} com ${tokenTexto} sobre ${cor} dá ${razao.toFixed(2)}:1`,
        );
      }
    }
  }
});

test('nenhuma paleta é repetida entre combinações', () => {
  const vistos = new Map();

  for (const combinacao of PALETAS) {
    const { familia, modo } = combinacao;
    const paleta = paletaEfetiva(familia, modo);

    const assinatura = ['--fundo', '--superficie', '--primaria', '--texto']
      .map((nome) => paleta.get(nome))
      .join('|');

    assert.ok(
      !vistos.has(assinatura),
      `${rotulo(combinacao)} repete a paleta de ${vistos.get(assinatura)}`,
    );
    vistos.set(assinatura, rotulo(combinacao));
  }
});

// --- O QR code nunca é tematizado -------------------------------------------

test('nenhum tema toca na cor do canvas', () => {
  // O QR tem de ser módulos escuros sobre fundo claro. Se um tema mexesse
  // aqui, o código deixava de se ler — e isso só se descobria no momento de
  // usar.
  const blocoCanvas = /canvas\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(blocoCanvas, 'não encontrei a regra do canvas');

  const variaveisUsadas = [...blocoCanvas[1].matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(
    variaveisUsadas,
    [],
    `o canvas não pode usar variáveis de tema: ${variaveisUsadas.join(', ')}`,
  );

  assert.match(blocoCanvas[1], /background:\s*#ffffff/i, 'o fundo do canvas tem de ser branco fixo');
});

test('nenhum tema define a cor do QR', () => {
  for (const nome of ['--cor-qr', '--qr-escuro', '--qr-claro', '--fundo-qr', '--primaria-qr']) {
    assert.ok(!themesCss.includes(nome), `themes.css define ${nome}, que é do QR`);
  }
});

test('o canvas é desenhado com preto e branco pelo encoder', () => {
  const qrcode = readFileSync(join(web, 'qrcode.js'), 'utf8');
  assert.match(qrcode, /dark = '#000000', light = '#ffffff'/);
});

// --- O modo sistema ---------------------------------------------------------

test('o modo "sistema" é resolvido em JavaScript', () => {
  // Se dependesse do CSS, cada paleta apareceria duas vezes: uma sob
  // [data-modo='escuro'] e outra dentro de um @media. São 18 blocos, não 36.
  assert.match(themesJs, /export function modoEfetivo/);
  assert.match(themesJs, /prefers-color-scheme: dark/);
});

test('o modo "sistema" reage a mudanças com a página aberta', () => {
  // Alguém que ligue o modo escuro do sistema com o separador aberto espera
  // ver a página mudar.
  assert.match(themesJs, /addEventListener\('change'/);
  assert.match(themesJs, /aoMudar/);
});

test('a escolha guardada é a família e o modo, não o modo resolvido', () => {
  /*
   * Se guardássemos "claro" depois de resolver "sistema", mudar o sistema
   * deixaria de ter efeito na próxima visita — e o botão voltaria a "Claro".
   */
  assert.match(themesJs, /localStorage\.setItem\(CHAVE, `\$\{familia\}:\$\{modo\}`\)/);
  assert.equal(FAMILIA_PADRAO, 'padrao');
  assert.equal(MODO_PADRAO, 'sistema');
});

test('o formato antigo de tema guardado ainda é aceite', () => {
  // Quem tinha "win95" ou "claro" guardado tem de continuar a arrancar bem.
  assert.match(themesJs, /bruto === 'claro' \|\| bruto === 'escuro'/);
  assert.match(themesJs, /familiaConhecida\(bruto\)/);
});

test('o snippet do <head> também sabe migrar o formato antigo', () => {
  // Aplica o tema antes do primeiro paint, e por isso não pode esperar pelo
  // themes.js — tem de resolver o modo e migrar a formato sozinho.
  const html = readFileSync(join(web, 'index.html'), 'utf8');
  const snippet = /<script>([\s\S]*?localStorage\.getItem[\s\S]*?)<\/script>/.exec(html);
  assert.ok(snippet, 'não encontrei o snippet inline do <head>');

  assert.match(snippet[1], /data-theme/);
  assert.match(snippet[1], /data-modo/);
  assert.match(snippet[1], /prefers-color-scheme: dark/);
});

// --- Cada família tem mesmo o seu carácter ----------------------------------

test('as famílias retrô têm aspeto próprio, não só uma cor diferente', () => {
  const formas = new Map();
  for (const familia of idsDeFamilia()) {
    formas.set(familia, blocoDaForma(familia));
  }

  // Windows 95: sem cantos, com a moldura 3D
  assert.equal(formas.get('win95').get('--raio'), '0');
  assert.match(themesCss, /\[data-theme='win95'\] \.painel[\s\S]*?inset 1px 1px 0 0 var\(--bisel-luz\)/);

  // Windows 8: o mais achatado — sem raio e sem borda
  assert.equal(formas.get('win8').get('--raio'), '0');
  assert.equal(formas.get('win8').get('--borda-largura'), '0');

  // Windows 7: vidro
  assert.match(themesCss, /\[data-theme='win7'\] \.painel[\s\S]*?backdrop-filter/);

  // Ubuntu: a berinjela da Yaru, e mais escura na variante escura
  const claro = blocoDaPaleta('ubuntu', 'claro');
  const escuro = blocoDaPaleta('ubuntu', 'escuro');
  assert.equal(claro.get('--fundo'), '#77216f');
  assert.equal(escuro.get('--fundo'), '#300a24');

  // Windows 10 e 11: Fluent, mas o 11 mais arredondado
  const raio10 = Number(formas.get('win10').get('--raio').replace('px', ''));
  const raio11 = Number(formas.get('win11').get('--raio').replace('px', ''));
  assert.ok(raio11 > raio10, 'o Windows 11 deve ser mais arredondado que o 10');
});

test('a forma é mesmo igual nos dois modos de cada família', () => {
  /*
   * A verificação de que está no teste "a forma não depende do modo" diz que os
   * blocos de modo não definem tokens de forma. Esta diz que, em conjunto, as
   * duas paletas dão a mesma forma. As duas coisas são diferentes: a primeira
   * é sobre o CSS, esta é sobre o resultado.
   */
  for (const familia of idsDeFamilia()) {
    const forma = blocoDaForma(familia);
    for (const token of ['--raio', '--raio-sm', '--fonte']) {
      const claro = paletaEfetiva(familia, 'claro').get(token);
      const escuro = paletaEfetiva(familia, 'escuro').get(token);
      assert.equal(claro, forma.get(token), `${familia}: --raio muda com o modo`);
      assert.equal(escuro, forma.get(token), `${familia}: --raio muda com o modo`);
    }
  }
});

test('a moldura do Windows 95 inverte-se no escuro, mas não desaparece', () => {
  // A sculpted edge do 95 é luz em cima e sombra em baixo. No escuro a ordem
  // inverte-se; se as quatro cores fossem iguais, a moldura desaparecia e o
  // tema deixava de ser Windows 95.
  for (const modo of ['claro', 'escuro']) {
    const paleta = blocoDaPaleta('win95', modo);
    const cores = ['--bisel-luz', '--bisel-luz2', '--bisel-sombra', '--bisel-sombra2'].map((n) =>
      paleta.get(n),
    );
    assert.ok(new Set(cores).size === 4, `win95/${modo}: as quatro cores da moldura são iguais`);
  }

  const claro = blocoDaPaleta('win95', 'claro');
  const escuro = blocoDaPaleta('win95', 'escuro');

  // No claro a luz é mais clara que a sombra; no escuro também, mas os valores
  // estão todos abaixo dos do claro.
  assert.notEqual(claro.get('--bisel-luz'), escuro.get('--bisel-luz'));
  assert.equal(claro.get('--bisel-luz'), '#ffffff');
});

// --- Barras de título -------------------------------------------------------

test('só as famílias com barra de título a mostram', () => {
  // O Windows 95 e o Yaru tinham barra de título. O macOS não, o Metro do
  // Windows 8 não, e o site padrão também não. Mostrar sempre era erro.
  const comBarra = [...themesCss.matchAll(/^\[data-theme='(\w+)'[^\n]*\.painel::before/gm)].map(
    (m) => m[1],
  );
  const esperados = ['win95', 'winxp', 'win7', 'win10', 'win11', 'ubuntu'];

  for (const id of esperados) {
    assert.ok(comBarra.includes(id), `a família "${id}" devia ter barra de título`);
  }
  for (const id of comBarra) {
    assert.ok(esperados.includes(id), `a família "${id}" tem barra de título e não devia`);
  }

  // A regra genérica em styles.css não pode mostrar a barra a toda a gente.
  assert.ok(
    !/^\.painel\[data-chrome\]::before/m.test(stylesCss),
    'styles.css não pode mostrar a barra de título de forma genérica',
  );
});

test('cada família com barra de título define as cores dela nos dois modos', () => {
  for (const familia of ['win95', 'winxp', 'win7', 'win10', 'win11', 'ubuntu']) {
    for (const modo of ['claro', 'escuro']) {
      const paleta = blocoDaPaleta(familia, modo);
      assert.ok(paleta.has('--chrome-fundo'), `${familia}/${modo} não define --chrome-fundo`);
      assert.ok(paleta.has('--chrome-texto'), `${familia}/${modo} não define --chrome-texto`);
      assert.ok(parseCor(paleta.get('--chrome-texto')), `${familia}/${modo}: --chrome-texto inválido`);
    }
  }
});

// --- Armadilhas que um teste de pares de tokens não vê ----------------------

test('o cabeçalho não usa a cor primária', () => {
  // No Ubuntu o título ficou com o laranja sobre a berinjela: 1.9:1. O título
  // tem de usar --texto-fundo, que é o token que existe para fundos escuros.
  for (const seletor of ['.topo h1', '.sub']) {
    const regra = new RegExp(`${seletor.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(stylesCss);
    if (!regra) continue;

    assert.ok(
      !/color:\s*var\(--primaria\)/.test(regra[1]),
      `${seletor} não pode usar --primaria: nos temas de fundo escuro fica ilegível`,
    );
  }
});

test('as opções dos <select> têm cor própria', () => {
  // A lista de opções é desenhada pelo toolkit do SO, não pelo browser. Sem
  // estas regras as opções herdavam o fundo da página.
  const regra = /option,\s*\noptgroup\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(regra, 'styles.css precisa de estilizar option/optgroup');

  assert.match(regra[1], /background:\s*var\(--superficie\)/);
  assert.match(regra[1], /color:\s*var\(--texto\)/);
});

test('o link "saltar para o conteúdo" tem contraste próprio', () => {
  // Estava escondido com left:-9999px e sem cor, herdando o azul do browser.
  const regra = /\.skip\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(regra, 'falta a regra .skip');

  assert.match(regra[1], /color:\s*var\(--primaria-texto\)/);
  assert.match(regra[1], /background:\s*var\(--primaria\)/);
});

test('as regras de botão por família não alcançam o botão principal', () => {
  /*
   * `[data-theme='x'] button` tem especificidade 0,1,1 e `button.primario` tem
   * 0,1,0. A regra da família ganhava, pintava o botão "Guardar PNG" de cinza e
   * deixava o texto branco sobre fundo quase branco. O Lighthouse apanhou
   * isto; um teste de pares de tokens, nunca.
   *
   * O que interessa é o `background`. A regra da moldura 3D do Windows 95
   * também pega em `button` sem o `:not`, e está certo: põe `border` e
   * `box-shadow`, não `background`, e o botão principal tem a sua própria
   * regra logo a seguir.
   */
  for (const id of idsDeFamilia()) {
    const regra = new RegExp(
      `\\[data-theme='${id}'\\] button(?![\\w-])(?!\\.primario)(?!:not)[^{]*\\{([^}]*)\\}`,
      'g',
    );

    for (const achada of themesCss.matchAll(regra)) {
      const seletor = achada[0].replace(/\s*\{$/, '').trim();
      assert.ok(
        !/background(-color)?\s*:/.test(achada[1]),
        `a família "${id}" põe um fundo em "${seletor}" sem excluir .primario`,
      );
    }
  }
});

test('o botão marcado do seletor de modo tem contraste próprio', () => {
  // O botão marcado é o único sítio onde a cor primária carrega texto de duas
  // cores ao mesmo tempo, e é um botão inteiro — não um link. Se a paleta
  // primária não aguentar, o texto desaparece.
  const regra = /\.segmentos input:checked \+ span\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(regra, 'falta o estilo do botão de modo marcado');

  assert.match(regra[1], /background:\s*var\(--primaria\)/);
  assert.match(regra[1], /color:\s*var\(--primaria-texto\)/);
});

test('o <input> do modo fica focável, mesmo escondido', () => {
  // Um input com display:none ou disabled não recebe foco: o teclado ficava
  // preso e não havia forma de mudar de modo sem rato.
  const regra = /\.segmentos input\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(regra, 'falta a regra do input do modo');

  assert.ok(!/display:\s*none/.test(regra[1]), 'o input não pode ser display:none');
  assert.ok(!/\bhidden\b/.test(regra[1]), 'o input não pode estar oculto');
  assert.match(regra[1], /opacity:\s*0/, 'tem de ficar escondido visualmente');
});

test('o contorno de foco do modo está no que se vê', () => {
  // O input está escondido, por isso o contorno tem de ir para o <span>, que é
  // o irmão a seguir. Se ficasse no input, o foco era invisível.
  const regra = /\.segmentos input:focus-visible \+ span\s*\{([^}]*)\}/.exec(stylesCss);
  assert.ok(regra, 'o foco visível do modo tem de estar no span');
  assert.match(regra[1], /outline:\s*3px solid var\(--foco\)/);
});
