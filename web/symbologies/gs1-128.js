/**
 * GS1-128, outrora chamado EAN/UCC-128.
 *
 * O Code 128 com as regras do GS1 por cima. E' o codigo de barras que vai na
 * etiqueta de uma caixa de armario de farmacia, e a diferenca para o Code 128
 * normal nao esta no desenho: esta em **saber onde acaba cada campo**.
 *
 * ## O problema que ele resolve
 *
 * O GTIN sozinho e' um numero de comprimento fixo, e o leitor sabe que tem de
 * ler catorze digitos. Com varios campos ja nao: em `(10)LOTE-A1(17)270630`, onde
 * acaba `LOTE-A1`? O `A1` e' parte do lote ou ja e' o inicio de outra coisa? Sem
 * regra o leitor tem de adivinhar, e adivinhar mal e' ler um campo invalido.
 *
 * A regra e' o **FNC1**, um codeword que nao desenha um caracter visivel e que
 * marca "o campo de comprimento variavel acabou aqui". E' a unica coisa que o
 * GS1-128 acrescenta ao Code 128, e e' o que faz a diferenca entre um codigo que
 * se le e um codigo que da erro de campo.
 *
 * ## As tres coisas que sao FNC1
 *
 *  1. **No inicio**, logo a seguir ao caracter de inicio do conjunto. E' o que
 *     diz ao leitor "este e' um GS1-128" e nao um Code 128 com texto. Sem ele o
 *     leitor devolve o texto mas nao sabe para que serve.
 *  2. **No fim de cada campo de comprimento variavel**, menos no ultimo. E' o
 *     separador. A regra "menos no ultimo" e' da propria GS1: um separador no
 *     fim nao separa de nada.
 *  3. **Nunca** dentro de um campo de comprimento fixo, porque ai o comprimento
 *     ja esta no AI e um FNC1 a meio leria-se como parte do valor.
 *
 * ## Porque os campos sao todos no conjunto B
 *
 * O GS1-128 so usa o conjunto B - o ASCII imprimivel. Nao por ser mais curto,
 * mas porque e' o unico em que o FNC1 faz sentido: o valor de um campo e'
 * alfanumerico, os AIs sao digitos, e uma comutacao para o conjunto C (so
 * digitos) partiria um campo ao meio sem o leitor dar por isso. O `python-barcode`
 * faz o mesmo.
 *
 * O preco e' um codigo mais longo do que um Code 128 comutativo, e e' o
 * comprimento que a GS1-128 aceita. Correto e' mais curto.
 *
 * ## A tabela
 *
 * Os 541 AIs estao em `gs1-tabelas.js`, **gerados** a partir do JSON-LD de
 * `ref.gs1.org` pela ferramenta oficial da GS1. Nao estao escritos a mao: um AI
 * com o comprimento errado desenha-se perfeito e o leitor le-o como invalido, e
 * nao ha teste estrutural que apanhe isso.
 *
 * ## O que o leitor devolve, medido
 *
 * O ZXing devolve o texto com os separadores visiveis como `<GS>`, e o
 * `symbology_identifier` diz `]C1` em vez de `]C0` quando ha FNC1 no inicio. Os
 * dois foram medidos com `tests/ver-fnc1*.py`, e nao assumidos: o texto sozinho
 * nao distingue um GS1-128 de um Code 128 com os mesmos caracteres, que e'
 * exactamente o caso em que o `]C1` importa.
 *
 * **O FNC1 do inicio conta para o caracter de verificacao como qualquer outro
 * codeword**, com o valor 102. A primeira versao deste ficheiro punha o FNC1
 * fora da soma, "porque nao e' um caracter" - e isso dava um codigo com o valor
 * de verificacao errado, que o leitor recusa sem dizer por que. O `python-barcode`
 * fez-me ver isso: o GS1-128 dele tem 22 modulos a mais do que o Code 128 com o
 * mesmo texto, e 22 modulos sao dois codewords, nao um.
 */

import { AIS, aiDe } from './gs1-tabelas.js';
import { PADROES_CODE128, CONJUNTOS_INICIO } from './code128.js';

