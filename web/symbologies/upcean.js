/**
 * Familia UPC/EAN.
 *
 * Tres simbologias que partilham quase tudo: as mesmas tabelas de combinacao e
 * o mesmo digito de controlo.
 *
 *   EAN-13  13 digitos, 95 modulos.  Supermercado.
 *   EAN-8    8 digitos, 67 modulos.  Embalagens pequenas (pastilhas).
 *   UPC-A   12 digitos.  O equivalente norte-americano do EAN-13 com um zero a
 *            esquerda, e a mesma matriz — um UPC-A lido como EAN-13 devolve 0
 *            seguido dos 12 digitos.
 *
 * A estrutura e sempre a mesma: barra de guarda, metade esquerda, guarda de
 * centro, metade direita, barra de guarda. O que muda e quantos digitos vao em
 * cada metade e que combinacao (L ou G) cada digito da esquerda usa.
 *
 * **UPC-E nao esta aqui, de proposito.** E a versao comprimida, so codifica
 * uma parte dos produtos (todos os digitos a zero ou um, mais o numero de
 * sistema), e a sua tabela de paridade depende do digito de controlo do UPC-A
 * expandido. Escrever essa tabela de memoria e a forma rapida de entregar codigos
 * que nao passam em leitor nenhum. Fica para quando se puder conferir contra a
 * ISO/IEC 6120, e nesse dia entram aqui com o resto.
 *
 * As tabelas vem da especificacao. Estao escritas com o zero primeiro porque e
 * assim que estao em qualquer livro de referencia — se as virar, ninguem as
 * consegue confirmar.
 */

/** Codigos de combinacao L (paridade impar). Usados na metade esquerda. */
const L = {
  0: '0001101', 1: '0011001', 2: '0010011', 3: '0111101', 4: '0100011',
  5: '0110001', 6: '0101111', 7: '0111011', 8: '0110111', 9: '0001011',
};

/**
 * Codigos de combinacao G (paridade par), que sao o R lido de tras para a
 * frente. E por isso que se guardam assim: a tabela R e a G sao a mesma coisa
 * vista dos dois lados, e e mais facil confirmar olhando do que recalcular.
 */
const G = {
  0: '0100111', 1: '0110011', 2: '0011011', 3: '0100001', 4: '0011101',
  5: '0111001', 6: '0000101', 7: '0010001', 8: '0001001', 9: '0010111',
};

/** Codigos de combinacao R (paridade par). Metade direita. */
const R = {
  0: '1110010', 1: '1100110', 2: '1101100', 3: '1000010', 4: '1011100',
  5: '1001110', 6: '1010000', 7: '1000100', 8: '1001000', 9: '1110100',
};

/**
 * A primeira tabela de EAN-13: quantos digitos da esquerda saem com
 * combinacao G em vez de L. Determina a paridade do codigo inteiro, e e o
 * que permite a um leitor de baixa resolucao saber onde acaba o codigo.
 */
const PARIDADE_EAN13 = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/** As guardas. Barras-guarda sao mais altas e servem de ancora para o leitor. */
const GUARDA_INICIO = '101';
const GUARDA_CENTRO = '01010';
const GUARDA_FIM = '101';

/**
 * Digito de controlo EAN/UPC.
 *
 * A regra, sem ambiguidades: **o digito mais a direita dos dados pesa 3**, e a
 * partir dai alterna 3, 1, 3, 1... para a esquerda. A soma tem de dar multiplos
 * de dez, e o digito e o que falta.
 *
 * Comecar pela esquerda em vez disso e o erro classico, porque o peso depende
 * do numero de digitos de dados:
 *
 *   EAN-13, 12 dados: o 12o (o ultimo) pesa 3, logo o 1o pesa 1.
 *   UPC-A,  11 dados: o 11o (o ultimo) pesa 3, logo o 1o pesa 3.
 *
 * Os dois comecam a contar de um sitio diferente, e usar a mesma regra para os
 * dois da um digito de controlo errado no UPC-A — que e o numero impresso por
 * baixo do codigo e o que o leitor devolve.
 *
 *   400638133393 -> 4*1+0*3+0*1+6*3+3*1+8*3+1*1+3*3+3*1+3*3+9*1+3*3 = 89 -> 1
 *   03600029145  -> 0*3+3*1+6*3+0*1+0*3+0*1+2*3+9*1+1*3+4*1+5*3 = 58 -> 2
 */
