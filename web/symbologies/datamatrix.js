/**
 * Data Matrix (ECC200).
 *
 * O código da indústria: a farmácia, a aeroespacial, a defesa e a logística.
 * Vê-se em ampolas, em chips e em etiquetas de peça, e é o formato que
 * substituiu o código de barras quando a etiqueta ficou pequena demais para
 * ele.
 *
 * **É quadrado e não tem padrões de localização nos cantos.** Não há os três
 * quadrados do QR, e não há barras. A orientação vem de duas guias em L: uma
 * **cheia** em baixo e à esquerda, e outra **tracejada** em cima e à direita. É
 * isso que se vê numa etiqueta, e é a primeira coisa a acertar — uma guia
 * tracejada no sítio errado produz uma imagem que parece um Data Matrix e não
 * é lida por nada.
 *
 * Por dentro é mais próximo do PDF417 do que do QR: não há máscaras, não há
 * versões com nomes, e não há nada a escolher. Escolhe-se o menor tamanho que
 * caiba, e a correção de erros é fixa — o ECC200 é o único modo, e não se
 * escolhe o nível. O que se escolhe é **como** espremer o texto, e isso são
 * cinco modos.
 *
 * **Este encoder só usa dois**: ASCII e o deslocamento para ASCII estendido.
 * Os outros três — C40, Text e X12 — são modos de *compressão*, não de
 * correcção, e o código que sai sem eles é perfeitamente válido e lê em qualquer
 * leitor. A diferença é o tamanho: "MAST-2024-0001" sai um símbolo maior do que
 * sairia em C40. Está no TODO, e é a primeira coisa a fazer quando se voltar
 * aqui — é otimização, não conformidade.
 *
 * As tabelas estão em `datamatrix-tabelas.js`, geradas, e a verificação é
 * funcional: se um factor de Reed-Solomon estivesse errado, o ZXing não
 * devolveria o texto ao ler.
 */

import { SIMBOLOS, ULTIMO, FATORES } from './datamatrix-tabelas.js';

/** O codeword de enchimento. */
const PAD = 129;

/** O deslocamento para ASCII estendido, que vale para o codeword seguinte. */
const UPPER_SHIFT = 235;

/** O polinómio irredutível do corpo finito, e o que o ZXing chama de 0x12D. */
const MODULO = 0x12d;

/** A capacidade máxima, em codewords de dados, de qualquer símbolo. */
const CAPACIDADE_MAXIMA = SIMBOLOS[SIMBOLOS.length - 1][0];

// --- O corpo finito ----------------------------------------------------------

/**
 * As tabelas de logaritmos e anti-logaritmos de GF(256).
 *
 * **São calculadas, não transcritas**, e é o que torna este ficheiro diferente
 * dos de PDF417: aqui não há tabela para escrever de memória. O corpo é
 * gerado pelo polinómio 0x12D a partir do 1, e cada multiplications é uma soma
 * de logaritmos.
 *
 * O índice 255 repete o 0 porque `LOG[a] + LOG[b]` chega a 508 e a tabela de
 * exponenciais é usada com módulo 255.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let p = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = p;
    LOG[p] = i;
    p <<= 1;
    if (p & 0x100) p ^= MODULO;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const multiplicar = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// --- O tamanho do símbolo ---------------------------------------------------

/**
 * O menor símbolo quadrado que leva `codewords` de dados.
 *
 * A lista está por ordem de capacidade, e a primeira que chegue serve. Não há
 * escolha involved: é o menor que caiba, e o ECC200 é sempre o mesmo.
 */
function simboloPara(codewords) {
  if (codewords > CAPACIDADE_MAXIMA) {
    throw new Error(
      `Data Matrix: o conteúdo dá ${codewords} codewords e o maior símbolo ` +
        `leva ${CAPACIDADE_MAXIMA}. O limite é 1558 codewords de dados, e com ` +
        'acentos cada caractere pode gastar dois.',
    );
  }

  for (const simbolo of SIMBOLOS) {
    if (codewords <= simbolo[0]) return simbolo;
  }

  throw new Error(`Data Matrix: nenhum símbolo leva ${codewords} codewords`);
}

/** A geometria de um símbolo a partir da sua linha da tabela. */
function geometria(simbolo) {
  const [dados, correccao, largura, altura, regioes, blocoDados, blocoErros] = simbolo;

  return {
    dados,
    correccao,
    regiaoLargura: largura,
    regiaoAltura: altura,
    regioes,
    blocoDados: blocoDados === -1 ? dados : blocoDados,
    blocoErros: blocoErros === -1 ? correccao : blocoErros,
    // A largura e a altura do símbolo é a região de dados mais as duas guias.
    colunas: regioesColunas(regioes) * largura + regioesColunas(regioes) * 2,
    linhas: regioesLinhas(regioes) * altura + regioesLinhas(regioes) * 2,
  };
}

