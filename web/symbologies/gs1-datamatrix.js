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
import { AIS, aiDe } from './gs1-tabelas.js';

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
  const campos = analisar(elementoString);

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

/**
 * Separa o texto em campos e valida cada um contra a tabela de AIs.
 *
 * **A validação é a do GS1-128, e a tabela é a mesma.** Só não se copia: o
 * `aiDe` e a tabela vêm de `gs1-tabelas.js`, e o que se repete é a *chamada*, que
 * é o que se quer. Duas listas de AI divergem - e já houve uma divergência
 * dessas no repositório, entre o HTML e o registo.
 */
function analisar(texto) {
  const campos = [];
  let i = 0;

  while (i < texto.length) {
    if (texto[i] !== '(') {
      throw new Error(
        `GS1 DataMatrix: esperava um "(" na posicao ${i} de "${texto}". A forma de ` +
          "leitura humana e' (01)04012345678901(10)LOTE-A1.",
      );
    }

    const fecho = texto.indexOf(')', i);
    if (fecho < 0) {
      throw new Error(`GS1 DataMatrix: o "(" na posicao ${i} de "${texto}" nao fecha.`);
    }

    const numero = texto.slice(i + 1, fecho);
    if (!/^\d+$/.test(numero)) {
      throw new Error(`GS1 DataMatrix: o AI "${numero}" nao e' so digitos.`);
    }

    const encontrado = aiDe(numero);
    if (!encontrado) {
      throw new Error(
        `GS1 DataMatrix: o AI (${numero}) nao existe. A tabela tem ${Object.keys(AIS).length} AIs.`,
      );
    }

    const inicio = fecho + 1;
    let conteudo;
    let fim;

    if (encontrado.fixo !== null) {
      fim = inicio + encontrado.fixo;
      conteudo = texto.slice(inicio, fim);
    } else {
      const proximo = texto.indexOf('(', inicio);
      fim = proximo < 0 ? texto.length : proximo;
      conteudo = texto.slice(inicio, fim);
    }

    const limpo = conteudo.trim();

    if (limpo === '') {
      throw new Error(`GS1 DataMatrix: o AI (${encontrado.numero}) nao tem valor.`);
    }

    if (encontrado.maximo !== null && limpo.length > encontrado.maximo) {
      throw new Error(
        `GS1 DataMatrix: o AI (${encontrado.numero}) aceita no maximo ` +
          `${encontrado.maximo} caracteres e o valor "${limpo}" tem ${limpo.length}.`,
      );
    }

    if (!new RegExp(`^(?:${encontrado.re})$`).test(limpo)) {
      throw new Error(
        `GS1 DataMatrix: o valor "${limpo}" do AI (${encontrado.numero}) nao ` +
          `corresponde ao que a GS1 define. O formato e' ${encontrado.f}.`,
      );
    }

    /*
     * `numerico` decide se o valor vai no modo de dígitos ou em ASCII, e é a
     * diferença entre `(01)04012345678901` e `(10)LOTE-A1`.
     *
     * A pergunta não é "o valor tem só dígitos?", que seria o jeito fácil e
     * errado: `(17)270630` tem só dígitos e o AI é numérico, mas um `(240)`
     * pode ter um valor alfanumérico que **só** se pode ir em ASCII. O que
     * decide é o **AI**, não o valor: o `01` é o GTIN e é numérico por
     * definição, e o `10` é o lote e é alfanumérico. Um AI numérico com letras
     * no valor é um dado inválido, e o regex da GS1 já o recusa.
     */
    const tipo = encontrado.campos[0]?.tipo;
    const numerico = tipo === 'N';

    campos.push({
      ai: encontrado.numero,
      conteudo: (encontrado.resto || '') + limpo,
      valor: (encontrado.resto || '') + limpo,
      separador: encontrado.sep,
      numerico,
    });

    i = fim;
  }

  if (campos.length === 0) {
    throw new Error('GS1 DataMatrix: o texto nao tem nenhum campo.');
  }

  return campos;
}
