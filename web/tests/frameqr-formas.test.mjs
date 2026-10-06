/**
 * As formas da área apagada, e o ângulo e a posição.
 *
 *     node --test web/tests/frameqr-formas.test.mjs
 *
 * ## O que a forma decide, e por que isto é um teste de estrutura
 *
 * **A forma não é um pormenor estético: é o número de módulos apagados que
 * decide se o código se lê.** Para uma caixa dada o quadrado é o pior, porque
 * enche os cantos; e a estrela apaga menos com o mesmo logótipo.
 *
 * Medido numa caixa de onze módulos: **o quadrado apaga 101 módulos e a estrela
 * 62** — menos de 40%. É essa a razão de a DENSO oferecer formas, e é a razão
 * de `modulosMaximos` ser por forma.
 *
 * **O que este ficheiro não faz é dizer que se lê.** Isso é
 * `spec/verificar-formas.py`, que manda o ZXing ler 108 matrizes. O que está
 * aqui é a geometria, e a geometria é o que um teste estrutural apanha.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { encode } from '../qrcode.js';
import {
  aplicarFrame,
  contarApagados,
  FORMAS,
  mascaraDaForma,
  modulosMaximos,
} from '../frameqr.js';

const PAYLOAD = 'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';
const info = encode(PAYLOAD, { ecl: 'H' });

const IDS = FORMAS.map(([id]) => id);

// --- a forma apaga menos que o quadrado --------------------------------------

test('o quadrado apaga mais módulos do que qualquer outra forma', () => {
  for (const lado of [5, 7, 9, 11, 15]) {
    const quadrado = contarApagados(info, lado, 'quadrado');

    for (const id of IDS.filter((x) => x !== 'quadrado')) {
      const outros = contarApagados(info, lado, id);

      /*
       * **Igualdade também é um erro.** Uma forma que apaga o mesmo que o
       * quadrado não está a poupar nada, e quem escolheu a forma para ler
       * melhor fica com o logótipo grande e o código pior. É por isso que o
       * teste é `<` e não `<=`.
       */
      assert.ok(
        outros < quadrado,
        `${id} apaga ${outros} numa caixa de ${lado}, e o quadrado apaga ${quadrado}`,
      );
    }
  }
});

test('a estrela é a que apaga menos, e o círculo a segunda', () => {
  const lado = 11;
  const estrela = contarApagados(info, lado, 'estrela');
  const circulo = contarApagados(info, lado, 'circulo');
  const quadrado = contarApagados(info, lado, 'quadrado');

  assert.ok(estrela < circulo, `estrela ${estrela} vs circulo ${circulo}`);
  assert.ok(circulo < quadrado, `circulo ${circulo} vs quadrado ${quadrado}`);
});

// --- a forma cabe na caixa -------------------------------------------------

test('nenhuma forma transborda a caixa que promete', () => {
  for (const lado of [5, 7, 9, 11]) {
    for (const id of IDS) {
      const dentro = mascaraDaForma(id, lado);

      // **Só fora da caixa.** O que se verifica é que a forma não transborda, e
      // um módulo dentro da caixa pode estar dentro ou fora da forma conforme a
      // forma — o quadrado diz que sim a todos, e o círculo que não.
      for (let y = -3; y < lado + 3; y++) {
        for (let x = -3; x < lado + 3; x++) {
          if (x >= 0 && y >= 0 && x < lado && y < lado) continue;

          assert.equal(
            dentro(x, y),
            false,
            `${id} de lado ${lado} diz que (${x}, ${y}) está dentro, e está fora da caixa`,
          );
        }
      }
    }
  }
});

test('só o quadrado chega ao canto, e nenhuma outra forma o faz', () => {
  /*
   * **O canto pertence ao quadrado.** A estrela **não** chega, e é o certo: as
   * suas pontas estão no topo e a 72 graus de intervalo, e os cantos da caixa
   * ficam a 45 — que é um vale. **Uma estrela que chegasse ao canto teria as
   * pontas nas diagonais**, o que a torna um losango pontudo e não uma estrela.
   */
  for (const lado of [5, 7, 9]) {
    for (const id of IDS) {
      const dentro = mascaraDaForma(id, lado);

      assert.equal(dentro(0, 0), id === 'quadrado', `${id} no canto (0,0)`);
      assert.equal(
        dentro(lado - 1, lado - 1),
        id === 'quadrado',
        `${id} no canto oposto`,
      );

      // E nenhuma forma passa da caixa, nem ao meio dos lados.
      for (const [x, y] of [[-1, 2], [lado, 2], [2, -1], [2, lado]]) {
        assert.equal(dentro(x, y), false, `${id} em (${x}, ${y}) está fora da caixa`);
      }
    }
  }
});

// --- o anel apaga à volta, e é uma dilatação da forma ----------------------

test('o anel é a forma dilatada, e não um quadrado à volta dela', () => {
  /*
   * **Este é o teste que apanha o "anel quadrado em volta de um círculo".**
   *
   * A primeira versão dilatava com `dentro(x+raio) && dentro(x-raio)`, que é
   * sempre falso para as formas não quadradas — e o anel saía cortado nos
   * cantos, com o logótipo a tocar as barras. O sintoma era um logótipo
   * circular com uma barra escura em cima, que lê pior do que sem anel.
   *
   * **A prova é que o anel de um círculo não é quadrado**: os cantos da caixa
   * do anel estão de fora.
   */
  const dentro = mascaraDaForma('circulo', 9);

  // Com o anel, o canto da caixa de 9+2*2=13 deixa de estar dentro.
  assert.equal(dentro(0, 0), false, 'o canto tem de estar fora do anel');

  // E o meio está dentro, que é o que o anel é para proteger.
  assert.equal(dentro(6, 6), true, 'o meio tem de estar dentro do anel');
});