const regioesColunas = (n) => ({ 1: 1, 2: 1, 4: 2, 16: 4, 36: 6 })[n] ?? 1;
const regioesLinhas = (n) => ({ 1: 1, 2: 1, 4: 2, 16: 4, 36: 6 })[n] ?? 1;

// --- A codificação de nível alto --------------------------------------------

/**
 * O texto em codewords, no modo ASCII.
 *
 * Três regras, e só três:
 *
 *  - **Dígitos aos pares.** "2026" são dois codewords, e não quatro. O valor é
 *    `d1 * 10 + d2 + 130`. É a compressão do ECC200 de que o Data Matrix tira
 *    o nome: um número de série longo entra em metade do espaço.
 *  - **ASCII 0 a 127** entra com o valor mais um. O `+1` é para reservar o 0,
 *    que é o valor de um codeword que não existe.
 *  - **Tudo o resto** (128 a 255) leva um `UPPER_SHIFT` à frente e o valor
 *    menos 128. O deslocamento vale para um codeword só, e por isso um acento
 *    custa dois.
 *
 * Não há aqui nenhum valor aleatorizado, e é de propósito. A aleatorização
 * existe para que um 254 ou um 255 não pareçam um unlatch, e este encoder nunca
 * os emite; e o enchimento, esse sim, é aleatorizado — ver `encher`.
 */
function compactar(bytes) {
  const codewords = [];
  let i = 0;

  while (i < bytes.length) {
    const b = bytes[i];

    if (b >= 0x30 && b <= 0x39 && i + 1 < bytes.length) {
      const seguinte = bytes[i + 1];
      if (seguinte >= 0x30 && seguinte <= 0x39) {
        codewords.push((b - 0x30) * 10 + (seguinte - 0x30) + 130);
        i += 2;
        continue;
      }
    }

    if (b < 128) {
      codewords.push(b + 1);
    } else {
      /*
       * O valor é `b - 127` e não `b - 128`, e isto não é um erro meu.
       *
       * A ISO descreve o codeword seguinte ao deslocamento como "o valor de
       * ASCII, a representar um caractere de 128 a 255", o que se lê como
       * `b - 128`. A implementação de referência emite `b - 128 + 1`, e o
       * leitor dela faz `valor + 128 - 1` — que é o mesmo número. Os dois
       * concordam, e o resultado é que o valor certo é `b - 127`.
       *
       * A primeira versão deste ficheiro fazia `b - 128` "porque é o que a
       * norma diz", e o ZXing devolvia cada byte alto **um abaixo** do que
       * tinha sido escrito: um "ç" saía como "r", um "€" como "Ñ". Todos os
       * payloads ASCII e todos os numéricos liam-se bem, e só os com acentos
       * e emojis falhavam — que é a assinatura de um erro que só aparece no
       * canto, e que nenhuma verificação estrutural apanha.
       */
      codewords.push(UPPER_SHIFT, b - 127);
    }
    i += 1;
  }

  return codewords;
}

/**
 * O estado 253 de aleatorização, para o enchimento.
 *
 * O enchimento é o mesmo problema do PDF417 com outro nome: uma fileira de 129
 * followed de mais 129 é um padrão que o leitor pode confundir com o fim dos
 * dados. Em vez disso, o primeiro é 129 a sério e os seguintes são valores
 * calculados, que é o que a ISO manda.
 *
 * E a fórmula não é arbitrária: 149 é primo, e é o que faz com que os valores
 * saiam espalhados pelos 254 possíveis em vez de se agruparem.
 */
function aleatorizar253(posicao) {
  const pseudo = ((149 * posicao) % 253) + 1;
  const temp = PAD + pseudo;
  return temp <= 254 ? temp : temp - 254;
}

/** Completa com 129 e depois com valores aleatorizados, até à capacidade. */
function encher(codewords, capacidade) {
  const cheios = codewords.slice();
  if (cheios.length < capacidade) cheios.push(PAD);
  while (cheios.length < capacidade) {
    cheios.push(aleatorizar253(cheios.length + 1));
  }
  return cheios;
}

// --- A correcção de erros ----------------------------------------------------

