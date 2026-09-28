/**
 * Code 128.
 *
 * O codigo de barras que aparece em quase todas as etiquetas de encomenda. Ha
 * quem lhe chame o "codigo de barras universal" e nao e exagero: e o unico que
 * codifica os 128 caracteres ASCII ao mesmo tempo, e ainda assim e mais
 * compacto do que o Code 39.
 *
 * Tem tres conjuntos de caracteres que se sobrepoem, e o encoder muda de um
 * para o meio:
 *
 *   A  os controlos (ASCII 0-31) e as maiusculas
 *   B  o ASCII imprimivel (ASCII 32-127)
 *   C  so digitos, dois de cada vez (valores 0-99)
 *
 * O conjunto C e o que torna o Code 128 ozinho: um numero de 10 digitos ocupa
 * 5 caracteres em vez de 10. E por isso que a logistica o usa.
 *
 * A estrutura e: caracter de inicio, dados, um caracter de verificacao, e um
 * caracter de paragem. O de verificacao e a soma ponderada de todos os valores
 * modulo 103 — nao e um digito de controlo como o do EAN, e um valor de
 * conjunto, e pode valer de 0 a 102.
 *
 * **O detalhe que faz toda a diferenca:** como os conjuntos partilham parte dos
 * valores, o encoder tem de emitir um caracter *de cada vez que muda*, para o
 * leitor saber em que conjunto le. Sem isso o codigo desenha-se perfeito, o
 * leitor le, e devolve caracteres completamente errados — "ABC123" volta como
 * "ABC,3". Foi o primeiro bug deste encoder, apanhado pelo ZXing e nao por
 * nenhum teste estrutural.
 */

/**
 * Os 107 padroes, em larguras de barra e espaco alternadas, sempre a comecar
 * com barra. O ultimo tem sete elementos em vez de seis porque a paragem
 * acrescenta uma barra de dois modulos no fim.
 *
 * Os ultimos quatro nao sao dados: 103, 104 e 105 sao os caracteres de inicio
 * dos conjuntos A, B e C, e 106 e a paragem.
 */
const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

/** Os valores de inicio, por conjunto. */
const INICIO = { A: 103, B: 104, C: 105 };

/** Os valores que mudam de conjunto a meio da leitura. */
const IR_PARA_A = 101;
const IR_PARA_B = 100;
const IR_PARA_C = 99;

const VALOR_DO_CONJUNTO = { A: IR_PARA_A, B: IR_PARA_B, C: IR_PARA_C };

const PARAGEM = 106;

function modulosDoPadrao(valor) {
  const padrao = PADROES[valor];
  if (padrao === undefined) throw new Error(`Code 128: o valor ${valor} nao existe`);

  const modulos = [];
  for (let i = 0; i < padrao.length; i++) {
    // Posicao par = barra, impar = espaco.
    const escuro = i % 2 === 0;
    for (let k = 0; k < Number(padrao[i]); k++) modulos.push(escuro);
  }
  return modulos;
}

/**
 * O conjunto em que vale a pena codificar a partir desta posicao.
 *
 *  - dois digitos seguidos: conjunto C, porque dois caracteres cabem num;
 *  - um controlo (ASCII abaixo de 32): so o conjunto A o transporta;
 *  - o resto: conjunto B.
 *
 * O conjunto C nunca serve para um digito isolado: sair de B para C e voltar
 * custa tres caracteres para gravar um.
 */
function melhorConjunto(texto, i) {
  if (i + 1 < texto.length && /^\d\d$/.test(texto.slice(i, i + 2))) return 'C';
  return texto.charCodeAt(i) < 32 ? 'A' : 'B';
}

/** O valor de um caracter dentro de um conjunto. */
function valorNoConjunto(caractere, conjunto) {
  const c = caractere.charCodeAt(0);
  // No conjunto A, os valores 0-63 sao o proprio ASCII e os 64-95 sao as
  // maiusculas, com 32 subtraidos. No B e sempre ASCII menos 32.
  if (conjunto === 'A') return c <= 63 ? c : c - 32;
  return c - 32;
}

