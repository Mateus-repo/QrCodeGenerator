/**
 * FrameQR.
 *
 * **Não é uma simbologia nova.** É pós-processamento sobre o QR que já existe:
 * gerar o código, apagar um rectângulo centrado, e pôr o logótipo lá dentro.
 * O detalhe é que o apagado destrói módulos que fazem parte dos dados — e é a
 * correcção de erros que os recupera a partir dos restantes.
 *
 * Por isso um FrameQR é um QR normal com mais correcção de erros, e não um
 * formato à parte. Quem lê não vê um "FrameQR": vê um QR com uma zona a branco,
 * e o algoritmo de leitura preenche os módulos em branco. O ZXing faz isto
 * por omissão.
 *
 * O que este módulo tem de acertar, e que não é óbvio:
 *
 *  - **Os padrões funcionais não se apagam.** Os três padrões de localização,
 *    as linhas de temporização, os padrões de alinhamento, a informação de
 *    formato e a de versão não são dados: a correcção de erros não os
 *    reconstrói, porque nunca os teve. Apagá-los não dá um QR com um logótipo,
 *    dá um Drawing que não é lido por nada.
 *  - **A área apagada tem de caber na correcção de erros.** É por isso que o
 *    logótipo grande obriga a subir de versão. Sem essa regra, um logótipo a
 *    30% às vezes lê e às vezes não conforme o texto, e o pior caso é um
 *    cartão impresso que não varre.
 *  - **Fica um anel em volta da zona apagada.** É problema de impressão e não
 *    de leitura: sem o anel, o logótipo encosta ao código e o contraste
 *    desaparece. Nenhum teste de leitura o apanha, porque o código continua a
 *    ler perfeitamente.
 */

import { alignmentPositions } from './qrcode.js';

/**
 * A máscara do que não pode ser apagado.
 *
 * Calculada uma vez por versão, e não módulo a módulo: `aplicarFrame` é
 * chamado a cada tecla que o utilizador escreve, e percorrer a matriz duas
 * vezes por evento é desperdício que se nota num telemóvel.
 */
function mascaraDeFuncao(size, version) {
  const reservado = Array.from({ length: size }, () => new Array(size).fill(false));

  const marcar = (x, y) => {
    if (x >= 0 && y >= 0 && x < size && y < size) reservado[y][x] = true;
  };
  const bloco = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) marcar(x, y);
    }
  };

  // Os três padrões de localização, 7x7, e os separadores à volta deles.
  for (const [cx, cy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    bloco(cx, cy, 7, 7);
    // O separador é a linha de módulos claros à direita e por baixo.
    if (cx === 0 && cy === 0) {
      bloco(7, 0, 1, 8);
      bloco(0, 7, 8, 1);
    } else if (cx === size - 7) {
      bloco(size - 8, 7, 1, 8);
      bloco(size - 7, 7, 7, 1);
    } else {
      bloco(7, size - 8, 8, 1);
      bloco(7, size - 7, 1, 8);
    }
  }

  // As linhas de temporização.
  bloco(6, 0, 1, size);
  bloco(0, 6, size, 1);

  // Os padrões de alinhamento, 5x5, centrados na grelha.
  for (const [cx, cy] of centrosDeAlinhamento(size, version)) {
    bloco(cx - 2, cy - 2, 5, 5);
  }

  /*
   * A informação de formato: 15 módulos em duas cópias à volta do padrão de
   * localização de cima à esquerda, mais uma em cada um dos outros dois.
   *
   * A cópia principal ocupa a linha 8 e a coluna 8. As das outras duas estão
   * divididas: a de cima à direita fica na linha 8, a de baixo à esquerda na
   * coluna 8. São módulos de dados para a correcção de erros, mas perdem-se
   * cedo — a leitura percorre-os à procura de uma versão, e é a primeira coisa
   * que deixa de funcionar se estiverem apagados. Por isso ficam protegidos.
   */
  bloco(8, 0, 8, 1); // linha 8, colunas 0-7
  bloco(0, 8, 1, 8); // coluna 8, linhas 0-7
  bloco(size - 8, 8, 8, 1); // linha 8, do lado direito
  bloco(8, size - 7, 1, 7); // coluna 8, lado de baixo
  marcar(8, 8); // o módulo partilhado
  marcar(size - 8, 8); // o módulo escuro obrigatório

  // A informação de versão, a partir da versão 7. Dois blocos de 6x3.
  if (version >= 7) {
    bloco(size - 11, 0, 3, 6);
    bloco(0, size - 11, 6, 3);
  }

  return reservado;
}