/**
 * O valor do codeword do FNC1 no Code 128.
 *
 * 102 nao e' um valor de conjunto nem um caracter: e' uma funcao, e e' o mesmo
 * em todos os contextos - no inicio e como separador. Nao ha um "FNC1 de inicio"
 * e um "FNC1 separador" com numeros diferentes, ao contrario do que se pode
 * supor.
 */
export const FNC1 = 102;

/**
 * O separador GS, 0x1D - o mesmo byte que o ZXing devolve nos bytes do que le.
 *
 * **Nao e' uma escolha de interface.** E' o valor que a GS1 chama de Group
 * Separator e o mesmo que o leitor devolve, para que o texto que a aplicacao
 * mostra e o que o leitor le sejam o mesmo numero e nao duas tradicoes. A primeira
 * versao deste ficheiro punha o separador como um caractere literal invisivel
 * dentro de um `join('')` - o que funcionava, e que nao se via em lado nenhum do
 * codigo. Numa constante nomeada o caractere invisivel e' pelo menos um caractere
 * invisivel, e `grep GS` encontra-o.
 *
 * No texto que o ZXing devolve, este byte aparece como a letra `f`, e nao como
 * 0x1D. E' uma representacao do leitor, e o `descodificar-gs1.py` sabe disso.
 */
export const GS = '\x1d';

/** O codeword de inicio do conjunto B, que e' o unico que o GS1-128 usa. */
export const INICIO_B = CONJUNTOS_INICIO.B;

/** O codeword de paragem. */
const PARAGEM = 106;

/**
 * O codigo de barras GS1-128.
 *
 * @param {string} elementoString o texto com os AIs entre parenteses, na forma de
 *   leitura humana da GS1: `(01)04012345678901(10)LOTE-A1`. Os parenteses **nao**
 *   vao para dentro do codigo de barras - fazem parte da notacao humana e o
 *   leitor nao os ve.
 *
 * @returns `{modulos, campos, gs1, separadores}` com os modulos ja desenhados, os
 *   campos com os valores limpos, a forma legivel com separadores e quantos
 *   FNC1 foram emitidos.
 */
