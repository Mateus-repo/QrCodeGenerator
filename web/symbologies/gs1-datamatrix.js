/**
 * GS1 DataMatrix.
 *
 * O Data Matrix com o FNC1, e nada mais. É o que vai na etiqueta de uma ampola de
 * farmácia e de um chip: quadradinho, minúsculo, e com a capacidade de um
 * símbolo que se lê de longe e de lado.
 *
 * ## O que muda em relação ao Data Matrix
 *
 * Duas coisas, e as duas são o FNC1 - o codeword 232:
 *
 *  1. **No início**, logo no primeiro codeword de dados. É o que diz ao leitor
 *     "isto é GS1" e não texto solto.
 *  2. **No fim de cada campo de comprimento variável**, menos no último. É o
 *     separador, e é o que permite ao leitor saber onde acaba `(10)LOTE-A1` e
 *     onde começa o campo seguinte.
 *
 * ## Porque isto não é "o texto com um 232 à frente"
 *
 * **O 232 é simultaneamente o FNC1 e o par de dígitos "02"**, porque
 * 232 - 130 = 102. Só a posição os distingue: na posição 0 é o FNC1, no meio é
 * um "02" qualquer. Passar pelo `compactar()` do Data Matrix normal perderia
 * essa estrutura, e o separador no meio do lote seria lido como os dígitos "02".
 *
 * Por isso o encoder emite codewords e não texto, e por isso o `datamatrix.js`
 * ganhou a opção `codewords`, que salta a compactação. Todo o resto - a escolha
 * do símbolo, o enchimento, a correcção de erros, a colocação - **é o mesmo**,
 * porque uma segunda implementação de cada uma delas seria uma segunda fonte de
 * verdade sobre a parte que o ZXing verifica.
 *
 * ## Os AI vêm da mesma tabela
 *
 * A tabela dos 541 AIs é a de `gs1-tabelas.js`, a mesma que o GS1-128 usa, gerada
 * do JSON-LD de `ref.gs1.org`. Não há uma segunda tabela de AI, e não há uma
 * segunda notação: os campos de um GS1 DataMatrix são os mesmos campos de um
 * GS1-128, e um `(10)` tem o mesmo comprimento num e no outro.
 *
 * O que muda é a notação dos AIs dentro do símbolo: no Data Matrix, **os dígitos
 * do AI e do valor numérico vão no modo de dígitos**, que emparelha e soma 130.
 * E é por isso que o FNC1 é ambíguo - o "02" de `(02)` e o 232 são o mesmo
 * codeword.
 *
 * ## O que o leitor devolve, medido
 *
 * Com `tests/ver-dm-fnc1.py`, antes deste encoder existir:
 *
 *  - `symbology_identifier` — `]d2` com FNC1 no início, `]d1` sem.
 *  - `content_type` — `GS1` com FNC1, `Text` sem.
 *  - `bytes` — os campos com `0x1D` onde está o separador, como no GS1-128.
 *  - `text` — os AI entre parênteses, como no GS1-128, e `<GS>` no separador.
 *
 * É melhor do que se esperava: ao contrário do QR com logótipo, aqui **tudo** é
 * verificável por leitura, incluindo o separador. Não há parte que fique só
 * verificada estruturalmente.
 */

import { dataMatrixDeCodewords, FNC1_DATAMATRIX } from './datamatrix.js';

/**
 * O `analisar` e' **o do GS1-128**, e nao uma copia.
 *
 * Este ficheiro tinha o seu proprio `analisar`, e a copia divergiu em dois sitios -
 * os dois silenciosos, que e' o pior tipo:
 *
 *  1. Usava `encontrado.maximo`, que e' o comprimento do **ultimo** componente, em
 *     vez do `comprimentoTotal`, que e' a **soma**. Sao **44 AIs** em que isso
 *     recusava um valor que a GS1 aceita e que o GS1-128 aceitava no mesmo texto.
 *  2. Lia `campos[0]?.tipo`, e **a tabela do JavaScript usa `t`**. O `undefined` nao
 *     da erro nenhum: `numerico` ficava sempre `false` e **nenhum numero ia no modo
 *     de digitos**. O codigo desenhava-se certo e lia-se certo - cada digito
 *     ocupava um codeword em vez de meio - e o unico sintoma era o simbolo ficar
 *     maior do que devia.
 *
 * **Nenhum dos dois dava erro, e nenhum era apanhado por um teste de leitura.** O
 * segundo e' o pior: um codigo que se le bem e ocupa o dobro do espaco. A prova do
 * primeiro esta' em `tests/provar-maximo-gs1-datamatrix.mjs`.
 *
 * A correccao que fecha o buraco nao e' corrigir a copia: e' **nao haver copia**.
 * A tabela de 541 AIs, o `fixo`, o `maximo`, o `resto` e o `regex` da GS1 sao os
 * mesmos nos dois formatos - o que muda entre um GS1-128 e um GS1 DataMatrix e' o
 * desenho, nao a notacao dos campos - e o `rotulo` existe so para a mensagem dizer
 * "GS1 DataMatrix" em vez de "GS1-128".
 *
 * E **a tabela dos digitos nao vem de outra fonte**: o Python usa `tipo` e o
 * JavaScript usa `t`, porque o `spec/gerar-tabelas-gs1.py` escreve chaves do
 * tamanho de cada linguagem. Ler o codigo de uma com as chaves da outra da `undefined`
 * - e `undefined` nao parte, o codigo corre e faz a coisa errada.
 */