/**
 * Os centros dos padrões de alinhamento de uma versão.
 *
 * Vem de `alignmentPositions`, a mesma função que o encoder usa para os
 * desenhar. Antes isto tinha a regra reescrita aqui — "de 6 em 6, menos os
 * cantos" — e estava **errada**: numa grelha de 6 em 6 a versão 2 devolvia
 * doze centros onde a norma põe um só. O efeito era duplo e nos dois
 * sentidos: protegia como funcionais uns módulos que eram dados, e deixava
 * apagar o padrão de alinhamento, que é funcional. O código desenhava-se
 * com aspecto certo e não lia.
 */
export function centrosDeAlinhamento(size, version) {
  if (version < 2) return [];

  const eixos = alignmentPositions(version);
  const ultimo = eixos[eixos.length - 1];
  const centros = [];

  for (const cy of eixos) {
    for (const cx of eixos) {
      /*
       * O padrão de alinhamento é 5x5 e o de localização é 7x7, e o centro
       * deste está em 3 — por isso uma grelha que começa em 6 já está em cima
       * do de localização. Retiram-se esses três: o de cima à esquerda, o de
       * cima à direita e o de baixo à esquerda.
       *
       * **O de baixo à direita fica.** Retirá-lo é o erro que a versão
       * anterior cometia, e dá zero padrões na versão 2, onde a norma põe
       * exactamente um. A excepção que a norma faz é a oposta: em vez de
       * apaga-lo, é a razão de ele não colar com o padrão de localização
       * vizinho.
       */
      const coladoComLocalizacao =
        (cx === 6 && cy === 6) ||
        (cx === ultimo && cy === 6) ||
        (cx === 6 && cy === ultimo);

      if (coladoComLocalizacao) continue;
      centros.push([cx, cy]);
    }
  }

  return centros;
}

/**
 * A percentagem segura por nível, medida e não deduzida.
 *
 * São os piores casos de uma varredura com o ZXing, e os valores **não sobem
 * de forma regular** de L para H. Isso parece um erro e não é:
 *
 *     nivel   pior caso medido   QR          teorico
 *     L       0.96%               v2  25x25    4%
 *     M       0.96%               v2  25x25    8%
 *     Q       3.52%               v2  25x25   14%
 *     H       2.85%               v3  29x29   24%
 *
 * A razão é que o pior caso de cada nível cai num QR diferente. O H tem mais
 * correcção de erros, e por isso o mesmo texto sai num QR **maior** — e num QR
 * maior a mancha toca menos codewords por módulo, porque os blocos são maiores.
 * O H aguenta uma percentagem menor de área e um logotipo maior em módulos.
 *
 * Daí a segunda lição, que é a que mais custou acertar: **a percentagem conta
 * módulos escuros apagados, não área.** Um módulo que já era claro não custa
 * nada à correcção de erros. Numa zona quadrada isso é cerca de metade, e é por
 * isso que a conta de lado em `modulosMaximos` leva um factor de raiz de dois.
 *
 * A teoria (4/8/14/24 por cento) é 4 a 6 vezes o que um QR pequeno aguenta.
 * Usá-la dá logótipos grandes que às vezes leem — o pior resultado possível,
 * porque o defeito só aparece no cartão já impresso.
 */
const PERCENTAGEM_SEGURA = { L: 0.9, M: 0.9, Q: 3.4, H: 2.8 };

/** A margem que fica entre o logotipo e o código, em módulos, de cada lado. */
export const MARGEM = 2;

/**
 * Quanto uma imagem pode medir, em píxeis, para o logotipo.
 *
 * **O número não é fixo, e é por isso que isto é uma função e não uma
 * constante.** Depende da escala — os píxeis por módulo — e a escala depende do
 * tamanho pedido e da versão do QR, que mudam enquanto o utilizador escreve. Um
 * número escrito uma vez no HTML seria uma mentira em metade dos casos: com o
 * tamanho em 512 px e um logotipo de 5 módulos, a imagem útil tem 60×60; a
 * 2048 px, o mesmo logotipo dá 250×250.
 *
 * **A medida é o que interessa, e há dois lados:**
 *
 *  - O **ideal** é N×N **módulos**, que é `N × escala` em píxeis. Acima
 *    disso já não há resolução a ganhar, porque um módulo é o menor elemento
 *    do código — o browser reduz a imagem e o resultado é o mesmo.
 *  - **Abaixo** é que se perde: a imagem é esticada e o logotipo fica a
 *    serrilhado, que numa etiqueta pequena se vê a um metro.
 *
 * Por isso o aviso ao utilizador é dos dois lados, e com conselhos
 * diferentes: uma imagem pequena manda ficar maior ou escolher um logotipo
 * mais pequeno; uma grande não é problema nenhum, porque o browser reduz bem.
 */
