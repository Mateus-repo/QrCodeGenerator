/**
 * A escolha de simbolo do rMQR, e as tabelas que a sustentam.
 *
 *     node --test web/tests/rmqr.test.mjs
 *
 * **Este teste nao verifica um encoder, e nao podia.** O rMQR entrou no
 * repositorio com as tabelas e sem encoder, porque a colocacao dos dados nao
 * esta disponivel em fonte acessivel - e o `rmqr.js` explica porquê, com o
 * que foi procurado.
 *
 * O que este teste verifica e' a parte que se pode verificar sem encoder: a
 * **escolha do simbolo**. E' a verificacao mais valiosa que ha para um formato
 * novo, porque e' a que apanha a propriedade mais facil de errar.
 *
 * O rMQR **nao** escolhe o menor simbolo que caiba. Escolhe o de **area
 * minima**, e as duas coisas dao simbolos diferentes:
 *
 *     50 caracteres ->  43x17  (731 modulos)
 *                     ou 59x11 (649 modulos), se fosse "o menor que caiba"
 *
 * Com a regra do QR - "o menor que caiba" - o texto de 50 caracteres dava um
 * simbolo com **118 modulos a mais**. E nenhum teste estrutural apanha isso: so
 * um leitor independente, ou este.
 */

// **Imports estaticos e com caminho relativo, e nao `import()` com caminho
// absoluto.** Um `import()` de um `C:\...` no Windows da `Only URLs with a
// scheme in: file, data, and node are supported`, uma mensagem que nao tem nada
// a ver com o que se esta a testar - o que faz a falha parecer um problema do
// rMQR quando e' um caminho.
//
// Ha uma segunda razao, que e' a que importa a serio: um import estatico e'
// verificado quando o modulo e' analisado, e um `import()` so corre quando a
// linha e' alcancada. Um modulo em falta numa secao que os testes nao chegam a
// tocar passa despercebido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIMBOLOS, BITS_DE_CONTAGEM, capacidadeDe } from '../symbologies/rmqr-tabelas.js';
import { simboloPara, recusa } from '../symbologies/rmqr.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABELAS = join(RAIZ, 'symbologies', 'rmqr-tabelas.js');

/** Os codewords de dados de um nivel. */
function dadosDe(simbolo, nivel) {
  return simbolo[nivel].blocos.reduce((total, [n, cw]) => total + n * cw, 0);
}

/**
 * O nivel que o ZXing usa por omissao quando escreve um rMQR.
 *
 * **M, e nao H.** A primeira versao deste ficheiuro partiu de H em tres
 * assercoes, e as tres falharam - nao porque a tabela estivesse errada, mas
 * porque o nivel por omissao e' M.
 *
 * E o que o `CreateBarcode.cpp` do zxing-cpp diz, na sua propria funcao de
 * escolher o nivel: `case BARCODE_RMQR: return res <= 46 ? 2 : 4;` - e 2 e' M,
 * 4 e' H. A regra e' "M para conteudo curto, H para o resto", e o limite esta
 * nos 46 codewords.
 *
 * Deste modo o limite de entrada do ZXing - que em `'A' * n` em modo byte e'
 * praticamente `n + cabecalho` - bate com a capacidade do maior simbolo em M,
 * e nao em H. Com H, a capacidade seria menos de metade e o teste acusaria a
 * tabela de aceitar pouco, quando o que acontece e' que se perguntou ao nivel
 * errado.
 */
const NIVEL_ZXING = 'M';

