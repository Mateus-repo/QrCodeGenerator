/**
 * O logótipo do FieldQR tem de sair centrado na zona apagada.
 *
 *     node --test web/tests/frameqr-centragem.test.mjs
 *
 * ## Porque isto e' um teste e nao um comentario
 *
 * **O logótipo saiu 4 módulos à esquerda durante muito tempo, e nada falhou.**
 * O QR continuava a ler — porque o QR estava certo, só o desenho é que não — e o
 * único sintoma era o desenho torto. Um bug assim não tem sintoma nenhum num
 * teste estrutural, e a `AGENTS.md` obriga a escrevê-lo com o nome.
 *
 * A causa era o nome de um argumento: `desenharLogotipo` recebia `offset` e a
 * chamada passava `margem`. O `offset` ficava no valor por omissão de zero, o
 * logótipo saía `margem` módulos para a esquerda e para cima, e **ninguém via
 * nada** porque a função não dava erro: aceitava a opção e ignorava-a.
 *
 * **Um teste que apanha isto tem de medir a posição pedida ao canvas**, e não
 * ver se a função se importa. É o `drawImage` que diz onde a coisa vai
 * parar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { encode } from '../qrcode.js';
import { aplicarFrame, desenharLogotipo } from '../frameqr.js';

const APP = new URL('../app.js', import.meta.url);

/**
 * Um canvas que só regista o que lhe pedem.
 *
 * **Não é um canvas de verdade, e é de propósito.** O que queremos verificar é
 * *o que a função pede*, e um canvas de verdade desenharia a imagem — o que
 * exigiria ler píxeis de volta e um ficheiro de imagem. O `drawImage` é a
 * única chamada que a função faz, e o resto dos argumentos são `escala` e
 * `offset`.
 */
function canvasFalso() {
  return {
    pedidos: [],
    drawImage(imagem, x, y, largura, altura) {
      this.pedidos.push({ x, y, largura, altura });
    },
  };
}

/** Uma imagem falsa, com a dimensão natural que interessa. */
function imagem(largura, altura) {
  return { naturalWidth: largura, naturalHeight: altura };
}

/** O payload tem de ser longo: um QR de 21 não leva logótipo nenhum. */
const PAYLOAD =
  'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';

const MARGEM = 4;
const ESCALA = 10;
const MODULOS = 7;

function montar(modulos = MODULOS) {
  const info = encode(PAYLOAD, { ecl: 'H' });
  return { info, codigo: aplicarFrame(info, { modulos }) };
}

// --- a centragem -----------------------------------------------------------

test('o logótipo sai centrado quando se passa o offset', () => {
  const { info, codigo } = montar();
  const contexto = canvasFalso();

  // Uma imagem **larga e não alta**, e o motivo está no comentário: com uma
  // imagem quadrada dentro de uma caixa quadrada, um offset errado de dois
  // módulos é indistinguível do centro.
  desenharLogotipo(contexto, codigo, imagem(300, 200), {
    escala: ESCALA,
    offset: MARGEM,
  });

  const d = contexto.pedidos[0];
  const z = codigo.zona;

  const caixaCentro = (z.inicio + MARGEM) * ESCALA + (z.fim - z.inicio) * ESCALA / 2;
  const telaCentro = ((info.size + MARGEM * 2) * ESCALA) / 2;
  const imgCentro = d.x + d.largura / 2;

  assert.equal(caixaCentro, telaCentro, 'a zona apagada tem de estar centrada');

  // **Sub-pixel.** A função arredonda com `Math.round`, e meio pixel é o que se
  // consegue ter. Mais do que isso nota-se.
  assert.ok(
    Math.abs(imgCentro - telaCentro) <= 1,
    `o logótipo saiu ${imgCentro - telaCentro} px do centro`,
  );
});

test('o mesmo código sem o offset sai deslocado, e é por isso que o teste existe', () => {
  const { info } = montar();
  const contexto = canvasFalso();

  // **Sem `offset`** — que é o que acontecia quando a chamada passava `margem`.
  desenharLogotipo(contexto, aplicarFrame(encode(PAYLOAD, { ecl: 'H' }), {
    modulos: MODULOS,
  }), imagem(300, 200), { escala: ESCALA });

  const d = contexto.pedidos[0];
  const imgCentro = d.x + d.largura / 2;
  const telaCentro = ((info.size + MARGEM * 2) * ESCALA) / 2;

  const desvio = imgCentro - telaCentro;

  // **O bug, medido.** São 4 módulos para a esquerda a 10 px por módulo.
  assert.equal(desvio, -MARGEM * ESCALA);
});

// --- o nome do argumento ---------------------------------------------------

