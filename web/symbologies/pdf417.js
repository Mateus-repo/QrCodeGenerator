/**
 * PDF417.
 *
 * O código empilhado, e o que se vê no verso das cartas de condução, dos
 * cartoes de embarque e dos passaportes. Mecanico, e nao um codigo de tela
 * grande: e uma faixa estreita de barras verticais, mil vezes mais
 * fotogenico do que o QR. E por isso que e raro na pratica - mas e o 2D
 * mais usado do mundo depois do QR, e aparece em tudo o que tem de caber
 * numa faixa e levar muito texto: a matricula de um veiculo, um bilhete, um
 * inventário.
 *
 * **É um código de barras vertical com alma de matriz.** Cada linha tem 17
 * módulos por cluster, e cada cluster é um dos 929 padrões da tabela. A
 * correcção de erros é por linha, não por símbolo, e é o Reed-Solomon de sempre.
 *
 * O que o distingue do QR e do Data Matrix é a **compactação**: antes de
 * qualquer coisa, o texto é espremido em codewords por um de três modos, cada
 * um dos quais escolhe um modo por personagem conforme o que essa personagem é.
 * Um código com 40 caracteres pode levar menos de metade dos codewords de outro
 * com os mesmos 40 caracteres, e o leitor não se importa porque lê o modo que
 * está gravado nos próprios codewords.
 *
 * Os três modos:
 *
 *  - **Numérico**, base 900. Quarenta e quatro dígitos entram em quinze
 *    codewords. E o modo que faz um cartao de matricula ficar cinco vezes
 *    melhor do que no modo de texto, num numero de serie.
 *  - **Byte**, base 256 para base 900. Seis bytes entram em cinco codewords.
 *  - **Texto**, dois caracteres por codeword, com quatro submodos — maiúsculas,
 *    minúsculas, misto e pontuação — e códigos de troca entre eles.
 *
 * **A tabela são 2787 números e não está escrita à mão.** Vem de
 * `pdf417-tabelas.js`, gerado a partir de uma implementação de referência, e o
 * `tests/tabelas-pdf417.test.mjs` compara-a entrada a entrada. Escrever
 * quantidades destas de memória é a forma mais rápida de entregar um código
 * que não lê, e já aconteceu neste repositório três vezes.
 */

import { CLUSTERS, EC, SUBMODOS, TRANSICOES } from './pdf417-tabelas.js';

/**
 * O padrão de início, 17 módulos.
 *
 * É o cluster 0 com o codeword 900. Vem da especificação e não da tabela,
 * porque não é um codeword como os outros: é o que diz ao leitor "aqui começa
 * o código".
 */
const INICIO = 0x1fea8;

/**
 * O padrão de paragem, **18** módulos.
 *
 * Um a mais do que todos os outros, e essa diferença é o que fecha o código: o
 * leitor sabe que acabou quando a linha é um módulo mais larga do que as de
 * cima. Tirá-lo dá um código que parece certo e não lê.
 */
const PARAGEM = 0x3fa29;

/** O codeword de enchimento, e o que a especificação chama de 900. */
const ENCHIMENTO = 900;

/** Os limites que a norma põe, e que um gerador tem de respeitar. */
const MAX_CODEWORDS = 928;
const MIN_LINHAS = 3;
const MAX_LINHAS = 90;
const MAX_COLUNAS = 30;

/** Códigos de troca de modo. */
const BLOQUEIO_TEXTO = 900;
const BLOQUEIO_BYTE = 901;
const BLOQUEIO_BYTE_ALT = 924;
const BLOQUEIO_NUMERICO = 902;

/**
 * O valor de um caractere num submodo, e que submodos o têm.
 *
 * Vem do mapa da tabela, e o inversão é uma vez só ao carregar o módulo: numa
 * etiqueta com 600 caracteres seriam 600 inversões que não é preciso pagar.
 */
const VALOR = {};
const SUBMODOS_DE = {};
for (const [modo, caracteres] of Object.entries(SUBMODOS)) {
  VALOR[modo] = caracteres;
  for (const c of Object.keys(caracteres)) {
    if (SUBMODOS_DE[c] === undefined) SUBMODOS_DE[c] = [];
    SUBMODOS_DE[c].push(modo);
  }
}

/**
 * A ordem em que se prefere os submodos quando um carácter cabe em vários.
 *
 * Não é arbitrária, e a ordem errada produz códigos mais longos sem que nada
 * pareça estar mal. As minúsculas vêm primeiro porque `a` é o valor 1 lá e 0
 * em maiúsculas, e um valor baixo raramente é um código de troca.
 */