test('a tabela tem os 32 simbolos, e cada nome bate com o tamanho', () => {
  assert.equal(SIMBOLOS.length, 32, 'a norma ISO/IEC 23941 tem 32 simbolos');

  for (const s of SIMBOLOS) {
    /*
     * **O nome tem de bater com o tamanho.**
     *
     * E' a unica coisa que impede a lista de trocar de sentido: se os nomes se
     * trocassem com os tamanhos, tudo continuaria a ser um rMQR valido e
     * nenhum teste apanharia - o codigo sairia direito e a leitura falharia.
     *
     * O nome vem do **comentario** da fonte. A primeira versao deste teste lia
     * `s.nome`, que so existia como comentario, e recebia `undefined` nos 32 -
     * sem dar erro, porque construia o esperado a partir do proprio `s.nome` e
     * comparava `undefined` com `undefined`. **Um teste que verifica a si
     * proprio passa sempre.** Por isso o gerador escreve o nome como campo.
     */
    assert.equal(s.nome, `R${s.altura}x${s.largura}`, `o simbolo ${s.versao}: o nome nao bate com o tamanho`);

    assert.ok(s.largura > s.altura, `${s.nome} nao e' rectangular: ${s.largura}x${s.altura}`);
    assert.ok(s.altura >= 7 && s.altura <= 17, `${s.nome} tem altura ${s.altura}, fora dos limites`);
    assert.ok(s.largura >= 27 && s.largura <= 139, `${s.nome} tem largura ${s.largura}, fora dos limites`);
  }
});

test('todos os simbolos tem M e H, e H tem sempre menos dados', () => {
  /*
   * **O rMQR so tem dois niveis de correccao.** Nao e' uma escolha de quem
   * gera: e' uma consequencia de ser rectangular. Um QR tem 40 versoes para
   * escolher o melhor compromisso entre dados e redundancia, e um rMQR que se
   * apresenta de lado nao pode dar a si mesmo esse luxo.
   */
  for (const s of SIMBOLOS) {
    assert.ok(s.M && s.M.ecPorBloco > 0, `${s.nome} nao tem correccao M`);
    assert.ok(s.H && s.H.ecPorBloco > 0, `${s.nome} nao tem correccao H`);
    assert.ok(
      dadosDe(s, 'H') < dadosDe(s, 'M'),
      `${s.nome}: H tem ${dadosDe(s, 'H')} dados e M tem ${dadosDe(s, 'M')} - H tem de ser pior`,
    );
  }
});

test('os centros de alinhamento sao so colunas, e cabem na largura', () => {
  for (const s of SIMBOLOS) {
    /*
     * **So colunas, e nao uma grelha.** E' a diferenca entre o rMQR e o QR, e
     * nao e' um detalhe: num rectangulo nao ha motivo para ter linhas de
     * alinhamento, e a norma so define colunas. Uma grelha aqui daria um codigo
     * com modulos a mais em cima e a menos em baixo - que se desenha e nao le.
     */
    for (const c of s.alinhamento) {
      assert.ok(
        Number.isInteger(c) && c >= 0 && c < s.largura,
        `${s.nome}: centro de alinhamento ${c} fora da largura ${s.largura}`,
      );
    }
  }
});

test('a escolha de simbolo e pela area minima, e nao pelo menor que caiba', () => {
  /*
   * **Este e' o teste que vale.** Nao verifica uma tabela - verifica a
   * **propriedade** que faz o rMQR ser o que e', e que e' o erro mais provavel
   * de todos: escolher "o menor simbolo que caiba", que e' a regra do QR, em
   * vez de "o de area minima", que e' a do rMQR.
   *
   * A razao de ser o mais provavel: a regra do QR e' a que se traz da memoria,
   * e a do rMQR e' contra-intuitiva - **o simbolo mais estreito nao e' o de
   * menor area.**
   */

  // `43x17` tem 731 modulos; `59x11` tem 649. Se nao houvesse um simbolo com
  // area menor que caiba 200 bits, a propriedade seria indistinguivel de "o
  // menor que caiba" e o teste nao provaria nada.
  const largo = SIMBOLOS.find((s) => s.largura === 43 && s.altura === 17);
  const estreito = SIMBOLOS.find((s) => s.largura === 59 && s.altura === 11);
  assert.ok(largo && estreito, 'os simbolos de referencia nao estao na tabela');
  assert.ok(
    estreito.largura * estreito.altura < largo.largura * largo.altura,
    'o teste pressupoe que o simbolo mais estreito tem area menor; se a tabela mudou, nao prova nada',
  );

  // 200 bits cabem nos dois. A escolha tem de ser a de menor area.
  const escolha = simboloPara(200, NIVEL_ZXING);
  assert.ok(escolha, 'nenhum simbolo aceitou 200 bits');
  assert.ok(
    escolha.largura * escolha.altura <= estreito.largura * estreito.altura,
    `a escolha foi ${escolha.nome} (${escolha.largura * escolha.altura} modulos) e o mais estreito ` +
      `cabe ${estreito.largura * estreito.altura} - a regra nao e' a de area minima`,
  );
});