export function dimensaoDoLogotipo(modulos, escala) {
  return {
    modulos,
    escala,
    /** O lado da caixa, em píxeis. */
    pix: modulos * escala,
    /** A caixa em módulos — a medida ideal, e a que não se passa. */
    ideal: modulos,
  };
}

/**
 * Desenha a imagem do logotipo dentro da zona apagada.
 *
 * **O deslocamento pela margem do código entra aqui, e esquecê-lo descentra o
 * logótipo sem o estragar.** A zona apagada é dada em coordenadas de *módulo do
 * código*, mas o canvas desenha cada módulo a partir de `offset` módulos de
 * margem. São a mesma grelha com origens diferentes, e a primeira versão desta
 * função ignorava a segunda: o logótipo saía 4 módulos à esquerda, ou seja à
 * esquerda da margem, e o código continuava a ler porque a zona apagada é a
 * mesma — só o desenho é que estava torto. Uma falha que se vê logo, mas que
 * nenhum teste de leitura apanha, porque o QR não mudou.
 *
 * @param `offset` a margem do código, em módulos. Não é a `MARGEM` de cima,
 *   que é o anel em volta do logotipo: são duas coisas diferentes com o mesmo
 *   nome, e confundi-las é exactamente o erro acima.
 *
 * **A imagem é reduzida, nunca esticada.** Entra pelo lado mais comprido e fica
 * centrada, e o que sobra do quadrado é branco. Esticar uma imagem quadrada para
 * um rectângulo — ou o contrário — deforma o logotipo, e um logotipo deformado
 * é pior do que um logotipo pequeno.
 */
export function desenharLogotipo(contexto, codigo, imagem, opcoes) {
  const { escala, offset = 0 } = opcoes;

  /*
   * **`margem` nao e' o mesmo nome que `offset`, e a confusao custou o
   * desenho torto.**
   *
   * A chamada em `app.js` passou `margem: border` durante muito tempo, com o
   * `offset` no seu valor por omissao de zero. O logotipo saia `border` modulos
   * para a esquerda e para cima — medido, 40 pixeis a 10 pxeis por modulo — e
   * **nada falhava**: o QR continuava a ler, a imagem estava centrada dentro de
   * uma caixa que estava no sitio errado, e o unico sintoma era o desenho.
   *
   * **Uma funcao que ignora uma opcao desconhecida e' a pior forma de bug:** a
   * assinatura promete, o corpo ignora. Por isso que aqui se recusa em vez de
   * ignorar, e a recusa diz o que fazer.
   *
   * A razao de isto ser um `if` e nao um `assert` de teste e' que o aviso tem
   * de aparecer **no browser**: o `offset` a zero e' um valor legitimo e um
   * valor de esquecimento, e nada no desenho os distingue.
   */
  if ('margem' in opcoes) {
    throw new Error(
      "desenharLogotipo: a opção chama-se `offset`, não `margem`. A zona " +
        'apagada é dada em coordenadas do código e o canvas desenha a partir ' +
        'da margem, pelo que a margem entra como deslocamento em módulos. ' +
        'Passar `margem` deixava o logotipo deslocado.',
    );
  }

  if (!imagem || !codigo || !codigo.zona) return;

  const { inicio, fim } = codigo.zona;
  const ladoModulos = fim - inicio;
  const caixa = ladoModulos * escala;
  if (caixa <= 0) return;

  // A origem da grelha do canvas: o mesmo deslocamento que `draw()` usa.
  const x0 = (inicio + offset) * escala;
  const y0 = (inicio + offset) * escala;

  // Entra pelo lado mais comprido, para não deformar.
  const proporcao = imagem.naturalWidth / imagem.naturalHeight;
  let largura;
  let altura;

  if (imagem.naturalWidth >= imagem.naturalHeight) {
    largura = caixa;
    altura = Math.round(caixa / proporcao);
  } else {
    altura = caixa;
    largura = Math.round(caixa * proporcao);
  }

  contexto.drawImage(
    imagem,
    Math.round(x0 + (caixa - largura) / 2),
    Math.round(y0 + (caixa - altura) / 2),
    largura,
    altura,
  );
}