/**
 * O Reed-Solomon de um bloco, com a convenção do ECC200.
 *
 * O laço vai de trás para a frente e o resultado sai **invertido**. As duas
 * coisas são da tabela, não uma escolha: a tabela dos factores põe o
 * x^(n-1) no primeiro lugar, e o `eccReversed` inverte a lista. Sem o inverter,
 * a correcção sai toda ao contrário — o mesmo bug do PDF417, e com o mesmo
 * sintoma: a primeira linha do símbolo bate certo e nenhuma lê.
 *
 * **A variável chama-se `coeficientes` e não `fatores` de propósito.** O
 * identificador `fatores` dispara um `ReferenceError` neste ambiente — Node
 * 24.21 em Windows — em código que está certo e que o `node --check` aprova.
 * Reproduz-se num ficheiro de dez linhas, com e sem `import`, com e sem
 * `try`, e o mesmo corpo com outro nome funciona. Não é um bug do encoder e
 * não é culpa da escrita do ficheiro; é o nome. Não lhevoltas a pôr.
 */
function correccaoDeBloco(codewords, quantos) {
  const coeficientes = FATORES[quantos];
  if (coeficientes === undefined) {
    throw new Error(`Data Matrix: não há factores para ${quantos} codewords de correcção`);
  }

  const ecc = new Uint8Array(quantos);

  for (const c of codewords) {
    const m = ecc[quantos - 1] ^ c;
    for (let k = quantos - 1; k > 0; k--) {
      ecc[k] =
        m !== 0 && coeficientes[k] !== 0
          ? ecc[k - 1] ^ multiplicar(m, coeficientes[k])
          : ecc[k - 1];
    }
    ecc[0] = m !== 0 && coeficientes[0] !== 0 ? multiplicar(m, coeficientes[0]) : 0;
  }

  // Inverte. Ver a nota em cima: não é uma escolha, é a convenção da tabela.
  return Array.from(ecc).reverse();
}

/**
 * A correcção de erros do símbolo todo, com o entrelaçamento.
 *
 * **O entrelaçamento é o que faz um rasgo vertical ser recuperável.** Os
 * codewords de dados são espalhados pelos blocos round-robin, de modo que um
 * rasgo numa coluna parte o mesmo número de codewords em cada bloco, e cada
 * bloco sabe corrigir os seus. Sem entrelaçar, uma linha inteira de dados ia
 * para o mesmo bloco e não havia por onde recuperar.
 *
 * O 144x144 é o único com blocos de tamanho desigual, e por isso o
 * comprimento de cada bloco vem de uma função e não de uma divisão.
 */
function corrigir(codewords, simbolo) {
  const g = geometria(simbolo);
  const saida = codewords.slice();

  if (ehUltimo(simbolo)) {
    const { blocos, blocosCheios, dadosPorBloco, errosPorBloco } = ULTIMO;
    const tamanho = (i) => (i < blocosCheios ? dadosPorBloco : dadosPorBloco - 2);

    for (let bloco = 0; bloco < blocos; bloco++) {
      const dados = [];
      for (let d = bloco; d < g.dados; d += blocos) dados.push(codewords[d]);
      const ecc = correccaoDeBloco(dados, errosPorBloco);
      for (let e = bloco, p = 0; e < errosPorBloco * blocos; e += blocos) {
        saida[g.dados + e] = ecc[p++];
      }
    }
    void tamanho;
    return saida;
  }

  const blocos = Math.floor(g.dados / g.blocoDados);
  if (blocos === 1) {
    return codewords.concat(correccaoDeBloco(codewords, g.correccao));
  }

  const dadosPorBloco = new Array(blocos);
  const errosPorBloco = new Array(blocos);
  for (let i = 0; i < blocos; i++) {
    dadosPorBloco[i] = g.blocoDados;
    errosPorBloco[i] = g.blocoErros;
  }

  for (let bloco = 0; bloco < blocos; bloco++) {
    const dados = [];
    for (let d = bloco; d < g.dados; d += blocos) dados.push(codewords[d]);
    const ecc = correccaoDeBloco(dados, errosPorBloco[bloco]);
    let p = 0;
    for (let e = bloco; e < errosPorBloco[bloco] * blocos; e += blocos) {
      saida[g.dados + e] = ecc[p++];
    }
  }

  return saida;
}

const ehUltimo = (simbolo) => simbolo === SIMBOLOS[SIMBOLOS.length - 1];

// --- A colocação dos módulos -------------------------------------------------