const PREFERENCIA = ['LOWER', 'UPPER', 'MIXED', 'PUNCT'];

// --- Compactação ------------------------------------------------------------

/** O modo que melhor compensa este byte. */
function modoDe(codigo) {
  if (codigo >= 0x30 && codigo <= 0x39) return 'numerico';
  if (SUBMODOS_DE[String.fromCharCode(codigo)]) return 'texto';
  return 'byte';
}

/** Converte um número para a base pedida, com os dígitos mais significativos primeiro. */
function paraBase(valor, base) {
  const digitos = [];
  let v = valor;
  while (v > 0) {
    digitos.unshift(v % base);
    v = Math.floor(v / base);
  }
  return digitos;
}

/** Converte os dígitos de uma base para outra, sem perder precisão. */
function trocarBase(digitos, origem, destino) {
  let valor = 0;
  for (const d of digitos) valor = valor * origem + d;
  return paraBase(valor, destino);
}

/**
 * Modo numérico: quarenta e quatro dígitos em base 900.
 *
 * A concatenação dos dígitos é tratada como um número **na base 10**, com um
 * `1` à frente para preservar os zeros do início. É esse o truque do modo: um
 * número de 44 dígitos cabe em 15 codewords porque 900^15 dá para lá dos 44
 * dígitos decimais, e não 15*8 = 120 bits como no modo de bytes.
 */
function compactarNumerico(digitos) {
  const palavras = [];
  for (let i = 0; i < digitos.length; i += 44) {
    const grupo = digitos.slice(i, i + 44);
    const numero = BigInt('1' + grupo.join(''));
    const palavras900 = [];
    let v = numero;
    while (v > 0n) {
      palavras900.unshift(Number(v % 900n));
      v /= 900n;
    }
    palavras.push(...palavras900);
  }
  return palavras;
}

/**
 * Modo de bytes: seis bytes em cinco codewords.
 *
 * Só quando o grupo tem exactamente seis bytes. Os grupos menores ficam como
 * estão, um byte por codeword, porque converter três bytes de base 256 para
 * base 900 daria três codewords de qualquer maneira e só juntava trabalho.
 */
function compactarBytes(bytes) {
  const palavras = [];
  for (let i = 0; i < bytes.length; i += 6) {
    const grupo = bytes.slice(i, i + 6);
    if (grupo.length === 6) {
      const em900 = trocarBase(grupo, 256, 900);
      // À esquerda, para o valor ficar alinhado: o leitor lê de trás para a
      // frente e a posição conta. Sem isto, "AB" e "AB\0" dariam o mesmo
      // codeword, e o conteúdo perdia bytes sem dar erro.
      palavras.push(...new Array(5 - em900.length).fill(0), ...em900);
    } else {
      palavras.push(...grupo);
    }
  }
  return palavras;
}

/**
 * Modo de texto: dois caracteres por codeword, em `valor1 * 30 + valor2`.
 *
 * Cada codeword leva dois valores de 0 a 29, e o 29 e a almofada. E por isso
 * que um numero impar de caracteres precisa de um: sem ele, o ultimo codeword
 * ficava com metade vazia e o leitor lia-o como um valor errado.
 */
const ALMOFADA = 29;

function compactarTexto(caracteres) {
  const valores = [];
  let submodo = 'UPPER';

  for (const c of caracteres) {
    if (VALOR[submodo][c] === undefined) {
      const possiveis = SUBMODOS_DE[c];
      let destino = null;
      for (const modo of PREFERENCIA) {
        if (possiveis.includes(modo)) {
          destino = modo;
          break;
        }
      }
      if (destino === null) {
        throw new Error(`PDF417: o modo texto não tem o caractere "${c}"`);
      }
      valores.push(...TRANSICOES[`${submodo}_${destino}`]);
      submodo = destino;
    }
    valores.push(VALOR[submodo][c]);
  }

  if (valores.length % 2 !== 0) valores.push(ALMOFADA);

  const palavras = [];
  for (let i = 0; i < valores.length; i += 2) {
    palavras.push(valores[i] * 30 + valores[i + 1]);
  }
  return palavras;
}

/**
 * Escolhe o modo de cada bloco de caracteres e engole tudo em codewords.
 *
 * A escolha é por **execuções de caracteres iguais**, não carácter a carácter:
 * cada bloco leva o seu código de troca, e um código de troca por carácter
 * seria mais caro do que o modo não vale.
 */