/**
 * O maior número de módulos de lado que o logotipo pode ter.
 *
 * A conta é sobre a zona apagada inteira — logotipo mais margem. A margem
 * também são módulos que a correcção de erros tem de reconstruir, e contar
 * só pelo logotipo dá um logotipo grande demais. Com margem 2 de cada lado,
 * um logotipo de 6 módulos apaga uma área de 10x10.
 *
 * O tecto de `size / 5` é para o código continuar a ser um código: abaixo de
 * um quinto da largura, o padrão de localização e a mancha já não se
 * distinguem, nem para quem o vai escanear com um telemóvel na mão.
 */
export function modulosMaximos(size, ecl, margem = MARGEM) {
  const percentagem = PERCENTAGEM_SEGURA[ecl] ?? PERCENTAGEM_SEGURA.M;
  const area = size * size;

  /*
   * A raiz de dois é o que separa esta conta da primeira versão, que dava
   * logótipos pequenos demais e ninguém percebia porquê.
   *
   * A percentagem segura é de módulos **escuros** apagados, e numa zona
   * quadrada cerca de metade dos módulos já é clara — apagá-los não estraga
   * nada. A primeira versão dividia a área toda pela percentagem, contava o
   * dobro do que devia, e num QR de 25x25 a nível Q acabava a recomendar um
   * logótipo de 0 módulos quando o ZXing lê 8 sem dificuldade.
   */
  const zona = Math.floor(Math.sqrt((2 * area * percentagem) / 100));

  /*
   * E depois o tecto do que há mesmo no meio para apagar.
   *
   * Os padrões de localização com os separadores ocupam 8 módulos de cada
   * canto, e a zona tem de ficar entre eles. Num QR de 21 (versão 1) o meio
   * livre são 2 módulos e não cabe margem nenhuma — e o honesto é dizer que
   * um QR de 21x21 não leva logotipo, e não forçar um que não lê.
   */
  const livre = Math.floor(size / 2) - 8;

  // O logotipo é a zona menos a margem dos dois lados.
  const logotipo = Math.min(zona - margem * 2, livre * 2 - margem * 2);

  return Math.max(0, Math.min(logotipo, Math.floor(size / 5) - margem));
}

/**
 * Apaga uma zona centrada.
 *
 * Devolve uma matriz nova: `encode()` pode devolver a mesma matriz a quem
 * chamar a seguir, e mutá-la seria um bug que só apareceria na segunda
 * geração.
 */
export function aplicarFrame(qr, opcoes = {}) {
  const { modulos = 0, margemMinima = MARGEM } = opcoes;
  const tamanho = qr.size;

  const copia = qr.modules.map((linha) => linha.slice());
  if (modulos <= 0) {
    return { ...qr, modules: copia, apagados: 0, percentagem: 0, zona: null, seguro: true };
  }

  const reservado = mascaraDeFuncao(tamanho, qr.version);

  /*
   * A zona tem exactamente `modulos` de lado e fica centrada, em vez de
   * `ceil` de cada lado. Com `ceil`, pedir 9 dava 10 — e o logotipo saía um
   * módulo maior do que o que a aplicação promete, que é a classe de bug em
   * que a zona é maior do que a correcção de erros que foi calculada para ela.
   *
   * O `inicio` é arredondado para baixo, o que empurra a zona um meio módulo
   * para a esquerda num tamanho ímpar. Num QR isso é invisível, e o importante
   * é o lado certo.
   */
  const inicio = Math.max(0, Math.floor((tamanho - modulos) / 2));
  const fim = inicio + modulos;

  // A zona apagada e o anel em volta, para o logótipo não encostar ao código.
  const raio = margemMinima;
  let apagados = 0;

  for (let y = inicio - raio; y < fim + raio; y++) {
    for (let x = inicio - raio; x < fim + raio; x++) {
      if (x < 0 || y < 0 || x >= tamanho || y >= tamanho) continue;
      if (reservado[y][x]) continue;
      if (copia[y][x]) apagados++;
      copia[y][x] = false;
    }
  }

  const percentagem = (apagados / (tamanho * tamanho)) * 100;

  /*
   * O `seguro` compara com a percentagem medida, que e uma fracao de area — e
   * nao o numero de codewords. E uma aproximacao, e o porquê de o valor ser
   * medido no pior caso: a fracao de area que um QR pequeno aguenta e muito
   * menor do que a fracao de codewords, porque nele a mancha toca mais
   * codewords. Ver a nota em PERCENTAGEM_SEGURA.
   */
  return {
    ...qr,
    modules: copia,
    apagados,
    percentagem,
    zona: { inicio, fim, margem: raio },
    seguro: percentagem <= (PERCENTAGEM_SEGURA[qr.ecl] ?? PERCENTAGEM_SEGURA.M),
  };
}

export { PERCENTAGEM_SEGURA };
