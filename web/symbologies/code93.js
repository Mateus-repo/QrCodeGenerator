/**
 * Code 93.
 *
 * O codigo de barras dos automoveis e da defesa, e o unico que transporta os
 * 128 caracteres ASCII com a mesma Correccao de erros - e ao mesmo tempo e'
 * **compacto demais**: seis caracteres, tres barras e tres espacos, onde o Code
 * 39 usa nove elementos por caracter.
 *
 * ## Onde e' que ele ganha ao Code 39
 *
 * A razao esta no numero de elementos. O Code 39 e' "sete de nove e dois de
 * cinco", porque cada caracter e' um start, seis barras e espacos, e um stop -
 * e o espaco entre caracteres e' um espaco estreito. O Code 93 nao tem
 * separacao: os caracteres correm uns nos outros, e a barra de inicio e a de fim
 * servem de separador.
 *
 * Isso da um codigo **13% mais curto** para o mesmo texto, e o Code 93
 * acrescenta a correccao de erros, que o Code 39 nao tem.
 *
 * ## Os quatro caracteres de controle
 *
 * A tabela tem 48 entradas e as ultimas quatro sao de controle, escritas no
 * ZXing como `a`, `b`, `c` e `d` para se poderem imprimir. Sao o que permite ao
 * Code 93 codificar os 128 caracteres ASCII num codigo que so tem 48 valores: um
 * caractere de controle e' o par "letra de escape" mais a letra seguinte, e o
 * leitor sabe que a leu.
 *
 * O `a` mais uma maiuscula da os controles de SH a SB, o `d` mais uma
 * maiuscula da as minusculas, e o `b` e o `c` dao o resto. E' o mesmo
 * mecanismo do C0, e e' a razao de o Code 93 ser ASCII completo sem ter 128
 * caracteres na tabela.
 *
 * ## Os dois digitos de controlo
 *
 * Ao contrario do Code 39, que tem um digito de controlo, o Code 93 tem **dois**,
 * com pesos diferentes: o primeiro pesa 1 a 20 e o segundo 1 a 15, ambos
 * aplicados de tras para a frente. E o que torna o codigo seguro contra a
 * inversao de dois caracteres, que o Code 39 nao apanha.
 */

import {
  ALFABETO,
  ASTERISCO,
  CONTROLES,
  INDICE,
  MODULO_CHECKSUM,
  PADROES,
} from './code93-tabelas.js';

/**
 * O Code 93.
 *
 * @param {string} valor o que codificar. ASCII, minusculas e tudo - as
 *   minusculas e os controles sao o que o Code 93 tem e o Code 39 nao.
 *
 * @returns `{modulos, guards, symbology, caption}` com os modulos, os indices
 *   das barras de inicio e fim, e a legenda com os dois digitos de controlo
 *   incluidos - que e' o que se imprime por baixo, e e' obrigatorio numa
 *   etiqueta de automovel.
 */
