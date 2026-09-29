/**
 * O desenho do Data Matrix, e do GS1 DataMatrix.
 *
 * Foi escrito aqui e não em `symbologies/linear.js` porque o Data Matrix **não é um
 * código de barras**: é uma grelha de duas dimensões como o QR, com guias em L e
 * um preenchimento em anel, e o que sabe desenhá-lo é o que sabe desenhar o QR.
 *
 * A diferença para o QR, que vale a pena saber, é que **o Data Matrix não tem
 * três padrões de localização nos cantos**. A orientação vem de duas guias: uma
 * **cheia** em baixo e à esquerda, e outra **tracejada** em cima e à direita. É
 * assim que o leitor sabe que lado é o "canto", e é por isso que ele é muito mais
 * pequeno que um QR com a mesma informação — não leva o que um QR leva só para
 * se orientar.
 */

/** A zona muda do Data Matrix, em módulos. */
const ZONA_DATA_MATRIX = 2;

/**
 * Desenha o Data Matrix no canvas.
 *
 * O alvo é a largura, como no QR e no PDF417: a escala em píxeis por módulo sai
 * dela, e a matriz é quadrada, por isso a altura dá-se. A escala é sempre um
 * inteiro — uma escala fraccionária antialiasaria as guias, e uma guia
 * tracejada antialiasada é uma guia tracejada que o leitor não lê.
 */
export function desenharDataMatrix(canvas, codigo, opcoes = {}) {
  const { margem = ZONA_DATA_MATRIX, targetPx = 512 } = opcoes;
  const linhas = codigo.modules.length;
  const colunas = codigo.modules[0].length;

  const modulos = colunas + margem * 2;
  const escala = Math.max(1, Math.ceil(targetPx / modulos));
  const lado = modulos * escala;

  canvas.width = lado;
  canvas.height = lado;

  const contexto = canvas.getContext('2d');
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, lado, lado);
  contexto.fillStyle = '#000000';

  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < colunas; x++) {
      if (!codigo.modules[y][x]) continue;
      const x0 = (x + margem) * escala;
      const y0 = (y + margem) * escala;
      contexto.fillRect(x0, y0, escala, escala);
    }
  }

  return { escala, lado, margem };
}

/**
 * O Data Matrix em SVG.
 *
 * **A mesma matriz que o canvas**, e não o payload outra vez — pela mesma razão
 * que o QR com o logótipo: sem isto, o PNG e o SVG saíam diferentes e ninguém
 * dizia nada.
 *
 * Um `<rect>` por módulo escuro. São muitos — um símbolo de 26×26 são 338
 * módulos, mais a margem — e a alternativa, um único `<path>`, dá um ficheiro
 * mais pequeno mas ilegível para quem o quiser abrir. Um SVG que é lido por
 * pessoas vale mais do que um SVG que é leve.
 */
export function paraSvgDataMatrix(codigo, opcoes = {}) {
  const { margem = ZONA_DATA_MATRIX } = opcoes;
  const linhas = codigo.modules.length;
  const colunas = codigo.modules[0].length;
  const dimensao = colunas + margem * 2;

  const rects = [];
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < colunas; x++) {
      if (!codigo.modules[y][x]) continue;
      rects.push(
        `<rect x="${x + margem}" y="${y + margem}" width="1" height="1"/>`,
      );
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimensao} ${dimensao}" ` +
    `shape-rendering="crispEdges" width="${dimensao * 8}" height="${dimensao * 8}">` +
    `<rect width="${dimensao}" height="${dimensao}" fill="#ffffff"/>` +
    `<g fill="#000000">${rects.join('')}</g>` +
    `</svg>`
  );
}
