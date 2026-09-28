/**
 * ITF — Interleaved 2 of 5, e a sua variante ITF-14.
 *
 * O codigo das caixas de cartao. E o unico aqui que se imprime directamente no
 * cartao canelado, sem etiqueta, e continua legivel por causa disso.
 *
 * Chama-se "2 of 5" porque cada digito usa cinco elementos dos quais dois sao
 * largos. E chama-se "interleaved" porque os digitos se_emendam: o primeiro vai
 * todo nas barras, o segundo todo nos espacos, e assim por diante. E essa a
 * diferenca que o torna tao compacto — dez digitos ocupam o mesmo que quinze no
 * Code 39.
 *
 * A contrapartida e ser so digitos, e o ITF-14 ter de ser sempre um numero par
 * de digitos, porque os leem aos pares.
 *
 * **A notacao das tabelas:** letra maiuscula e barra, minuscula e espaco. `W`
 * e uma barra larga, `w` um espaco largo, `N` uma barra estreita, `n` um espaco
 * estreito. Confundir maiuscula com "larga" foi o primeiro bug deste encoder: a
 * moldura de paragem ficou com dois elementos em vez de tres, e o codigo nao
 * lia. A tabela vem de `python-barcode`, `barcode/charsets/itf.py`.
 */

/** A moldura de inicio: quatro elementos, todos estreitos. */
const INICIO = 'NnNn';

/**
 * A moldura de paragem: **tres** elementos — barra larga, espaco estreito,
 * barra estreita.
 *
 * O ultimo elemento e uma barra, e sem ele o leitor nao sabe onde acaba o
 * codigo. E a unica barra larga do codigo inteiro, e por isso que a razao se
 * mede aqui.
 */
const PARAGEM = 'WnN';

/** Os cinco elementos de cada digito. */
const PADROES = {
  0: 'NNWWN', 1: 'WNNNW', 2: 'NWNNW', 3: 'WWNNN', 4: 'NNWNW',
  5: 'WNWNN', 6: 'NWWNN', 7: 'NNNWW', 8: 'WNNWN', 9: 'NWNWN',
};

const LARGURA = { N: 1, n: 1, W: 2, w: 2 };

function modulosDe(elementos) {
  const modulos = [];
  for (let i = 0; i < elementos.length; i++) {
    const escuro = i % 2 === 0; // maiuscula = barra
    for (let k = 0; k < LARGURA[elementos[i]]; k++) modulos.push(escuro);
  }
  return modulos;
}

/** ITF simples. Exige um numero par de digitos: os sao lidos aos pares. */
export { INICIO as INICIO_ITF, PARAGEM as PARAGEM_ITF, PADROES as PADROES_ITF };

export function itf(valor) {
  const digitos = String(valor).replace(/[\s-]/g, '');

  if (!/^\d+$/.test(digitos)) {
    throw new Error(`ITF: so aceita digitos, recebeu "${valor}"`);
  }
  if (digitos.length === 0) {
    throw new Error('ITF: o texto esta vazio');
  }
  if (digitos.length % 2 !== 0) {
    throw new Error(
      `ITF: ${digitos.length} digitos, e o formato le-os aos pares. ` +
        'Faltou um digito. Se o numero for fixo, use ITF-14, que acrescenta o ' +
        'digito de controlo que falta.',
    );
  }

  const modulos = [...modulosDe(INICIO)];

  for (let i = 0; i < digitos.length; i += 2) {
    const barras = PADROES[digitos[i]];
    const espacos = PADROES[digitos[i + 1]];

    // As barras do primeiro digito e os espacos do segundo, elemento a
    // elemento. E o "interleaved".
    for (let e = 0; e < 5; e++) {
      for (let k = 0; k < LARGURA[barras[e]]; k++) modulos.push(true);
      for (let k = 0; k < LARGURA[espacos[e]]; k++) modulos.push(false);
    }
  }

  modulos.push(...modulosDe(PARAGEM));

  return {
    symbology: 'ITF',
    modules: modulos,
    guards: [0, modulos.length - 1],
    caption: digitos,
  };
}

/**
 * ITF-14: treze digitos de dados mais um de controlo, sempre quatorze.
 *
 * O digito de controlo pondera os treze primeiros com pesos 3, 1, 3, 1... a
 * partir da esquerda — ao contrario do EAN, porque aqui o que conta e a posicao
 * a partir do inicio da esquerda, e nao a proximidade do digito de controlo.
 */
export function itf14(valor) {
  const digitos = String(valor).replace(/[\s-]/g, '');

  if (!/^\d+$/.test(digitos)) {
    throw new Error(`ITF-14: so aceita digitos, recebeu "${valor}"`);
  }
  if (digitos.length !== 13) {
    throw new Error(
      `ITF-14: espera 13 digitos de dados, recebeu ${digitos.length}. ` +
        'O ultimo, o digito de controlo, calcula-se sozinho.',
    );
  }

  let soma = 0;
  for (let i = 0; i < 13; i++) {
    soma += Number(digitos[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const controlo = (10 - (soma % 10)) % 10;

  const completo = digitos + String(controlo);
  const codigo = itf(completo);

  return {
    symbology: 'ITF-14',
    modules: codigo.modules,
    guards: codigo.guards,
    caption: completo,
    digitoControlo: controlo,
  };
}