export function gs1_128(elementoString) {
  const { texto: limpo, campos } = analisar(elementoString);

  /*
   * A forma de maquina: os campos concatenados, com o FNC1 onde a GS1 o quer.
   *
   * O FNC1 do inicio vai **depois** do caracter de inicio do conjunto B - e' o
   * primeiro codeword de dados, nao parte do cabecalho. Pô-lo antes produz um
   * codigo que o ZXing le como `]C0`, ou seja, como Code 128 normal, e o
   * utilizador nunca ve a diferenca - so o leitor de um sistema GS1.
   */
  const valores = [INICIO_B, FNC1];

  for (const campo of campos) {
    /*
     * **O numero do AI vai no codigo de barras, sem parenteses.**
     *
     * A primeira versao emitia so `campo.valor` e o AI ficava de fora, por causa
     * de uma confusao entre a forma humana e a de maquina: em `(10)LOTE-A1` os
     * parenteses sao para quem lê e nao vao para o codigo - mas os **digitos do
     * AI vao**. O resultado era 17 codewords em vez de 20, o ZXing nao lia nada,
     * e a razao nao era visivel no codigo: um GS1-128 sem os AIs e' a mesma coisa
     * que uma etiqueta sem dizer o que e' que ela e'.
     *
     * E o `resto` entra antes do conteudo, e nao depois: num `3103` o digito da
     * posicao decimal implicita faz parte do valor, nao do AI.
     */
    for (const caractere of campo.ai + campo.valor) {
      valores.push(caracterNoConjuntoB(caractere, campo.ai));
    }

    /*
     * O separador vai no fim de cada campo variavel **excepto o ultimo**.
     *
     * A comparacao e' por identidade do objecto e nao por indice, e a razao de
     * ser assim e' que `campos` e' a lista que o `analisar` construiu e que o
     * `campo` do laco e' o mesmo objecto - `i === campos.length - 1` dava o mesmo
     * resultado, mas comparar o objecto torna impossivel o erro de saltar um
     * separador por engano. Um separador no fim nao separa de nada, e o leitor
     * accounta-o como parte do campo seguinte.
     */
    if (campo.separador && campo !== campos[campos.length - 1]) valores.push(FNC1);
  }

  /*
   * O caracter de verificacao: o valor de inicio com peso 1, cada valor de dados
   * multiplicado pela sua posicao - a primeira a valer 1 - e o resultado modulo
   * 103.
   *
   * **Nao e' uma soma simples.** A primeira versao fazia
   * `valores.reduce((s, v) => s + v, 0) % 103`, que e' a soma de todos os valores
   * sem pesos, e produzia um caracter de verificacao diferente do certo. O
   * resultado: 222 modulos em vez dos 200 que a conta pedia, o ZXing a recusar
   * **sem dizer por que**, e nenhuma diferenca visivel no desenho. O numero de
   * modulos foi o que denunciou - a conta do Code 128 da propria norma dao 11 por
   * codeword, e 222 nao e' multiplo de 11 mais a paragem.
   *
   * O FNC1 entra na conta com o valor 102 e com o peso da sua posicao, como
   * qualquer outro codeword - e e' por isso que ele tem de estar na lista **antes**
   * de se calcular a soma, e nao a ser acrescentado a parte.
   */
  let soma = valores[0];
  for (let i = 1; i < valores.length; i++) soma += valores[i] * i;
  const verificacao = soma % 103;

  const modulos = modulosDe([...valores, verificacao, PARAGEM]);

  return {
    /**
     * O nome da simbologia, como o `code128()` tambem devolve. O registo das
     * simbologias usa-o para escolher a altura da barra, e um GS1-128 que
     * devolvesse um nome diferente do seu irmão cairia na altura por omissao -
     * 60 modulos, que e' o mesmo valor, e por isso a diferenca nao se via.
     */
    symbology: 'GS1-128',
    /**
     * Os modulos, em `modules` e nao em `modulos`.
     *
     * **A convencao do repositorio e' `modules`**, e e' o que o desenho em
     * `linear.js` e o `app.js` leem. A primeira versao deste encoder devolvia
     * `modulos`, e o `linear.test.mjs` - que verifica que cada registo sabe
     * codificar o seu exemplo - falhou com `undefined.length`. A manifestacao mais
     * barbara de um nome diferente, e a mais facil de ver, o que e' quase
     * desejavel: ao contrario da soma de verificacao errada, que dava um codigo
     * que o ZXing recusava sem dizer nada.
     *
     * **Nao ha alias em `modulos`.** Podia haver, e e' tentador porque o nome
     * e' o que se diz em portugues - mas um encoder com dois nomes para a mesma
     * lista e' um encoder em que se pode ler um e escrever no outro, e o que
     * acontece ao fim e' um deles deixar de ser actualizado. Um nome, e o que os
     * outros usam.
     */
    modules: modulos,
    campos,
    gs1: legivel(campos),
    separadores: valores.filter((v) => v === FNC1).length,
    /**
     * A legenda, que no GS1-128 e' a forma humana **com os separadores** - e nao a
     * forma com parenteses, porque o `(` e' o que se imprime e o GS e' o que
     * separa. A GS1 pede que a linha impresso tenha os AIs entre parenteses, e
     * nao e' opcional: e' o que permite a uma pessoa ler o codigo sem scanner.
     */
    caption: legivel(campos),
    /** O Code 128 nao tem barras-guarda, e o GS1-128 tambem nao. */
    guards: [],
    /**
     * A forma de maquina: os campos sem parenteses, com o separador **onde o
     * encoder o pôs** - isto e', depois de um campo de comprimento variavel que
     * nao seja o ultimo.
     *
     * Nao e' a mesma coisa que juntar todos os campos com um separador, e a
     * diferenca e' o que o `descodificar-gs1.py` apanhou: o ZXing devolve
     * `010401234567890110LOTE-A1` para o GTIN seguido de um lote no fim - **sem**
     * separador nenhum, porque o `10` e' o ultimo campo e o FNC1 nao separa de
     * nada. Juntando um separador entre todos os campos, o leitor devolvia o
     * mesmo texto com um `0x1D` a mais, e o codigo de barras continuava a ler
     * bem: a falha era so na comparacao, e sem ela nao se via.
     *
     * E' a mesma lista de valores que vai para o modulo, sem o inicio, sem a
     * verificacao e sem a paragem - por isso e' o que o leitor devolve.
     */
    payload: maquina(campos),
  };
}