/**
 * Com que conjunto se comeca.
 *
 * So o C vale a pena comecar quando ha quatro digitos seguidos: ai cada par
 * gasta um caracter em vez de dois, e o ganho paga a troca de conjunto.
 *
 * O A so quando o texto comeca por um controlo. As maiusculas vivem em A e em B
 * com o mesmo valor, e o B tambem transporta os minusculos, por isso comecar em
 * A para uma letra nao traria nada.
 */
function conjuntoInicial(texto) {
  if (texto.charCodeAt(0) < 32) return 'A';
  for (let i = 0; i + 3 < texto.length; i++) {
    if (/^\d{4}$/.test(texto.slice(i, i + 4))) return 'C';
  }
  return 'B';
}

/**
 * Transforma o texto na lista de valores, ja com as trocas de conjunto.
 *
 * A cada posicao pergunta-se qual e o melhor conjunto para o que vem a seguir.
 * Se for diferente do conjunto em que estamos, emite-se o caracter de troca.
 */
function codificar(texto, conjuntoInicialForcado) {
  let conjunto = conjuntoInicialForcado ?? conjuntoInicial(texto);
  const valores = [INICIO[conjunto]];

  let i = 0;
  while (i < texto.length) {
    const desejado = conjuntoInicialForcado ? conjuntoInicialForcado : melhorConjunto(texto, i);

    if (desejado !== conjunto) {
      valores.push(VALOR_DO_CONJUNTO[desejado]);
      conjunto = desejado;
    }

    if (conjunto === 'C') {
      valores.push(Number(texto.slice(i, i + 2)));
      i += 2;
    } else {
      valores.push(valorNoConjunto(texto[i], conjunto));
      i += 1;
    }
  }

  return valores;
}

/**
 * Code 128.
 *
 * Por omissao escolhe os conjuntos sozinho. `forcarConjunto` fixa um so, e
 * serve para comparar com outra implementacao — nunca em producao, porque
 * força o conjunto C sobre texto que nao e todo de digitos e o codigo fica
 * maior sem ganho nenhum.
 */
export function code128(valor, opcoes = {}) {
  const { forcarConjunto = null } = opcoes;
  const texto = String(valor);

  if (texto.length === 0) {
    throw new Error('Code 128: o texto esta vazio');
  }

  for (const c of texto) {
    const n = c.codePointAt(0);
    if (n === 128) {
      throw new Error('Code 128: o valor 128 e o de paragem e nao pode estar nos dados');
    }
    if (n > 127) {
      throw new Error(
        `Code 128: so ASCII, e "${c}" (U+${n.toString(16).toUpperCase()}) nao e. ` +
          'Para acentos e alfabetos nao latinos use o QR.',
      );
    }
  }

  if (forcarConjunto && !INICIO[forcarConjunto.toUpperCase()]) {
    throw new Error(`Code 128: conjunto "${forcarConjunto}" nao existe (A, B ou C)`);
  }

  const forcado = forcarConjunto ? forcarConjunto.toUpperCase() : null;
  const dados = codificar(texto, forcado);

  // O valor de verificacao: o inicio mais cada valor de dados multiplicado
  // pela sua posicao, a primeira a valer 1. Modulo 103.
  let soma = dados[0];
  for (let i = 1; i < dados.length; i++) soma += dados[i] * i;
  const verificacao = soma % 103;

  const todos = [...dados, verificacao, PARAGEM];

  const modulos = [];
  for (const v of todos) modulos.push(...modulosDoPadrao(v));

  return {
    symbology: 'Code 128',
    modules: modulos,
    /**
     * O Code 128 nao tem barras-guarda como o EAN: e a barra final de dois
     * modulos da paragem que serve de referencia. Marcamos as pontas para o
     * desenho nao as tratar como se fossem guardas.
     */
    guards: [],
    caption: texto,
    valores: todos,
    verificacao,
    conjunto: forcado ?? conjuntoInicial(texto),
  };
}

export { INICIO as CONJUNTOS_INICIO, PADROES as PADROES_CODE128 };