function compactar(bytes) {
  const caracteres = Array.from(bytes, (b) => String.fromCharCode(b));

  // Os blocos, por execucao do modo ideal de cada caracter.
  const blocos = [];
  for (const c of caracteres) {
    const modo = modoDe(c.charCodeAt(0));
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.modo === modo) ultimo.dados.push(c);
    else blocos.push({ modo, dados: [c] });
  }

  const palavras = [];

  for (const [i, bloco] of blocos.entries()) {
    /*
     * O primeiro bloco só leva código de troca se não for o modo de texto,
     * porque o leitor começa em maiúsculas. Todos os outros levam, e o modo de
     * texto é o único que volta a maiúsculas sem código nenhum.
     */
    const primeiro = i === 0;
    if (!primeiro || bloco.modo !== 'texto') {
      if (bloco.modo === 'texto') palavras.push(BLOQUEIO_TEXTO);
      else if (bloco.modo === 'numerico') palavras.push(BLOQUEIO_NUMERICO);
      else {
        // O modo de bytes tem dois códigos de bloqueio. O alternativo é
        // obrigatório quando o bloco é um múltiplo exacto de seis, porque
        // são esses blocos que se convertem em base 900, e é o leitor que
        // precisa de saber disso para desfazer.
        const multiplos = bloco.dados.length % 6 === 0;
        palavras.push(multiplos ? BLOQUEIO_BYTE_ALT : BLOQUEIO_BYTE);
      }
    }

    if (bloco.modo === 'texto') palavras.push(...compactarTexto(bloco.dados));
    else if (bloco.modo === 'numerico') {
      palavras.push(...compactarNumerico(bloco.dados.map((c) => c.charCodeAt(0) - 0x30)));
    } else {
      palavras.push(...compactarBytes(bloco.dados.map((c) => c.charCodeAt(0))));
    }
  }

  return palavras;
}

// --- Correcção de erros ------------------------------------------------------

/**
 * Reed-Solomon do PDF417, que não é o do QR.
 *
 * A diferença: os codewords vão de 0 a 928, e a aritmética é módulo **929**,
 * e não uma tabela de Galois. É mais lento e é mais simples, e é o que a
 * especificação diz.
 *
 * Devolve `2^(nível+1)` codewords, e não um a menos. Havia aqui um comentário
 * a dizer que o último era um checksum descartado, e era uma ideia errada: a
 * norma dá exactamente `2^(nível+1)` codewords de correcção para cada nível, e
 * o leitor conta-os para saber quanto apanhar. Faltar um dá um código cujas
 * linhas têm de ser lidas com um número de correcção que não bate, e o leitor
 * recusa.
 *
 * E a lista sai **invertida**, que é a segunda metade do mesmo bug. A
 * correcção calcula-se a correr de trás para a frente — o `ec` acima vai
 * do último codeword para o primeiro, e é por isso que o `temp` usa
 * `ec[quantos - 1]` — e quem o escreve tem de o devolver na ordem certa. Sem
 * o inverter, a correcção fica toda ao contrário, a linha 1 do símbolo sai com
 * os clusters trocados, e o leitor lê lixo. A primeira linha do símbolo até
 * batia certo, porque é a única em que a diferença ainda não apareceu.
 */
function corrigir(palavras, nivel) {
  const factores = EC[nivel];
  const quantos = factores.length;
  const ec = new Array(quantos).fill(0);

  for (const palavra of palavras) {
    const temp = (palavra + ec[quantos - 1]) % 929;
    for (let x = quantos - 1; x >= 0; x--) {
      const anterior = x > 0 ? ec[x - 1] : 0;
      ec[x] = (anterior + 929 - ((temp * factores[x]) % 929)) % 929;
    }
  }

  return ec
    .slice()
    .reverse()
    .map((v) => (929 - v) % 929);
}

// --- A estrutura ------------------------------------------------------------