export function code93(valor) {
  const texto = validar(String(valor));

  /*
   * O texto passa pela **codificacao estendida** antes de qualquer outra coisa.
   *
   * A tabela tem 48 entradas e nenhuma delas e' uma minuscula. As minusculas
   * vao como o par de escape - o `d` da tabela - mais a letra maiuscula, e o
   * leitor desfaz o par quando le. Sem este passo, `teste-93` falha logo no `t`
   * com "o caractere nao tem padrao" - que e' o que a primeira versao fazia, e e'
   * a razao de o Code 93 ser ASCII completo num codigo de 48 valores.
   *
   * O mesmo se passa com os caracteres de controlo: cada um e' um par.
   */
  const estendido = [...codificarEstendido(texto)];

  /*
   * Os dois digitos de controlo, que vao no fim e sao lidos de tras para a
   * frente com pesos diferentes.
   *
   * **O peso reinicia quando passa o maximo, e nao quando chega ao fim.** A
   * primeira versao somava com `i % max` e nao com um contador que reinicia, e o
   * resultado era um digito de controlo diferente em qualquer texto com mais de
   * vinte caracteres - ou seja, quase todos. O codigo desenhava-se bem, o
   * primeiro digito batia certo e o segundo nao, e o leitor recusava por checksum
   * sem dizer qual dos dois.
   *
   * E os digitos sao calculados sobre o texto **ja estendido**, nao sobre o
   * original: o checksum e' do que esta no codigo, e o que esta no codigo e' o
   * texto com os escapes. Calcular sobre o original daria um digito diferente em
   * qualquer texto com minusculas.
   */
  const comControlos = [...estendido, ...doisControlos(estendido)];

  /*
   * **O asterisco no inicio e no fim, e nao e' opcional.**
   *
   * E' o start e o stop do Code 93, e sem eles o leitor nao sabe onde comeca o
   * codigo - a primeira versao emitia os dados e os digitos de controlo, e os
   * asteriscos so apareciam na lista de `guards`, que e' informacao para o
   * desenho e nao vai no codigo. O ZXing le uma fila de modulos, e o asterisco
   * nunca la estava.
   *
   * A razao de o asterisco ser o **mesmo** nas duas pontas, e nao dois
   * caracteres diferentes, e' que o Code 93 nao tem start e stop proprios como o
   * Code 39: usa um caractere normal da tabela, que o leitor reconhece pela forma.
   * E a barra de terminacao depois do stop e' a unica coisa solitaria.
   */
  const comAsteriscos = ['*', ...comControlos, '*'];

  const modulos = [];
  const guards = [];

  for (let i = 0; i < comAsteriscos.length; i++) {
    const indice = INDICE.get(comAsteriscos[i]);
    if (indice === undefined) {
      throw new Error(`Code 93: o caractere "${comAsteriscos[i]}" nao tem padrao`);
    }

    // O asterisco do inicio e o do fim sao as guardas: sao o unico ponto de
    // referencia que o leitor tem, porque o Code 93 nao tem barras de guarda como
    // o EAN. Descem mais para se verem a olho.
    if (i === 0 || i === comAsteriscos.length - 1) guards.push(modulos.length);

    modulos.push(...modulosDo(indice));
  }

  /*
   * **A barra de terminacao.**
   *
   * O ZXing acrescenta **uma barra preta** no fim, depois da barra de fim, e sem
   * ela o codigo nao le. Nao e' um start nem um stop: e' a unica barra solitaria
   * do codigo, e o que da ao leitor a certeza de que leu ate ao fim.
   *
   * E' mais uma coisa que a primeira versao nao tinha, e o sintoma foi o pior
   * possivel - o codigo desenhava-se certo, o comprimento era o que o ZXing
   * esperava, e a leitura dava nada sem dizer porque. O leitor usa a barra de
   * terminação como a ancora de que a proxima coisa e' margem muda, e sem ela
   * ele assume que ainda ha codigo e descarta o que leu.
   */
  modulos.push(1);

  return {
    symbology: 'Code 93',
    modules: modulos,
    /** As barras de inicio e de fim, para o desenho as tratar como guardas. */
    guards,
    /*
     * A legenda com os dois digitos de controlo.
     *
     * **O ZXing devolve o texto sem eles**, porque sao de controlo e nao fazem
     * parte do dado. A legenda impressa tem de os ter, e e' por isso que esta e'
     * a string com os digitos e nao o `valor` que o utilizador escreveu - o
     * `descodificar` compara o que o leitor devolve com o `valor`, e a legenda
     * com a soma.
     */
    caption: comControlos.join(''),
  };
}

/**
 * O texto em codificacao estendida: a lista de caracteres da tabela.
 *
 * A tabela do Code 93 tem 48 entradas e **nenhuma e' uma minuscula nem um
 * caracter de controlo**. O que ha sao quatro caracteres de escape, escritos no
 * ZXing como `a`, `b`, `c` e `d`, e cada um marca que o par seguinte se le de
 * outra maneira:
 *
 *  - `d` mais uma maiuscula da a minuscula (`D` + `A` -> `a`);
 *  - `a` mais uma maiuscula da um controlo de SH a SB;
 *  - `b` mais uma maiuscula da os restantes, e tem **cinco** transformacoes
 *    diferentes conforme a letra;
 *  - `c` mais uma maiuscula da `!` a `,`.
 *
 * E' este passo que faz o Code 93 ser ASCII completo num codigo de 48 valores.
 * Sem ele, `teste-93` falha logo no `t` com "o caractere nao tem padrao" - que e'
 * o que a primeira versao fazia.
 */