export function digitoDeControlo(digitos) {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    const d = Number(digitos[i]);
    // Quantos digitos ha a direita deste. Zero = e o ultimo, e pesa 3.
    const distancia = digitos.length - 1 - i;
    soma += distancia % 2 === 0 ? d * 3 : d;
  }
  return (10 - (soma % 10)) % 10;
}

function digitosDe(value, esperado, nome) {
  const limpo = String(value).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(limpo)) {
    throw new Error(`${nome}: so aceita digitos, recebeu "${value}"`);
  }
  if (limpo.length !== esperado) {
    throw new Error(`${nome}: espera ${esperado} digitos, recebeu ${limpo.length} ("${limpo}")`);
  }
  return limpo;
}

/** Junta os bits de uma string de 0 e 1 a um array de modulos. */
function acrescentar(modulos, bits) {
  for (const bit of bits) modulos.push(bit === '1');
}

/**
 * EAN-13.
 *
 * O primeiro digito nao e codificado: e ele que escolhe a paridade dos seis
 * seguintes, e por isso o codigo completo so tem os 6 + 6 restantes visiveis.
 */
export function ean13(valor) {
  let d = digitosDe(valor, 12, 'EAN-13');
  d += String(digitoDeControlo(d));

  const paridade = PARIDADE_EAN13[Number(d[0])];

  const modulos = [];
  const guardas = [0];

  acrescentar(modulos, GUARDA_INICIO);

  // Seis digitos a esquerda, cada um em L ou G conforme a paridade do 1o digito.
  for (let i = 1; i <= 6; i++) {
    acrescentar(modulos, paridade[i - 1] === 'L' ? L[d[i]] : G[d[i]]);
  }

  guardas.push(modulos.length);
  acrescentar(modulos, GUARDA_CENTRO);
  guardas.push(modulos.length);

  // Seis a direita, sempre em R.
  for (let i = 7; i <= 12; i++) {
    acrescentar(modulos, R[d[i]]);
  }

  acrescentar(modulos, GUARDA_FIM);
  guardas.push(modulos.length);

  return {
    symbology: 'EAN-13',
    modules: modulos,
    guards: guardas,
    caption: d,
    /** O primeiro digito e impresso a esquerda da barra de guarda, como manda a norma. */
    prefix: d[0],
  };
}

/** EAN-8. Mais curto, para quando 8 digitos chegam e nao cabe um EAN-13. */
export function ean8(valor) {
  let d = digitosDe(valor, 7, 'EAN-8');
  d += String(digitoDeControlo(d));

  const modulos = [];
  const guardas = [0];

  acrescentar(modulos, GUARDA_INICIO);
  for (let i = 0; i < 4; i++) acrescentar(modulos, L[d[i]]);

  guardas.push(modulos.length);
  acrescentar(modulos, GUARDA_CENTRO);
  guardas.push(modulos.length);

  for (let i = 4; i < 8; i++) acrescentar(modulos, R[d[i]]);

  acrescentar(modulos, GUARDA_FIM);
  guardas.push(modulos.length);

  return {
    symbology: 'EAN-8',
    modules: modulos,
    guards: guardas,
    caption: d,
  };
}

/**
 * UPC-A.
 *
 * E um EAN-13 a comecar por zero. A matriz e identica — 95 modulos — e a unica
 * diferenca no texto e que o zero nao se imprime.
 */
export function upcA(valor) {
  const data = digitosDe(valor, 11, 'UPC-A');
  const controlo = digitoDeControlo(data);

  // O zero vai antes dos 11 digitos de dados, e nao depois do digito de
  // controlo: e o EAN-13 que calcula o digito de controlo dos seus 12.
  //
  // O resultado e o mesmo que o do UPC-A. No UPC-A (12 digitos) os pesos
  // comecam em 3 a partir da esquerda; no EAN-13 (13 digitos) comecam em 1, e
  // o primeiro digito e o zero que acabamos de prepor, que nao pesa nada. Os
  // 12 seguintes ficam com 3, 1, 3, 1... — exatamente a mesma conta.
  const codigo = ean13('0' + data);

  return {
    symbology: 'UPC-A',
    modules: codigo.modules,
    guards: codigo.guards,
    caption: data + String(controlo),
  };
}