import { analisar } from './gs1-128.js';

/** O FNC1 do Data Matrix, que faz as duas coisas: sinaliza e separa. */
export const FNC1 = FNC1_DATAMATRIX;

/** O GS que separa os campos, o mesmo byte que o leitor devolve. */
const GS = '\x1d';

/**
 * O modo de dígitos: emparelha e soma 130.
 *
 * O Data Matrix tem um modo só para números, em que dois dígitos cabem num
 * codeword. O GS1 usa-o para **os AI e para os valores numéricos**, que é o que
 * torna o 232 ambíguo: o par "02" dá 2 + 130 = 132, e o FNC1 é 232.
 *
 * Um dígito que fica sem par - o último de um AI com número ímpar de dígitos -
 * vai no modo ASCII, o valor mais um. Não há outro jeito: o modo de dígitos
 * trabalha aos pares.
 */
function digitos(texto) {
  const saida = [];
  let i = 0;

  while (i < texto.length) {
    if (i + 1 < texto.length) {
      saida.push(Number(texto.slice(i, i + 2)) + 130);
      i += 2;
    } else {
      saida.push(texto.charCodeAt(i) + 1);
      i += 1;
    }
  }

  return saida;
}

/** O modo ASCII: o valor mais um. */
function ascii(texto) {
  return [...texto].map((c) => c.charCodeAt(0) + 1);
}

/**
 * O GS1 DataMatrix.
 *
 * @param {string} elementoString os campos na forma humana da GS1, com os AI
 *   entre parênteses: `(01)04012345678901(10)LOTE-A1(17)270630`. Igual ao
 *   GS1-128, e pela mesma razão - é a forma que a GS1 define e a que a pessoa
 *   lê. Os parênteses não vão para o símbolo.
 */
export function gs1DataMatrix(elementoString) {
  /*
   * **O `analisar` e' o do GS1-128, com o rotulo certo.** O rotulo nao e' um
   * detalhe: uma mensagem que diz "GS1-128" quando o utilizador esta' a fazer um
   * GS1 DataMatrix manda-o procurar o erro na codigo de barras em vez de na matriz.
   */
  const { campos } = analisar(elementoString, 'GS1 DataMatrix');

  /*
   * Os codewords, na ordem: FNC1, e depois cada campo com o seu separador.
   *
   * **A regra do separador é a do GS1-128 e tem a mesma excepção**: no fim de um
   * campo de comprimento variável, menos no último. Um FNC1 a mais produz um
   * `0x1D` nos bytes que o leitor não esperava, e o GS1 DataMatrix é lido por
   * leitores que são mais rigorosos que o ZXing.
   *
   * E cada campo vai codificado conforme o que é: o AI e os valores numéricos no
   * modo de dígitos, o resto em ASCII. Um `(10)LOTE-A1` dá o "10" em dígitos e o
   * "LOTE-A1" em ASCII, e é essa mistura que faz o 232 ser ambíguo.
   */
  const codewords = [FNC1];

  for (let i = 0; i < campos.length; i++) {
    const campo = campos[i];
    const ultimo = i === campos.length - 1;

    codewords.push(...digitos(campo.ai));
    codewords.push(...(campo.numerico ? digitos(campo.conteudo) : ascii(campo.conteudo)));

    if (campo.separador && !ultimo) codewords.push(FNC1);
  }

  const codigo = dataMatrixDeCodewords(codewords, 'GS1 DataMatrix');

  return {
    ...codigo,
    campos,
    gs1: campos.map((c) => `(${c.ai})${c.valor}`).join(''),
    /**
     * A forma de máquina, sem parênteses e com o `GS` nos separadores - que é o
     * que o ZXing devolve nos `bytes`, e portanto o que o teste compara.
     */
    payload: campos
      .map((c, i) => c.ai + c.valor + (c.separador && i !== campos.length - 1 ? GS : ''))
      .join(''),
    separadores: codewords.filter((c) => c === FNC1).length,
  };
}