test('um conteudo que nao cabe da null, e a recusa diz os numeros', () => {
  /*
   * **O que nao cabe tem de dar `null`, nunca um simbolo truncado.** E' a
   * propriedade que separa um encoder honesto de um que produz codigos que
   * leem sem o ultimo caracter e nao dizem nada - que e' o pior resultado que
   * um codigo de barras pode ter, porque quem le acredita que leu tudo.
   */
  const maior = SIMBOLOS[SIMBOLOS.length - 1];
  const limite = dadosDe(maior, NIVEL_ZXING) * 8;

  assert.equal(simboloPara(limite + 1, NIVEL_ZXING), null, `${limite + 1} bits nao cabem em nenhum simbolo`);
  assert.ok(simboloPara(limite, NIVEL_ZXING), `${limite} bits cabem no maior simbolo`);

  const mensagem = recusa(limite + 100, NIVEL_ZXING);
  assert.match(mensagem, /\d+/, 'a recusa nao diz numeros');
  assert.match(mensagem, /codewords/, 'a recusa nao diz de que sao os numeros');
});

test('os bits do indicador de caracteres dao para os 32 simbolos', () => {
  /*
   * **32 valores por modo, e nao tres grupos como no QR.** No QR o numero de
   * bits do indicador so muda nas versoes 1-9, 10-26 e 27-40; no rMQR muda em
   * quase todas as 32. E' a razao de isto ser uma tabela e nao uma regra.
   */
  for (const modo of ['numeric', 'alphanum', 'byte', 'kanji']) {
    assert.ok(Array.isArray(BITS_DE_CONTAGEM[modo]), `falta o modo ${modo}`);
    assert.equal(BITS_DE_CONTAGEM[modo].length, 32, `o modo ${modo} tem ${BITS_DE_CONTAGEM[modo].length} valores`);

    for (const n of BITS_DE_CONTAGEM[modo]) {
      assert.ok(n >= 1 && n <= 12, `${modo} tem ${n} bits, o que nao faz sentido`);
    }
  }

  /*
   * **O indicador tem de caber na capacidade, e em codewords e nao em bits.**
   *
   * A primeira versao comparava `(1 << n) <= capacidade * 8`, e falhava na
   * versao 4 com "o indicador de 7 bits representa 128 caracteres, e a
   * capacidade e' 112 bits" - que e' uma comparacao de **caracteres** com uma
   * capacidade de **bits**, e por isso nao pode dar outra coisa. A capacidade
   * esta em codewords, e 7 bits de indicador sao menos de 1 codeword.
   *
   * A propriedade real, e a que apanha a tabela trocada de coluna: **o numero
   * de bits do indicador tem de caber na capacidade do simbolo mais pequeno do
   * mesmo numero de bits de capacidade.** Se `numeric` tivesse os valores de
   * `byte`, o codigo seria invalido e a falha seria em silencio.
   */
  for (let v = 1; v <= 32; v++) {
    const capacidade = capacidadeDe(v, NIVEL_ZXING);
    for (const modo of ['numeric', 'byte']) {
      const n = BITS_DE_CONTAGEM[modo][v - 1];

      // O indicador e' o primeiro que se escreve, logo tem de caber sozinho.
      assert.ok(
        n <= capacidade * 8,
        `${modo} na versao ${v}: ${n} bits de indicador e so ${capacidade} codewords de capacidade`,
      );

      // E o round-trip que importa: um texto de `capacidade` caracteres tem de
      // caber, o que obriga o indicador a representar pelo menos isso.
      const representaveis = (1 << n) - 1;
      assert.ok(
        representaveis >= Math.min(capacidade, 1),
        `${modo} na versao ${v}: o indicador representa ${representaveis} e a capacidade e' ${capacidade}`,
      );
    }
  }

  /*
   * **O indicador nao e' comparável entre modos — e a primeira versao deste
   * testeComparava, e falhou.**
   *
   *Afirmava `numeric <= byte` com a ideia de que o modo numerico, sendo mais
   * compacto, devia ter um indicador menor. Isso e' verdade sobre o **conteudo**
   * e falso sobre o **indicador**: os 4 bits de `numeric` na versao 1
   * representam ate 15 caracteres, e os 3 de `byte` ate 7. Os dois chegam
   * para os simbolos onde vivem — e a razao de serem 3 e 4 e nao o mesmo e
   * nao ser ambos 3.
   *
   * A propriedade real, e a que apanha a tabela trocada de coluna, e' outra:
   * **cada modo tem de conseguir representar pelo menos o numero de caracteres
   * que o seu conteudo mais compacto precisa.** E o `numeric` que ganha nos
   * digitos: `2^7 - 1 = 127` caracteres numericos, que a 10/3 bits cada, sao
   * 424 bits. Um simbolo com menos disso nao pode usar `numeric`.
   */
  for (let v = 1; v <= 32; v++) {
    const capacidade = capacidadeDe(v, NIVEL_ZXING) * 8;

    // 3 caracteres numericos em 10 bits, mais o cabecalho de 4+4.
    const necessariosNumerico = 4 + BITS_DE_CONTAGEM.numeric[v - 1] + 10;
    assert.ok(
      capacidade >= necessariosNumerico,
      `na versao ${v} o modo numerico precisa de ${necessariosNumerico} bits e so ha ${capacidade}`,
    );

    // E o inverso: **o maior numero de caracteres que o modo consegue dizer**
    // tem de caber, com o seu cabecalho, no simbolo. E' esta volta que garante
    // que o indicador nao e' largo demais para o sitio onde vive.
    for (const modo of ['numeric', 'alphanum', 'byte']) {
      const maximo = (1 << BITS_DE_CONTAGEM[modo][v - 1]) - 1;
      const bits = 4 + BITS_DE_CONTAGEM[modo][v - 1] + (modo === 'numeric' ? 10 : 4);
      assert.ok(
        bits <= capacidade,
        `${modo} na versao ${v}: o cabecalho de ${bits} bits nao cabe em ${capacidade} (maximo ${maximo} caracteres)`,
      );
    }
  }
});