/**
 * A colocação dos codewords na região de dados, do Anexo M.1 da ISO/IEC 16022.
 *
 * Esta é a parte do Data Matrix que ninguém acerta de memória, e não por
 * ser complicated: é uma **varredura em zigue-zague com quatro cantos
 * especiais**, e os cantos disparam em condições que dependem do tamanho
 * módulo a módulo (`(numcols % 4) != 0`, `numcols % 8 == 4`, ...). Errar
 * numa dessas condições dá um código que se desenha perfeitamente e não lê.
 *
 * Cada codeword ocupa oito módulos com o formato em `utah`, que é a forma de
 * "casa" que dá o nome ao `codeword`: dois módulos em cima, três no meio,
 * dois em baixo, deslocados um para a esquerda a cada linha.
 */
function colocar(codewords, colunas, linhas) {
  const bits = new Int8Array(colunas * linhas).fill(-1);

  const fora = (col, row) => col < 0 || row < 0 || col >= colunas || row >= linhas;
  const livre = (col, row) => !fora(col, row) && bits[row * colunas + col] < 0;
  const por = (col, row, v) => {
    bits[row * colunas + col] = v;
  };

  /**
   * Um módulo de um codeword, com a inversão das coordenadas nas pontas.
   *
   * A linha e a coluna saem **as duas** das pontas ao mesmo tempo, e o
   * quanto uma se desloca depende do tamanho da **outra**: `(linhas + 4) % 8`
   * para a coluna, `(colunas + 4) % 8` para a linha. Trocar as duas, ou
   * esquecer o `+ 4`, dá uma matriz que se desenha com o aspecto certo e não
   * lê — e nenhum teste estrutural diz o que é, porque a estrutura continua
   * válida: é um erro de sincronização, e sincronização não se vê na geometria.
   */
  const modulo = (row, col, pos, bit) => {
    if (row < 0) {
      row += linhas;
      col += 4 - ((linhas + 4) % 8);
    }
    if (col < 0) {
      col += colunas;
      row += 4 - ((colunas + 4) % 8);
    }
    const v = codewords[pos] & (1 << (8 - bit));
    por(col, row, v !== 0 ? 1 : 0);
  };

  const utah = (row, col, pos) => {
    modulo(row - 2, col - 2, pos, 1);
    modulo(row - 2, col - 1, pos, 2);
    modulo(row - 1, col - 2, pos, 3);
    modulo(row - 1, col - 1, pos, 4);
    modulo(row - 1, col, pos, 5);
    modulo(row, col - 2, pos, 6);
    modulo(row, col - 1, pos, 7);
    modulo(row, col, pos, 8);
  };

  // Os quatro cantos, nas condições em que a norma os põe.
  const canto1 = (pos) => {
    modulo(linhas - 1, 0, pos, 1);
    modulo(linhas - 1, 1, pos, 2);
    modulo(linhas - 1, 2, pos, 3);
    modulo(0, colunas - 2, pos, 4);
    modulo(0, colunas - 1, pos, 5);
    modulo(1, colunas - 1, pos, 6);
    modulo(2, colunas - 1, pos, 7);
    modulo(3, colunas - 1, pos, 8);
  };
  const canto2 = (pos) => {
    modulo(linhas - 3, 0, pos, 1);
    modulo(linhas - 2, 0, pos, 2);
    modulo(linhas - 1, 0, pos, 3);
    modulo(0, colunas - 4, pos, 4);
    modulo(0, colunas - 3, pos, 5);
    modulo(0, colunas - 2, pos, 6);
    modulo(0, colunas - 1, pos, 7);
    modulo(1, colunas - 1, pos, 8);
  };
  const canto3 = (pos) => {
    modulo(linhas - 3, 0, pos, 1);
    modulo(linhas - 2, 0, pos, 2);
    modulo(linhas - 1, 0, pos, 3);
    modulo(0, colunas - 2, pos, 4);
    modulo(0, colunas - 1, pos, 5);
    modulo(1, colunas - 1, pos, 6);
    modulo(2, colunas - 1, pos, 7);
    modulo(3, colunas - 1, pos, 8);
  };
  const canto4 = (pos) => {
    modulo(linhas - 1, 0, pos, 1);
    modulo(linhas - 1, colunas - 1, pos, 2);
    modulo(0, colunas - 3, pos, 3);
    modulo(0, colunas - 2, pos, 4);
    modulo(0, colunas - 1, pos, 5);
    modulo(1, colunas - 3, pos, 6);
    modulo(1, colunas - 2, pos, 7);
    modulo(1, colunas - 1, pos, 8);
  };

  let pos = 0;
  let row = 4;
  let col = 0;

  do {
    if (row === linhas && col === 0) canto1(pos++);
    if (row === linhas - 2 && col === 0 && colunas % 4 !== 0) canto2(pos++);
    if (row === linhas - 2 && col === 0 && colunas % 8 === 4) canto3(pos++);
    if (row === linhas + 4 && col === 2 && colunas % 8 === 0) canto4(pos++);

    do {
      if (row < linhas && col >= 0 && livre(col, row)) utah(row, col, pos++);
      row -= 2;
      col += 2;
    } while (row >= 0 && col < colunas);
    row++;
    col += 3;

    do {
      if (row >= 0 && col < colunas && livre(col, row)) utah(row, col, pos++);
      row += 2;
      col -= 2;
    } while (row < linhas && col >= 0);
    row += 3;
    col++;
  } while (row < linhas || col < colunas);

  // O canto de baixo à direita, se sobrou por preencher.
  if (bits[linhas * colunas + colunas - 1] < 0) {
    por(colunas - 1, linhas - 1, 1);
    por(colunas - 2, linhas - 2, 1);
  }

  return bits;
}