/** O codeword do indicador da esquerda, ou o da direita, de uma linha. */
function indicador(linha, total, colunas, nivel, esquerda) {
  const cluster = linha % 3;

  /*
   * Os três clusters rodzam entre si, e cada um leva uma informação diferente.
   * E o que impede que um leitor leia a linha errada: sem isto, duas linhas com
   * os mesmos dados seriam idênticas e não havia como saber onde se começou.
   */
  let x;
  if (esquerda) {
    if (cluster === 0) x = Math.floor((total - 1) / 3);
    else if (cluster === 1) x = nivel * 3 + ((total - 1) % 3);
    else x = colunas - 1;
  } else {
    if (cluster === 0) x = colunas - 1;
    else if (cluster === 1) x = Math.floor((total - 1) / 3);
    else x = nivel * 3 + ((total - 1) % 3);
  }

  return 30 * Math.floor(linha / 3) + x;
}

/**
 * As dimensões de um símbolo, com o enchimento que as torna coerentes.
 *
 * **O enchimento e as colunas têm de ser decididos juntos**, e esta função
 * existe por causa de não o terem sido. O enchimento depende do número de
 * colunas — tem de fazer o total de codewords dar exacto — e as colunas
 * dependem do número de linhas, que por sua vez depende do enchimento. Calcular
 * um e depois o outro dá uma grelha que não encaixa, e o leitor recusa-a sem
 * dizer porquê: é o mesmo defeito que uma linha estreita, só que com a grelha
 * toda errada em vez de uma linha.
 *
 * Por isso o cálculo é por tentativa: para cada número de colunas, calcula-se o
 * enchimento que essa largura exige, e só se a altura resultante estiver entre
 * 3 e 90 linhas é que vale.
 */
function dimensoesComEnchimento(dados, quantosEC, colunasPedidas) {
  for (const colunas of todasAsColunas(colunasPedidas)) {
    const base = dados + quantosEC + 1;
    const resto = base % colunas;
    const enchimento = resto > 0 ? colunas - resto : 0;
    const total = base + enchimento;
    const linhas = Math.ceil(total / colunas);

    if (linhas >= MIN_LINHAS && linhas <= MAX_LINHAS) {
      return { colunas, linhas, enchimento, total };
    }
  }

  return null;
}

/**
 * As larguras a tentar, a partir da pedida: as mais largas primeiro, e depois
 * as mais estreitas.
 *
 * Mais colunas é **menos** linhas, e menos colunas é mais linhas. Qual dos dois
 * resolve depende do que falta, e por isso se tenta nos dois sentidos em vez de
 * só para um lado.
 */
function* todasAsColunas(pedidas) {
  for (let c = Math.max(1, pedidas); c <= MAX_COLUNAS; c++) yield c;
  for (let c = Math.min(pedidas, MAX_COLUNAS) - 1; c >= 1; c--) yield c;
}

export function pdf417(texto, opcoes = {}) {
  const { colunas: colunasPedidas = 6, nivel = 2 } = opcoes;

  if (nivel < 0 || nivel > 8) {
    throw new Error(`PDF417: o nível de correcção vai de 0 a 8 (recebeu ${nivel})`);
  }

  const bytes = new TextEncoder().encode(String(texto));
  const palavras = compactar(bytes);

  const quantosEC = 2 ** (nivel + 1);

  /*
   * As dimensões e o enchimento saem juntos, e por esta ordem e nao outra.
   *
   * A primeira versão calculava o enchimento com as colunas **pedidas** e só
   * depois procurava colunas que coubessem na altura. Quando as duas coisas não
   * coincidiam — e não coincidem sempre, porque o número de linhas tem de ficar
   * entre 3 e 90 — a grelha saía com o enchimento de uma largura e a forma de
   * outra, e o leitor recusava.
   *
   * Não deu erro de symbalto nenhum, e não ha nada a ver com os dados: dois
   * casos em que os codewords eram **idênticos** aos da referência liam-se com
   * uma forma e não com a outra.
   */
  const medidas = dimensoesComEnchimento(palavras.length, quantosEC, colunasPedidas);
  if (!medidas) {
    throw new Error(
      `PDF417: ${palavras.length + quantosEC + 1} codewords não cabem entre ` +
        `${MIN_LINHAS} e ${MAX_LINHAS} linhas, com ${colunasPedidas} colunas. ` +
        'Ou o texto é grande demais, ou as colunas são poucas demais para o dar altura.',
    );
  }

  const { colunas, linhas, enchimento } = medidas;

  // O descritor de comprimento conta os dados, o enchimento e ele proprio,
  // mas nao a correccao de erros. E um codword inteiro, nao um campo de bits.
  const descritor = palavras.length + enchimento + 1;
  if (descritor > MAX_CODEWORDS) {
    throw new Error(
      `PDF417: o conteúdo é longo demais. O descritor de comprimento daria ` +
        `${descritor} e o máximo é ${MAX_CODEWORDS}. ` +
        'Diminua a correção de erros ou use mais colunas para distribuir melhor.',
    );
  }

  const corpo = [descritor, ...palavras, ...new Array(enchimento).fill(ENCHIMENTO)];
  const comEC = [...corpo, ...corrigir(corpo, nivel)];

  const grade = gradeDe(comEC, colunas, nivel);

  return {
    symbology: 'PDF417',
    modules: grade.modulos,
    linhas: grade.linhas,
    colunas,
    nivel,
    palavras: comEC.length,
  };
}

