/**
 * O rMQR: a tabela esta feita e verificada, o encoder nao.
 *
 * Este modulo e' a **pasta do rMQR** para quando a colocacao dos dados estiver
 * disponivel. Nao exporta nenhum encoder, e nao esta ligado ao registo de
 * formats - de proposito, porque um registo sem encoder da um `undefined` que
 * so aparece quando alguem escolhe o formato.
 *
 * ## O que ja esta resolvido
 *
 * `rmqr-tabelas.js` tem as tres tabelas, geradas do zxing-cpp 3.1.1 e
 * verificadas contra o ZXing:
 *
 *  - os **32 simbolos**, com os centros de alinhamento e os blocos de correccao
 *    de M e H;
 *  - os **bits do indicador de caracteres**, 32 por modo;
 *  - e os **tamanhos**, que sao so a soma e servem de nome.
 *
 * ## O que falta, e porque e' a parte que nao se deduz
 *
 * A **colocacao dos dados**: a ordem em que os bits preenchem a grelha. No QR
 * e' uma espiral em zigue-zague de duas colunas de cada vez, que exploits o
 * facto de a grelha ser quadrada. Num rectangulo isso nao se aplica da mesma
 * maneira, e a ordem e' diferente.
 *
 * Isto **nao e' um detalhe que se possa inventar**, e a razao e' a que ja
 * aconteceu quatro vezes neste repositorio: o Code 39 com doze elementos por
 * caracter em vez de nove, o Code 93 com a soma de verificacao sem pesos, a
 * mascara 4 do QR com `x` e `y` trocados, e o ITF com dois elementos na moldura
 * de paragem. **Todos se desenhavam perfeitamente e nenhum era lido.** O
 * sintoma unico de uma colocacao errada e' um codigo que parece certo.
 *
 * E nao ha teste nenhum que apanhe isso. O `node --test` passa. A unica coisa
 * que apanha e' um leitor independente, e o teste de leitura - que e' o que
 * este repositorio chama de nivel 2, e que nao se pode escrever sem o encoder.
 *
 * ## O que foi procurado
 *
 * A tabela veio do **zxing-cpp 3.1.1**, e o que falta nao esta la nem em mais
 * lado nenhum de acessivel:
 *
 *  - `QRVersion.cpp` tem a tabela dos 32 simbolos e a `buildFunctionPattern` do
 *    rMQR, que e' a geometria dos padroes de funcao;
 *  - `QRFormatInformation.cpp` tem os 64 padroes de formato mascarados, com a
 *    mascara `0x1FAB2` e 6 bits de dados mais 12 de BCH;
 *  - `QRDataMask.h` tem as 7 mascaras, que sao as mesmas do QR;
 *  - e a **colocacao dos dados nao esta em lado nenhum** - nem no
 *    `QRMatrixUtil.cpp` (que so tem a do QR quadrado), nem no `QREncoder.cpp`
 *    (que so codifica Model2), nem no Zint, que nao tem rMQR nenhum.
 *
 * A geometria dos padroes de funcao e' a parte facil de reconstruir a partir da
 * `buildFunctionPattern`, e a informacao de formato e' uma tabela de 64
 * numeros. **A colocacao e' a unica que nao se pode escrever a partir de
 * nenhuma das duas.**
 *
 * ## A armadilha da zona calma
 *
 * A imagem que o `zxingcpp` devolve ja vem com **2 modulos de zona calma** de
 * cada lado. Medir o SVG sem tirar isso da `31x15` onde o simbolo e' `27x11` -
 * e `31x15` nao esta em tabela nenhuma, o que faz concluir que a ferramenta
 * escrevia mal. Escrevia bem; media-se mal.
 *
 * Fica aqui porque o proximo que mexer no rMQR vai medir o mesmo SVG e vai
 * chegar a essa conclusao outra vez.
 */

import { SIMBOLOS, BITS_DE_CONTAGEM, capacidadeDe, NIVEL_PADRAO } from './rmqr-tabelas.js';

/**
 * O simbolo que o conteudo pede, e `null` se nao couber em nenhum.
 *
 * A escolha e' pela **area minima**, e nao pela ordem - que e' a propriedade
 * mais estranha do formato. O mesmo conteudo pode dar um simbolo estreito e
 * alto ou largo e baixo, e quem decide e' a area, porque e' a area que se
 * paga numa etiqueta.
 *
 * E' a razao de o rMQR ter alcances tao diferentes entre simbolos vizinhos:
 *
 *     1 caracter   ->  27x11
 *    50 caracteres ->  43x17
 *   100 caracteres ->  99x13
 *
 * Com uma regra de "o menor que caiba", o texto de 50 caracteres daria o
 * `59x11`, que tem **649** modulos contra os **731** do `43x17`. Mais area, e
 * um codigo pior.
 */
export function simboloPara(bitCount, nivel = NIVEL_PADRAO) {
  let melhor = null;
  let melhorArea = Infinity;

  for (const simbolo of SIMBOLOS) {
    // A capacidade e' em codewords de 8 bits, e o que o conteudo precisa sao
    // bits. E' aqui que o `bitCount` tem de entrar: a escolha do simbolo
    // depende de quantos bits o texto ocupa, e nao so do numero de
    // caracteres - dois textos do mesmo comprimento em modos diferentes dao
    // simbolos diferentes.
    if (bitCount > capacidadeDe(simbolo.versao, nivel) * 8) continue;

    const area = simbolo.largura * simbolo.altura;
    if (area < melhorArea) {
      melhorArea = area;
      melhor = simbolo;
    }
  }

  return melhor;
}

/**
 * A razao da recusa, quando o conteudo nao cabe em nenhum simbolo.
 *
 * O rMQR **recusa** o que nao cabe, e diz porquê. E' o comportamento certo, e
 * o oposto do que um codigo truncado faria: um codigo truncado le sem o
 * ultimo caracter e **nao avisa que truncou** - que e' o pior resultado que
 * existe, porque quem le acredita que leu tudo.
 *
 * A mensagem e' a mesma que o `zxingcpp` devolve, para que se possa comparar.
 */
export function recusa(bitCount, nivel = NIVEL_PADRAO) {
  const maior = SIMBOLOS.reduce((a, b) => (capacidadeDe(b.versao, nivel) > capacidadeDe(a.versao, nivel) ? b : a));
  const precisa = Math.ceil(bitCount / 8);
  const cabe = capacidadeDe(maior.versao, nivel);
  return `O conteudo e' demasiado longo para um rMQR: precisa de ${precisa} codewords e o maior simbolo (${maior.nome}) aceita ${cabe}.`;
}

export { SIMBOLOS, BITS_DE_CONTAGEM, capacidadeDe, NIVEL_PADRAO };