/**
 * O valor Code 128 de um caracter no conjunto B.
 *
 * No conjunto B o valor e' o ASCII menos 32, para 0 a 95. Os caracteres que nao
 * cabem no GS1-128 - os acentos, por exemplo - sao recusados aqui e nao no
 * desenho, porque o erro e' do dado e nao do codigo.
 */
function caracterNoConjuntoB(caractere, ai) {
  const codigo = caractere.codePointAt(0);

  if (codigo < 32 || codigo > 127) {
    throw new Error(
      `GS1-128: o AI (${ai}) tem o caractere "${caractere}" (U+${codigo.toString(
        16,
      )}), e o conjunto B so transporta ASCII. O GS1-128 nao tem acento.`,
    );
  }

  // 128 e' o valor de paragem e nao pode estar nos dados - dava um codigo que se
  // desenhava e nao se lia.
  if (codigo === 128) {
    throw new Error(`GS1-128: o AI (${ai}) tem um caracter de paragem nos dados`);
  }

  return codigo - 32;
}

/**
 * Separa o texto nos campos, e valida cada um contra a tabela de AIs.
 *
 * E' aqui que a tabela de 541 AIs paga. Sem ela o encoder teria de adivinhar o
 * comprimento de cada campo, e adivinhar mal significa que o campo seguinte e'
 * lido a partir do meio do anterior - o que o leitor acusa como campo invalido e
 * nao como tabela errada.
 *
 * A forma humana da GS1 nao tem separadores: os campos estao separados por
 * parenteses. O FNC1 so existe na forma de maquina, e e' o encoder que o poe.
 */
function analisar(texto) {
  const campos = [];
  let i = 0;

  while (i < texto.length) {
    if (texto[i] !== '(') {
      throw new Error(
        `GS1-128: esperava um "(" na posicao ${i} de "${texto}". A forma de ` +
          "leitura humana e' (01)04012345678901(10)LOTE-A1, com os AIs entre parenteses.",
      );
    }

    /*
     * O AI tem dois, tres ou quatro digitos, e **nao se pode saber qual pelo
     * primeiro digito**: `3103` e' um AI de quatro, e `31` e' um de dois com a
     * posicao decimal implicita no ultimo digito. Le-se o numero todo e a tabela
     * diz onde acaba - a funcao `aiDe` tenta quatro, tres e dois, do mais longo
     * para o mais curto.
     */
    const fecho = texto.indexOf(')', i);
    if (fecho < 0) {
      throw new Error(`GS1-128: o "(" na posicao ${i} de "${texto}" nao fecha.`);
    }

    const numero = texto.slice(i + 1, fecho);
    if (!/^\d+$/.test(numero)) {
      throw new Error(`GS1-128: o AI "${numero}" nao e' so digitos.`);
    }

    const encontrado = aiDe(numero);
    if (!encontrado) {
      throw new Error(
        `GS1-128: o AI (${numero}) nao existe. A tabela tem ${Object.keys(AIS).length} AIs.`,
      );
    }

    /*
     * O valor comeca logo a seguir ao `)`, e e' o comprimento que decide ate
     * onde vai. E' a razao de a tabela trazer `fixo` e `maximo`.
     *
     * O `resto` que o `aiDe` devolve e' o que sobrou do numero depois do AI - o
     * digito da posicao decimal implicita num `3103`. Faz parte do valor, e por
     * isso entra no campo antes dos caracteres.
     */
    const inicioValor = fecho + 1;
    let valor;
    let fim;

    if (encontrado.fixo !== null) {
      // Comprimento fixo: o campo tem `fixo` caracteres, ponto final. Sem FNC1.
      fim = inicioValor + encontrado.fixo;
      valor = texto.slice(inicioValor, fim);
    } else {
      /*
       * Comprimento variavel: vai ate ao fim do texto ou ate ao proximo `(`.
       *
       * **O `(` e' que marca o fim, e nao um FNC1 na forma humana.** A primeira
       * versao deste ficheiro procurava um separador na forma humana, que nao
       * existe, e cortava o valor no sitio errado.
       */
      const proximo = texto.indexOf('(', inicioValor);
      fim = proximo < 0 ? texto.length : proximo;
      valor = texto.slice(inicioValor, fim);
    }

    const limpo = validar(encontrado, valor, texto);

    campos.push({
      ai: encontrado.numero,
      valor: (encontrado.resto || '') + limpo,
      /** O valor so, sem o resto do AI implicito. */
      conteudo: limpo,
      separador: encontrado.sep,
    });

    i = fim;
  }

  if (campos.length === 0) {
    throw new Error('GS1-128: o texto nao tem nenhum campo. Escreve (01)04012345678901.');
  }

  /*
   * O payload do GS1: a concatenacao dos campos **sem** os parenteses e **sem** o
   * FNC1, que e' a forma de maquina antes de lhe juntar os separadores. Nao e' o
   * que vai no codigo de barras - isso e' a lista de `valores` do `gs1_128` - mas
   * e' o texto que o utilizador pode confirmar.
   */
  const maquina = campos.map((c) => c.ai + c.valor).join('');

  return { campos, texto: maquina };
}