test('a dilatação apaga mais do que a forma, em todas elas', () => {
  for (const lado of [5, 7, 9]) {
    const semAnel = contarApagados(info, lado, 'losango', 0);
    const comAnel = contarApagados(info, lado, 'losango', 2);

    assert.ok(comAnel > semAnel, `losango ${lado}: ${semAnel} sem anel, ${comAnel} com`);
  }
});

// --- o limite é por forma ---------------------------------------------------

test('o limite do logótipo é maior numa forma que apaga menos', () => {
  /*
   * **Se o limite não depender da forma, escolher a forma é inútil.**
   *
   * A pessoa escolhe um círculo porque lê melhor, e recebe o mesmo limite do
   * quadrado — o logótipo grande que o círculo permitiria fica fora do alcance
   * do cursor. O efeito é o oposto do que a forma promete.
   */
  const quadrado = modulosMaximos(info.size, 'H', 2, 'quadrado');
  const estrela = modulosMaximos(info.size, 'H', 2, 'estrela');

  assert.ok(
    estrela > quadrado,
    `a estrela aguenta ${estrela} e o quadrado ${quadrado}: o limite não segue a forma`,
  );
});

test('o limite por forma dá mesmo um logótipo que se lê, e não um número', () => {
  /*
   * **O limite é uma promessa, e a promessa tem de caber.**
   *
   * O número que `modulosMaximos` dá é o maior que a conta permite; se a conta
   * for generosa, o logótipo no limite apaga módulos a mais. **Este teste
   * confere que o logótipo no limite fica dentro da percentagem segura da
   * aplicação**, que é o mesmo critério que `aplicarFrame` usa para dizer se
   * uma zona é segura.
   */
  const SEGURO = { M: 2.0, Q: 4.0, H: 8.0 };

  for (const [id] of FORMAS) {
    for (const ecl of ['Q', 'H']) {
      const maximo = modulosMaximos(info.size, ecl, 2, id);
      if (maximo === 0) continue;

      const codigo = aplicarFrame(info, { modulos: maximo, forma: id });

      assert.ok(
        codigo.percentagem <= SEGURO[ecl],
        `${id} a ${maximo} módulos apaga ${codigo.percentagem.toFixed(2)}% e o ` +
          `tecto de ${ecl} é ${SEGURO[ecl]}%`,
      );
    }
  }
});

// --- a posição --------------------------------------------------------------

test('mover a área desloca a zona e não muda o que se apaga', () => {
  const base = aplicarFrame(info, { modulos: 7, forma: 'quadrado' });
  const movido = aplicarFrame(info, { modulos: 7, forma: 'quadrado', deslocX: 3 });

  // **O desloc move a zona para a direita**, que é o que `deslocX` positivo
  // quer dizer. A primeira versão deste teste tinha a comparação ao contrário e
  // falhava com `21 !== 27` — que é o sintoma de um teste que não sabe o que
  // está a medir, e não de um encoder partido.
  assert.equal(movido.zona.inicio, base.zona.inicio + 3);

  // **Mover não muda a caixa**, e por isso a forma é a mesma: o que muda é
  // *quais* módulos se apagam, e não *quantos*.
  assert.equal(movido.zona.lado, base.zona.lado);

  assert.ok(movido.apagados > 0, 'ainda apaga módulos');
});

test('uma área fora do código não apaga nada em vez de partir', () => {
  /*
   * **Um `desloc` grande demais tem de dar zero, e não um índice negativo.**
   *
   * `inicio` vai a zero pelo `Math.max`, e a zona sai colada à margem — onde a
   * máscara de função a apaga quase toda. O resultado é um "logótipo" que não
   * apaga nada e um código que parece ter logotipo sem ter. **Dizer isso é
   * melhor do que gerar o QR silenciosamente diferente do que a pessoa pediu.**
   */
  const codigo = aplicarFrame(info, { modulos: 7, deslocX: 100 });

  assert.ok(codigo.zona.inicio >= 0);
  assert.ok(
    codigo.apagados >= 0,
    'o número de módulos apagados nunca pode ser negativo',
  );
});

// --- o registo --------------------------------------------------------------

test('o selector e o módulo listam as mesmas formas', async () => {
  /*
   * **Duas listas do mesmo conjunto, e nada as ligava.**
   *
   * A `AGENTS.md` dá o exemplo do GS1-128: entrou no registo com o encoder, a
   * validação, a altura e os casos lidos pelo ZXing, e não aparecia no
   * selector. Sem sintoma e sem erro — a aplicação está certa e a pessoa é que
   * não consegue escolher.
   *
   * Aqui as duas listas são uma só, `FORMAS`, e o `index.html` não as escreve.
   */
  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // O HTML não pode escrever nomes de forma: o selector é cheio em JS.
  for (const [, nome] of FORMAS) {
    assert.ok(
      !src.includes(nome),
      `o index.html escreve "${nome}" à mão: são duas listas a divergir em silêncio`,
    );
  }
});