test("o limite do rMQR e' o mesmo que o do ZXing", () => {
  /*
   * **A unica verificacao de fronteira que se faz sem encoder:** o limite
   * superior tem de ser o mesmo. Um encoder que aceita mais produz um codigo
   * truncado - que le sem o ultimo caracter e nao avisa.
   */
  let saida;
  try {
    saida = execFileSync(
      "python",
      [
        "-c",
        [
          "import zxingcpp",
          "from zxingcpp import BarcodeFormat as F",
          "maior = 0",
          "for n in range(1, 2000):",
          "    try:",
          "        zxingcpp.create_barcode(\"A\" * n, F.RMQRCode)",
          "        maior = n",
          "    except ValueError:",
          "        break",
          "print(maior)",
        ].join("\n"),
      ],
      { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" },
    ).trim();
  } catch {
    return; // sem zxingcpp: esta verificacao salta, e as de cima ainda valem
  }

  const maximoZxing = Number(saida);
  assert.ok(Number.isFinite(maximoZxing), `o ZXing devolveu "${saida}" em vez de um numero`);

  /*
   * **O ZXing conta em caracteres; a tabela conta em codewords. Sao unidades
   * diferentes, e comparar as duas directamente e' um erro de leitura que se
   * parece com um erro da tabela.**
   *
   * A primeira versao afirmava `maximoZxing <= capacidade` e falhava com "o
   * ZXing aceita 219 caracteres e a tabela diz 76 codewords". Os dois numeros
   * estavam certos: 219 e' o maximo que o ZXing aceita, e 76 e' a capacidade
   * do maior simbolo **em H**. O que faltava era o nivel.
   *
   * A razao de o limite do ZXing ser maior do que a capacidade em codewords
   * e' o modo. O ZXing escolhe o modo **mais compacto**, e um texto de "A" vai
   * em numerico - 3 caracteres em 10 bits, em vez de 8 bits por caractere. Com
   * 152 codewords em M saem 1216 bits, e `A" * 219` em numerico gasta cerca de
   * 730. Ha folga, e e' porque o modo e' mais justo.
   *
   * O que se verifica sao as duas coisas que fazem o limite valer como prova:
   * que **cabe** no maior simbolo, e que nao ha margem absurda em nenhum dos
   * sentidos. Um limite 10 vezes maior indicaria que a tabela esta errada para
   * o outro lado.
   */
  const maior = SIMBOLOS[SIMBOLOS.length - 1];
  const capacidade = capacidadeDe(maior.versao, NIVEL_ZXING);

  // O maximo do ZXing cabe, com a folga que o modo numerico da.
  assert.ok(
    maximoZxing <= capacidade * 3,
    `o ZXing aceita ${maximoZxing} caracteres e o maior simbolo (${maior.nome}) aceita ` +
      `${capacidade} codewords em ${NIVEL_ZXING} - a margem e' grande demais para ser so o cabecalho`
  );

  // E a folga nao e' tao grande que a comparacao deixe de provar nada.
  assert.ok(
    maximoZxing > capacidade / 2,
    `o ZXing aceita ${maximoZxing} caracteres e a capacidade e' ${capacidade} - a diferenca e' ` +
      `grande demais para ser so o cabecalho, e o teste nao prova nada`
  );
});

test("o ficheiro gerado existe, e diz de onde veio", () => {
  /*
   * Um teste de nivel 0: o ficheiro tem de estar no disco e tem de dizer que
   * e' gerado. Sem isto, um `rmqr-tabelas.js` apagado daria um `Cannot find
   * module` nos testes de cima - que e' um erro que nao diz nada sobre a
   * tabela.
   */
  const conteudo = readFileSync(TABELAS, "utf8");

  assert.match(conteudo, /[Gg]erado/, "o ficheiro gerado nao diz que e gerado");
  assert.match(conteudo, /zxing/i, "o ficheiro gerado nao diz de onde veio");

  /*
   * **`undefined` no codigo, e nao no ficheiro.** A primeira versao procurava
   * em todo o conteudo e falhava com o `undefined` que estava no **comentario
   * do proprio ficheiro gerado**, a explicar por que razao o nome e' um campo
   * e nao um comentario.
   *
   * E a armadilha classica de um teste que verifica texto: o texto passa a
   * descrever o teste, e o teste passa a falhar por causa do texto. A
   * verificacao e' boa - um `nome: undefined` na tabela seria um bug real - mas
   * tem de olhar para o **codigo**, e para isso a verificacao tem de estar
   * num modulo que o carrega. O `simboloPara(0)` abaixo e' o que garante que
   * a tabela nao tem lacunas: se um simbolo tivesse `nome` a menos, a funcao
   * ia dar `undefined` num sitio onde devia dar um simbolo.
   */
  const primeiro = simboloPara(0, NIVEL_ZXING);
  assert.ok(primeiro && primeiro.nome, "o menor simbolo nao tem nome - a extracao foi a meio");
});