/**
 * Confere o valor de um campo contra o que a GS1 diz dele.
 *
 * A expressao regular vem da propria GS1, e da tabela. E' mais forte do que
 * contar caracteres: `(\d{2}(?:0\d|1[0-2])(?:[0-2]\d|3[01]))` para uma data
 * recusa `275630` - mes 56 - e o leitor do GS1 recusa tambem.
 *
 * **O `trim` e' o que torna a forma humana legivel.** A GS1 escreve os campos
 * com um espaco de cada lado nos exemplos - `(10) LOTE-A1` - e o espaco nao faz
 * parte do valor. A forma de maquina nao leva o espaco, e o codigo de barras tem
 * de ter o valor e nao o valor mais os espacos de leitura.
 *
 * Um `trim` sem isto parece um detalhe, e e' a diferenca entre aceitar e recusar
 * metade dos exemplos que a propria GS1 escreve.
 */
function validar(ai, valor, texto) {
  const limpo = valor.trim();

  if (limpo === '') {
    throw new Error(`GS1-128: o AI (${ai.numero}) nao tem valor.`);
  }

  if (ai.maximo !== null && limpo.length > ai.maximo) {
    throw new Error(
      `GS1-128: o AI (${ai.numero}) aceita no maximo ${ai.maximo} caracteres e o ` +
        `valor "${limpo}" tem ${limpo.length}.`,
    );
  }

  /*
   * O regex da GS1 vem com o grupo todo entre parenteses - `(\d{6})`. Ancorar e' o
   * que impede que um valor mais longo passe: sem `^` e `$` um regex nao ancorado
   * aceita o valor se *contiver* um match, e `(17)270630` com um digito a mais
   * leria-se bem - que e' o tipo de erro que so o leitor acusa.
   */
  const padrao = new RegExp(`^(?:${ai.re})$`);
  if (!padrao.test(limpo)) {
    throw new Error(
      `GS1-128: o valor "${limpo}" do AI (${ai.numero}) nao corresponde ao que a ` +
        `GS1 define. O formato e' ${ai.f}.`,
    );
  }

  return limpo;
}