/**
 * As linhas de módulos a partir de codewords já feitos, para uma largura certa.
 *
 * Os módulos são: o padrão de início, o indicador da esquerda, **um** cluster
 * por codeword, o indicador da direita e o padrão de paragem. E o empilhamento
 * é isto: as linhas ficam justas umas abaixo das outras, sem margem nenhuma
 * entre elas.
 */
function gradeDe(palavras, colunas, nivel) {
  const linhas = Math.ceil(palavras.length / colunas);
  const modulos = [];

  for (let linha = 0; linha < linhas; linha++) {
    const dados = palavras.slice(linha * colunas, (linha + 1) * colunas);
    // A última linha pode ficar a meio, e os codewords que faltam vão como
    // enchimento. Sem isto a linha sai estreita e o leitor recusa o código.
    while (dados.length < colunas) dados.push(ENCHIMENTO);

    const cluster = linha % 3;

    /*
     * O início e a paragem passam por `modulosDe`, e não vão para a lista
     * crus. São números de 17 e 18 bits, e um número dentro de um array de
     * zeros e uns é um número no meio de um desenho: a linha saía com 72
     * módulos em vez dos 137 da fórmula, e nenhum teste estrutural dizia o que
     * era, porque contava o comprimento sem o comparar com a fórmula.
     */
    const linhaModulos = modulosDe(INICIO, 17);
    linhaModulos.push(...padroes(cluster, indicador(linha, linhas, colunas, nivel, true)));

    for (const palavra of dados) linhaModulos.push(...padroes(cluster, palavra));

    linhaModulos.push(...padroes(cluster, indicador(linha, linhas, colunas, nivel, false)));
    linhaModulos.push(...modulosDe(PARAGEM, 18));

    modulos.push(linhaModulos);
  }

  return { modulos, linhas, colunas };
}

/** Os 17 modulos de um codeword, a partir do cluster em que vai. */
function padroes(cluster, palavra) {
  const bits = CLUSTERS[cluster][palavra];
  if (bits === undefined) {
    throw new Error(`PDF417: o codeword ${palavra} não existe no cluster ${cluster}`);
  }
  return modulosDe(bits, 17);
}

/** Um padrão em módulos, do mais significativo para o menos. */
function modulosDe(valor, quantos) {
  const modulos = [];
  for (let i = quantos - 1; i >= 0; i--) modulos.push((valor >> i) & 1);
  return modulos;
}

/**
 * Monta o símbolo a partir de uma lista de codewords já feita.
 *
 * Existe para os testes, e por uma razão concreta: enquanto a compactação e a
 * estrutura estiverem no mesmo sítio, um código que não lê não diz em qual das
 * duas está o erro. Passando-lhe os codewords de uma implementação de
 * referência, os módulos saem iguais; passando-lhe os meus, vê-se onde divergem.
 *
 * **Não é a via normal.** Chamar isto a partir da aplicação saltaria a
 * compactação, e o leitor não receberia modo nenhum — leria lixo. É
 * `pdf417()` que se usa.
 */
export function pdf417DeCodewords(palavras, opcoes = {}) {
  const { colunas: colunasPedidas = 6, nivel = 2 } = opcoes;

  if (palavras.length === 0) {
    throw new Error('PDF417: a lista de codewords está vazia');
  }
  if (palavras.some((p) => !Number.isInteger(p) || p < 0 || p > 928)) {
    throw new Error('PDF417: os codewords têm de ser inteiros de 0 a 928');
  }

  const grade = gradeDe(palavras, colunasPedidas, nivel);

  return {
    symbology: 'PDF417',
    modules: grade.modulos,
    linhas: grade.linhas,
    colunas: grade.colunas,
    nivel,
  };
}

export { INICIO as INICIO_PDF417, PARAGEM as PARAGEM_PDF417, ENCHIMENTO as ENCHIMENTO_PDF417 };