test('passar `margem` dá erro em vez de ser ignorado', () => {
  const { codigo } = montar();
  const contexto = canvasFalso();

  /*
   * **Esta e' a parte que impede a volta do bug.**
   *
   * Uma função que ignora uma opção desconhecida é a pior forma de bug: a
   * assinatura promete, o corpo ignora. Se `margem` passasse em silêncio, o
   * `offset` voltava a zero e o logótipo voltava a sair torto — e a falha
   * continuava a ser invisível.
   *
   * O erro diz o que fazer, e não só que algo correu mal.
   */
  assert.throws(
    () => desenharLogotipo(contexto, codigo, imagem(300, 200), {
      escala: ESCALA,
      margem: MARGEM,
    }),
    /offset/,
    'passar `margem` tem de dar erro, e a mensagem tem de dizer o nome certo',
  );

  // E o erro é lançado **antes** de qualquer desenho, para não ficar metade
  // do logótipo no canvas.
  assert.equal(contexto.pedidos.length, 0, 'nada devia ter sido desenhado');
});

// --- a forma, que é o que a caixa apagada promete ----------------------------

test('a imagem entra pelo lado mais comprido e não é deformada', () => {
  const { codigo } = montar();
  const caixa = (codigo.zona.fim - codigo.zona.inicio) * ESCALA;

  for (const [largura, altura] of [[300, 200], [200, 300], [250, 250]]) {
    const contexto = canvasFalso();
    desenharLogotipo(contexto, codigo, imagem(largura, altura), {
      escala: ESCALA,
      offset: MARGEM,
    });

    const d = contexto.pedidos[0];
    const proporcao = largura / altura;

    // **A proporção da imagem é a mesma depois de desenhada.** Esticar é pior
    // do que um logótipo pequeno.
    assert.ok(
      Math.abs(d.largura / d.altura - proporcao) < 0.05,
      `a proporção ${largura}×${altura} não se mantém: ${d.largura}×${d.altura}`,
    );

    // **E nunca passa da caixa.**
    assert.ok(d.largura <= caixa, `a imagem ${d.largura} é maior que a caixa ${caixa}`);
    assert.ok(d.altura <= caixa, `a imagem ${d.altura} é maior que a caixa ${caixa}`);
  }
});

test('sem imagem não desenha nada', () => {
  const { codigo } = montar();
  const contexto = canvasFalso();

  desenharLogotipo(contexto, codigo, null, { escala: ESCALA, offset: MARGEM });

  assert.equal(contexto.pedidos.length, 0);
});

// --- a chamada, que e' onde o bug estava -------------------------------------

/**
 * A chamada que a aplicação faz, e que o teste anterior **nao** cobria.
 *
 * ## Porque este teste existe e o outro não chegava
 *
 * A primeira versão deste ficheiro testava `desenharLogotipo` e passava com o
 * bug e sem ele. **Verificado**: reintroduzi `margem: border` em `app.js` e os
 * cinco testes passaram na mesma.
 *
 * **A causa é que o teste importava `frameqr.js` e não `app.js`** — o bug
 * estava na *chamada*, não na função. A função estava certa e a chamava-a com
 * o nome errado, e um teste da função não vê a chamada.
 *
 * É a mesma família do bug do service worker a servir a versão antiga: **a
 * peça certa, montada com as ligações erradas**. Um teste que prova que uma
 * peça está boa não prova que a máquina inteira liga.
 *
 * **A defesa é ler o código-fonte e procurar a linha.** Não é o ideal — um teste
 * que importasse `app.js` não podia, porque a app toca no DOM ao carregar — mas
 * é a única forma de apanhar um erro de nome numa chamada, e o erro de nome é
 * precisamente o que nenhuma das outras peças vê.
 */
test('a aplicação passa `offset` à função, e não `margem`', async () => {
  const fonte = await readFile(APP, 'utf8');

  /*
   * **Só a linha de código, e não o texto todo.**
   *
   * A primeira versão procurava `'margem: border'` na fonte inteira e não
   * encontrava — porque o *comentário* que explica o bug menciona essa escrita.
   * Um teste que passa por não encontrar nada é pior do que não existir: dá
   * verde sem ter verificado nada.
   *
   * Por isso que o padrão exige o início da linha e o fim da linha. É o que
   * separa `margem: border,` do código de `` `margem: border` `` numa
   * comentário.
   */
  const linhasDeOpcoes = fonte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(offset|margem):\s*\w+,?$/.test(l));

  assert.ok(
    linhasDeOpcoes.length > 0,
    'não encontrei a chamada ao desenho do logótipo em app.js — o teste ' +
      'deixou de olhar para o sítio certo e passaria a passar sempre',
  );

  for (const linha of linhasDeOpcoes) {
    assert.ok(
      linha.startsWith('offset:'),
      `a aplicação passa "${linha}" e a função quer "offset"`,
    );
  }
});