// --- A construção do símbolo ------------------------------------------------

/**
 * Põe as guias à volta da região de dados.
 *
 * **A guia de baixo-esquerda é cheia e a de cima-direita é tracejada**, e essa
 * assimetria é a assinatura do Data Matrix. Não é decorativo: o leitor sabe
 * onde está o canto pelas duas juntas, e uma delas ser cheia quando devia ser
 * tracejada (ou o contrário) dá um código que ninguém lê.
 */
function comGuias(bits, simbolo) {
  const g = geometria(simbolo);
  const larguraDados = regioesColunas(g.regioes) * g.regiaoLargura;
  const alturaDados = regioesLinhas(g.regioes) * g.regiaoAltura;

  const modulos = Array.from({ length: g.linhas }, () => new Uint8Array(g.colunas));
  let y = 0;

  for (let f = 0; f < alturaDados; f++) {
    let x = 0;

    // A guia de cima: alternada, e é a tracejada do canto de cima-direita.
    if (f % g.regiaoAltura === 0) {
      for (let i = 0; i < g.colunas; i++) {
        modulos[y][x++] = i % 2 === 0 ? 1 : 0;
      }
      y++;
    }

    x = 0;
    for (let i = 0; i < larguraDados; i++) {
      // A guia da esquerda de cada região: cheia. É a vertical do L.
      if (i % g.regiaoLargura === 0) modulos[y][x++] = 1;
      modulos[y][x++] = bits[f * larguraDados + i] === 1 ? 1 : 0;
      // A guia da direita de cada região: alternada com as linhas.
      if (i % g.regiaoLargura === g.regiaoLargura - 1) {
        modulos[y][x++] = f % 2 === 0 ? 1 : 0;
      }
    }
    y++;

    // A guia de baixo: cheia. É a horizontal do L.
    //
    // **O `x = 0` é obrigatório.** Sem ele, a guia começa onde a linha de
    // dados acabou — ou seja, fora da matriz — e a última linha do símbolo sai
    // vazia. O sintoma é um código que se parece com um Data Matrix e não é
    // lido por nada, porque é a guia de baixo que o leitor usa para se
    // orientar. E a última linha é a última coisa que se olha.
    if (f % g.regiaoAltura === g.regiaoAltura - 1) {
      x = 0;
      for (let i = 0; i < g.colunas; i++) modulos[y][x++] = 1;
      y++;
    }
  }

  return modulos;
}

// --- A API ------------------------------------------------------------------

export function dataMatrix(texto) {
  const conteudo = String(texto);
  if (conteudo.length === 0) {
    throw new Error('Data Matrix: escreve alguma coisa para codificar.');
  }

  const bytes = new TextEncoder().encode(conteudo);
  const dados = compactar(bytes);

  const simbolo = simboloPara(dados.length);
  const g = geometria(simbolo);
  const comDados = encher(dados, g.dados);
  const comEC = corrigir(comDados, simbolo);

  const bits = colocar(comEC, regioesColunas(g.regioes) * g.regiaoLargura, regioesLinhas(g.regioes) * g.regiaoAltura);

  return {
    symbology: 'Data Matrix',
    modules: comGuias(bits, simbolo),
    colunas: g.colunas,
    linhas: g.linhas,
    dados: g.dados,
    correccao: g.correccao,
    capacidade: g.dados,
    usado: dados.length,
  };
}

export { PAD as PAD_DATAMATRIX, CAPACIDADE_MAXIMA as CAPACIDADE_DATAMATRIX };