function codificarEstendido(texto) {
  const saida = [];

  for (const c of texto) {
    /*
     * **Uma busca na tabela, e nao uma escada de regras.**
     *
     * A tabela do Code 93 tem 48 entradas e nenhuma e' uma minuscula nem um
     * caracter de controlo: o que ha sao quatro caracteres de escape, escritos
     * no ZXing como `a`, `b`, `c` e `d`, e cada um marca que o par seguinte se
     * le de outra maneira:
     *
     *  - `d` mais uma maiuscula da a minuscula (`dA` -> `a`);
     *  - `a` mais uma maiuscula da SH a SB;
     *  - `b` mais uma maiuscula dos restantes, e tem **seis** transformacoes;
     *  - `c` mais uma maiuscula da `!` a `,`.
     *
     * **Os pares vem do `decodeExtended` do ZXing invertido**, pelo mesmo
     * gerador que extrai os 48 padroes.
     *
     * **A primeira versao tinha uma escada escrita a mao, e estava errada em
     * vinte e quatro dos trinta e dois caracteres de controlo** — entre eles o
     * CR, que saia como o algarismo `0`, e o ESC, que saia como `bV`, que o
     * ZXing le como 64. **Nenhum dos dez casos tem um caracter de controlo**, e
     * por isso que a parte mais fragil do encoder nunca foi exercitada.
     *
     * E' este passo que faz o Code 93 ser ASCII completo num codigo de 48
     * valores. Sem ele, `teste-93` falha logo no `t` com "o caractere nao tem
     * padrao" — que e' o que a primeira versao fazia.
     *
     * **O `push(...escape)` e' o que torna isto correcto.** A entrada tem uma
     * letra para os caracteres do alfabeto e duas para os que precisam de
     * escape, e o `checksum` conta **um caracter de cada vez**: juntar a entrada
     * como uma cadeia daria um digito diferente em qualquer texto com minusculas.
     */
    const escape = CONTROLES[c.codePointAt(0)];
    if (escape === undefined) {
      throw new Error(`Code 93: o caractere "${c}" nao tem par de escape`);
    }

    saida.push(...escape);
  }

  return saida;
}

/**
 * Os dois digitos de controlo, como caracteres.
 *
 * O primeiro pesa 1 a 20 e o segundo 1 a 15, e os dois se leem de tras para a
 * frente com o peso a subir. O modulo e' 47 - e nao 43, que e' o numero de
 * caracteres de dados - porque na conta entram tambem os quatro de controle e o
 * asterisco.
 */
function doisControlos(texto) {
  const primeiro = checksum(texto, 20);
  /*
   * O segundo digito e' calculado **sobre o texto mais o primeiro digito**, e o
   * texto e' uma lista.
   *
   * A primeira versao escrevia `texto + ALFABETO[primeiro]`, e o `+` entre uma
   * lista e uma cadeia em JavaScript **concatena as cadeias**: `['A','B'] + 'C'`
   * dá `'A,B,C'`, com a virgula do meio. O `checksum` depois andava sobre essa
   * cadeia, a virgula nao esta no indice, e o segundo digito saia `undefined` -
   * que ia parar ao meio do codigo e o ZXing recusava por checksum.
   *
   * E' a concatenacao de listas com a **virgula** que engana: o resultado e' uma
   * cadeia aparentemente normal, e o `checksum` nao se queixa ate chegar a
   * virgula. Por isso o segundo digito se calcula com a lista, e nao com uma
   * cadeia montada a mao.
   */
  const comPrimeiro = [...texto, ALFABETO[primeiro]];
  const segundo = checksum(comPrimeiro, 15);
  return [ALFABETO[primeiro], ALFABETO[segundo]];
}

/** A soma ponderada, com o peso a reiniciar em `maximo`. */
function checksum(texto, maximo) {
  let peso = 1;
  let total = 0;

  for (let i = texto.length - 1; i >= 0; i--) {
    total += peso * INDICE.get(texto[i]);
    peso += 1;
    if (peso > maximo) peso = 1;
  }

  return total % 47;
}