/**
 * A forma legivel, com o separador GS entre os campos.
 *
 * Nao e' o que vai para o codigo de barras - e' o texto que a interface mostra ao
 * utilizador para ele confirmar que os campos sairam onde espera, e para o
 * `descodificar` comparar com o que o ZXing devolveu.
 *
 * O separador entre campos e' o `GS` de cima, 0x1D - e nao uma cadeia vazia, que
 * era o que a primeira versao tinha num `join('')` e que colava os campos sem
 * dar por isso. No texto que o ZXing devolve este byte aparece como a letra `f`.
 */
/**
 * A forma de maquina: os campos sem parenteses, com o separador no sitio certo.
 *
 * O separador vai **depois** de um campo de comprimento variavel, e so se esse
 * campo nao for o ultimo. E' a regra da GS1 e e' a mesma que o `gs1_128` usa ao
 * montar os codewords - as duas funcoes tem de concordar, e e' por isso que a
 * lista se percorre com o mesmo criterio nas duas.
 *
 * A primeira versao desta funcao nao existia: o `payload` era a concatenacao sem
 * nada, e o gerador de testes fazia a sua versao - juntando um separador entre
 * todos os campos. O ZXing devolvia o mesmo codigo com menos um `0x1D` nos bytes
 * e o teste falhava, e a razao era essa: um separador a mais num campo que nao
 * precisa dele. Um codigo com um `0x1D` a mais ainda e' lido por alguns leitores -
 * e recusado por outros. Nao e' um erro que se veja no desenho.
 */
function maquina(campos) {
  return campos
    .map((campo, i) => {
      const ultimo = i === campos.length - 1;
      return campo.ai + campo.valor + (campo.separador && !ultimo ? GS : '');
    })
    .join('');
}

function legivel(campos) {
  /*
   * A forma humana: os AIs entre parenteses, **sem** separador nenhum.
   *
   * A primeira versao punha aqui um `join(GS)`, e foi o separador a mais que fez
   * o `descodificar-gs1.py` falhar em seis dos oito casos. A forma humana da GS1
   * nao tem separadores: e' `(01)04012345678901(10)LOTE-A1`, e e' o `(` que marca
   * o fim do campo. E' exactamente o que o ZXing devolve em `text`.
   *
   * **O separador so existe na forma de maquina**, e quem o poe e' o `gs1_128`,
   * no codeword. A `maquina()` acima e' a forma com separadores, e sao as duas
   * metades da mesma coisa: uma para quem le e uma para o codigo de barras.
   */
  return campos.map((c) => `(${c.ai})${c.valor}`).join('');
}

/**
 * Os modulos do codigo de barras, a partir da lista de valores.
 *
 * Deliberadamente **nao** chama o `code128()`. Aquele escolhe os conjuntos e faz
 * as comutacoes, e o GS1-128 nao pode: tem de ficar no conjunto B e o FNC1 e' um
 * codeword que o `code128()` nao sabe emitir. Chama-lo e forcar o conjunto B por
 * opcao seria meio caminho, e o meio caminho e' onde estao os bugs: o
 * `python-barcode` faz o GS1-128 a bruto - prefixa FNC1 e nao emite separadores -
 * e o codigo dele desenha-se bem e le-se com o campo partido.
 *
 * Os padroes vem do `code128.js`, que e' onde estao: sao os mesmos 107 padroes de
 * barras e espacos que qualquer Code 128 usa, e uma segunda copia da tabela e'
 * uma tabela que diverge.
 */
function modulosDe(valores) {
  const modulos = [];

  for (const valor of valores) {
    const padrao = PADROES_CODE128[valor];
    if (padrao === undefined) {
      throw new Error(`GS1-128: o codeword ${valor} nao existe.`);
    }

    // As larguras alternam barra, espaco, barra... e cada elemento e' repetido
    // esse numero de vezes. O padrao tem seis elementos - o ultimo tem sete, com
    // a barra de paragem - e comeca sempre em barra.
    for (let i = 0; i < padrao.length; i++) {
      const escuro = i % 2 === 0;
      for (let k = 0; k < Number(padrao[i]); k++) modulos.push(escuro ? 1 : 0);
    }
  }

  return modulos;
}
