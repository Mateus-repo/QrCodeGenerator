/**
 * Code 39.
 *
 * Um dos codigos de barras mais antigos ainda em uso, e o mais facil de ler a
 * olho. Automoveis, defesa e fabricas.
 *
 * Cada caractere tem **nove** elementos — cinco barras e quatro espacos — dos
 * quais **tres sao largos**. E a simplicidade que o torna popular: um leitor de
 * fabricas e um programa de facturacao custam uma fracao do que custam para
 * Code 128. A contrapartida e o comprimento: ocupa quase o dobro do espaco de um
 * Code 128 para o mesmo texto.
 *
 * **A tabela vem de outro sitio, e isso e deliberado.** A primeira versao deste
 * ficheiro foi escrita de memoria e saiu com doze elementos por caractere em
 * vez de nove. Nenhum teste estrutural a apanha: o codigo desenha-se com o
 * aspecto certo e o leitor devolve outra coisa, ou nada.
 *
 * As tabelas abaixo sao a mesma tabela que a biblioteca `python-barcode` usa, e
 * essa biblioteca e uma referencia da industria. Cada entrada e uma cadeia de
 * quinze modulos; as larguras dos nove elementos leem-se nas corridas de
 * caracteres iguais, onde 1 e estreito e 3 e largo. Verificavel linha a linha
 * contra `barcode/charsets/code39.py`.
 */

/** Os 43 caracteres, por ordem. O indice e o valor do digito de controlo. */
const ALFABETO = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z',
  '-', '.', ' ', '$', '/', '+', '%',
];

/** O inicio e a paragem sao ambos um asterisco, com o mesmo padrao. */
const PARAGEM = '100010111011101';

/** Um caractere de cada, em cadeias de quinze modulos. Ver o ficheiro de origem. */
const PADROES = [
  '101000111011101', '111010001010111', '101110001010111', '111011100010101',
  '101000111010111', '111010001110101', '101110001110101', '101000101110111',
  '111010001011101', '101110001011101', '111010100010111', '101110100010111',
  '111011101000101', '101011100010111', '111010111000101', '101110111000101',
  '101010001110111', '111010100011101', '101110100011101', '101011100011101',
  '111010101000111', '101110101000111', '111011101010001', '101011101000111',
  '111010111010001', '101110111010001', '101010111000111', '111010101110001',
  '101110101110001', '101011101110001', '111000101010111', '100011101010111',
  '111000111010101', '100010111010111', '111000101110101', '100011101110101',
  '100010101110111', '111000101011101', '100011101011101', '100010001000101',
  '100010001010001', '100010100010001', '101000100010001',
];

/**
 * A razao larga/estreita.
 *
 * Tres para um, e o que a especificacao prescreve. O leitor mede-a no
 * asterisco de paragem e usa-a para o resto — se a razao estiver errada, ou se
 * mudar entre o inicio e os dados, o leitor nao reconhece um unico caractere.
 */
const LARGO = 3;
const ESTREITO = 1;

/** Converte a cadeia de modulos num array de modulos, com as larguras. */
function modulosDe(cadeia) {
  const modulos = [];
  for (const bit of cadeia) {
    const largura = bit === '1' ? 1 : 1;
    for (let k = 0; k < largura; k++) modulos.push(bit === '1');
  }
  return modulos;
}

/**
 * A cadeia de quinze modulos transformada em barras com a largura certa.
 *
 * A cadeia tem quinze caracteres, e as larguras dos nove elementos leem-se nas
 * corridas. Uma corrida de 3 e um elemento largo (tres modulos); uma de 1 e
 * estreito. A soma das larguras da sempre quinze.
 */
function modulosDaCorrida(cadeia) {
  const larguras = [];
  let atual = cadeia[0];
  let contagem = 0;
  for (const bit of cadeia) {
    if (bit === atual) contagem += 1;
    else {
      larguras.push({ escuro: atual === '1', largura: contagem });
      atual = bit;
      contagem = 1;
    }
  }
  larguras.push({ escuro: atual === '1', largura: contagem });

  if (larguras.length !== 9) {
    throw new Error(`Code 39: a tabela tem ${larguras.length} elementos, e devem ser 9 ("${cadeia}")`);
  }

  const largos = larguras.filter((l) => l.largura > 1).length;
  if (largos !== 3) {
    throw new Error(`Code 39: ${largos} elementos largos, e devem ser 3 ("${cadeia}")`);
  }

  const modulos = [];
  for (const l of larguras) {
    for (let k = 0; k < l.largura; k++) modulos.push(l.escuro);
  }
  return modulos;
}

export function code39(valor, opcoes = {}) {
  const { comControlo = true } = opcoes;
  const texto = String(valor).toUpperCase();

  if (texto.length === 0) {
    throw new Error('Code 39: o texto esta vazio');
  }

  for (const c of texto) {
    if (c === '*') {
      throw new Error(
        'Code 39: o asterisco e o caractere de inicio e de paragem, e nao pode ' +
          'estar nos dados. Para o imprimir na letra use Full ASCII Code 39.',
      );
    }
    if (PADROES[ALFABETO.indexOf(c)] === undefined) {
      throw new Error(
        `Code 39: "${c}" nao existe neste codigo. Sao 43 caracteres: ` +
          '0-9, A-Z, espaco, e - . $ / + %.',
      );
    }
  }

  let dados = texto;
  if (comControlo) {
    const soma = [...texto].reduce((total, c) => total + ALFABETO.indexOf(c), 0);
    dados = texto + ALFABETO[soma % 43];
  }

  /*
   * O espaco estreito entre caracteres e o que os separa. Sem ele, um
   * caractere comeca a meio do anterior e o codigo nao se le.
   *
   * Tem de estar em **todos** os intervalos, e o intervalo que mais se esquece
   * e o primeiro: entre o asterisco de inicio e o primeiro caractere. O
   * asterisco acaba numa barra e o primeiro caractere comeca noutra barra, e
   * coladas formam uma barra de quatro modulos que o leitor conta como um
   * elemento largo a mais. Foi por isso que o codigo nao lia, com a tabela
   * certa.
   */
  const separador = false;
  const modulos = [...modulosDaCorrida(PARAGEM), separador];

  for (const c of dados) {
    modulos.push(...modulosDaCorrida(PADROES[ALFABETO.indexOf(c)]), separador);
  }

  // O asterisco de paragem substitui o ultimo separador, e traz o espaco largo
  // que fecha o codigo.
  modulos.push(...modulosDaCorrida(PARAGEM));

  return {
    symbology: 'Code 39',
    modules: modulos,
    guards: [0, modulos.length - 1],
    caption: dados,
    semControlo: texto,
  };
}

export { ALFABETO as ALFABETO_CODE39, PADROES as PADROES_CODE39 };