/**
 * Os modulos de um padrao.
 *
 * **O padrao sao 3 elementos de 3 bits, e nao 6 de 2.** Nove bits divided por
 * tres dá tres, e o ZXing le-os assim: `pattern = (pattern << 1) | 0x01` para o
 * bit mais significant de cada elemento, e o `Math.round` que faz no leitor
 * confirma que o valor de cada elemento vai de 1 a 4 - o que so cabe em dois
 * bits, e o bit que sobra e' o do "largo".
 *
 * A ordem dentro de cada elemento e' **(comprimento em 2 bits, largo em 1 bit)**,
 * do mais significativo para o menos, e a ordem dos elementos e' barra, espaco,
 * barra, espaco, barra, espaco - **sempre comecando em barra**, porque o Code 93
 * nao tem start nem stop e cada caractere comeca por uma barra. E' o que torna
 * o codigo legivel por leitores antigos, que assumem que um codigo comeca sempre
 * numa barra.
 *
 * As duas primeiras versoes leram isto mal, e as duas falharam de maneira
 * diferente, o que e' o aviso:
 *
 *  - **dois bits por par, a comecar em espaco.** O codigo saia a comecar por
 *    espaco e o ZXing nao encontrava nenhuma barra para ancorar - a leitura
 *    dava nada. Com 2 bits por par, um padrao de 9 bits tem quatro pares e meio,
 *    e a soma de comprimentos dava 18 modulos em vez de 27.
 *  - **comecar em barra, mas com os comprimentos errados.** Dava 18 modulos
 *    ainda, porque o `(padrao >> i) & 3` com passo de 2 lia bits que nao sao os
 *    do comprimento.
 *
 * A soma de 9 e' a invariante, e por isso ha um `assert` em baixo em vez de um
 * comentario a dizer para estar atento. Um padrao mal lido pode dar 18, 27 ou
 * qualquer outra coisa, e so a soma diz.
 */
function modulosDo(indice) {
  const padrao = PADROES[indice];

  /*
   * **Os nove bits do inteiro sao os nove modulos, um a um, do mais
   * significativo para o menos.** Nao ha larguras a extrair e nao ha pares de
   * bits: o `appendPattern` do ZXing e'
   *
   *   for (i = 0; i < 9; i++) {
   *     temp = a & (1 << (8 - i));
   *     target[pos + i] = temp != 0;
   *   }
   *
   * e esta e' a leitura ao inverso, bit a bit. E' a forma mais simples possivel
   * e a que estava a ser evitada sem razao - o bit mais significativo e' o
   * primeiro modulo, e o menos significativo e' o ultimo.
   *
   * **Tres versoes erraram aqui, e as tres por tentar ser espertas.** A primeira
   * leu pares de 2 bits a comecar em espaco; a segunda, tres bits por elemento
   * com o comprimento nos dois bits altos; a terceira contou as runs de zeros.
   * Nenhuma deu os 9 modulos, e a soma de 9 e' o que teria dizendo logo qual
   * das hipoteses era a boa.
   *
   * A informacao de que ha barras e espacos continua a ser necessaria - para as
   * guardas e para o desenho -, mas nao para extrair os modulos. E' o `padrao`
   * que diz o que e' barra e o que e' espaco: a mascara, tal e qual.
   */
  const modulos = [];
  for (let i = 0; i < 9; i++) {
    modulos.push((padrao >> (8 - i)) & 1);
  }

  /*
   * A soma e' sempre 9 porque o loop tem nove voltas, e o `assert` de baixo nao
   * verifica isso: verifica que a tabela tem os nove bits que o ZXing promete.
   *
   * O que se verifica aqui e' que **o primeiro modulo e' uma barra**, que e' a
   * propriedade de que o leitor depende para ancorar. Um padrao que comece em
   * espaco desenha-se bem e nao e' lido por nada, e era o que acontecia na
   * primeira versao.
   */
  if (modulos[0] !== 1) {
    throw new Error(
      `Code 93: o padrao ${ALFABETO[indice]} (0x${padrao.toString(16)}) comeca em ` +
        'espaco, e o leitor precisa de uma barra para ancorar. A tabela esta errada.',
    );
  }

  return modulos;
}

/** O que o Code 93 aceita, e o que recusa com a razao. */
function validar(texto) {
  if (texto.length === 0) {
    throw new Error('Code 93: escreve alguma coisa para codificar.');
  }

  /*
   * O asterisco e' a marca de inicio e de fim, e nao pode estar nos dados.
   *
   * E o mesmo cuidado que o Code 39 tem, e pela mesma razao: um asterisco nos
   * dados faz o leitor terminar a leitura ali, e o que vem a seguir e' lido
   * como lixo. O codigo desenha-se e le-se - a metade, que e' pior do que nao
   * ler nada, porque parece que leu.
   */
  if (texto.includes('*')) {
    throw new Error(
      'Code 93: o asterisco e a marca de inicio e de fim, e nao pode estar nos dados.',
    );
  }

  for (const c of texto) {
    const n = c.codePointAt(0);
    if (n > 127) {
      throw new Error(
        `Code 93 e ASCII e "${c}" (U+${n.toString(16)}) nao e. ` +
          'Para acentos ou alfabetos nao latinos, usa QR.',
      );
    }
  }

  return texto;
}

export { ASTERISCO as ASTERISCO_CODE93, ALFABETO as ALFABETO_CODE93 };
