/**
 * Desenhar codigos de barras lineares.
 *
 * O `draw()` do QR nao serve aqui, e nao por uma diferenca de desenho mas de
 * forma: um QR e uma matriz quadrada em que o modulo e a unidade, e um codigo de
 * barras e uma sequencia 1D cuja largura total e variavel. A altura nao vem da
 * matriz — vem da比例cao que o leitor aguenta, que e um valor fisico, nao um
 * parametro do algoritmo.
 *
 * Duas consequencias praticas, ambas diferentes do QR:
 *
 *  - **A altura e independente.** Um EAN-13 tem 95 modulos de largura; a altura
 *    tipica e 68. Derivar uma da outra dava um codigo achatado que nenhum
 *    leitor de mao le.
 *  - **As barras-guarda descem abaixo da linha de base**, para dentro da zona da
 *    legenda. E assim que uma etiqueta real se parece, e e o que permite ao
 *    leitor de saber onde o codigo acaba sem o ler todo.
 *
 * Como no QR, o resultado e sempre preto sobre branco. Um codigo de barras
 * tem de se ler com um leitor de baixo contraste, e a etiqueta nem sempre esta
 * em fundo branco.
 */

/** A proportion da barra, como em qualquer código de barras. */
const PROPORCAO = 0.8;

/** As guardas descem mais, para 0.95 da altura. */
const PROPORCAO_GUARDA = 0.95;

/**
 * A margem em branco à volta, em modulos.
 *
 * A ISO/IEC 15420 pede 10. Vale para qualquer código de barras, linear ou não,
 * e é o que garante que o leitor funciona com o código encostado a outras
 * coisas impressas na etiqueta.
 */
export const MARGEM_PADRAO = 10;

/** Quantos píxeis por módulo. */
export const ESCALA_PADRAO = 2;

/**
 * As dimensões de tudo, em píxeis, antes de desenhar.
 *
 * Separado do desenho para que a interface possa mostrar o tamanho final sem
 * ter de desenhar, e para que o SVG e o PNG não possam discordar sobre as
 * dimensões — que é a forma mais fácil de um código de barras sair cortado num
 * e não no outro.
 */
export function dimensoes(codigo, opcoes = {}) {
  const { escala = ESCALA_PADRAO, margem = MARGEM_PADRAO, alturaModulos, comLegenda = true } = opcoes;

  const alturaBarra = alturaModulos ?? codigo.alturaModulos ?? 60;
  const larguraModulos = codigo.modules.length;
  const alturaTotal = alturaBarra + (comLegenda ? Math.ceil(alturaBarra * 0.18) : 0);

  return {
    escala,
    margem,
    alturaBarra,
    /** A altura da barra em píxeis, já sem a escala. */
    alturaTotal,
    larguraTotal: larguraModulos + margem * 2,
    pxLargura: (larguraModulos + margem * 2) * escala,
    pxAltura: alturaTotal * escala,
  };
}

/**
 * Desenha no canvas.
 *
 * Devolve as dimensões, para a interface poder mostrar "600×180 px" sem ter de
 * as repetir aqui e no SVG.
 */
export function desenhar(canvas, codigo, opcoes = {}) {
  const {
    dark = '#000000',
    light = '#ffffff',
    comLegenda = true,
  } = opcoes;

  const d = dimensoes(codigo, opcoes);
  const context = canvas.getContext('2d', { willReadFrequently: false });

  canvas.width = d.pxLargura;
  canvas.height = d.pxAltura;

  context.fillStyle = light;
  context.fillRect(0, 0, d.pxLargura, d.pxAltura);
  context.fillStyle = dark;

  const guardas = new Set(codigo.guards ?? []);
  const alturaBarra = Math.round(d.alturaBarra * d.escala);
  const alturaGuarda = Math.round(d.alturaBarra * PROPORCAO_GUARDA * d.escala);

  for (let i = 0; i < codigo.modules.length; i++) {
    if (!codigo.modules[i]) continue;

    const x = Math.round((i + d.margem) * d.escala);
    const h = guardas.has(i) ? alturaGuarda : Math.round(alturaBarra * PROPORCAO);
    context.fillRect(x, 0, d.escala, h);
  }

  if (comLegenda && codigo.legenda) {
    desenharLegenda(context, codigo, d, dark);
  }

  return d;
}

/**
 * A legenda, ou seja, os dígitos impressos por baixo.
 *
 * Não é uma linha centrada. Os dígitos vão **debaixo das barras que os
 * codificam**, e as barras-guarda descem entre os grupos para os separar — é
 * assim que uma etiqueta de EAN parece uma etiqueta de EAN, e é o que permite
 * a quem lê confirmar o número a olho. Quem decide onde vai cada grupo é a
 * simbologia, em `gruposLegenda`.
 *
 * O tipo de letra é monoespaçado para os dígitos ficarem alinhados, e é
 * ajustado ao espaço de cada grupo. O ajuste encolhe *e* cresce: a primeira
 * versão só sabia crescer, e com um texto de 13 dígitos o nome saía cortado
 * dos dois lados — que é pior do que não imprimir legenda nenhuma.
 */
function desenharLegenda(context, codigo, d, dark) {
  const grupos = codigo.gruposLegenda;
  if (!grupos || grupos.length === 0) return;

  const altura = alturaBarraEmPx(d);
  const topo = Math.round(altura * PROPORCAO_GUARDA) + Math.round(d.escala * 2);
  const alturaLetra = Math.max(8, Math.round(altura * 0.15));

  context.fillStyle = dark;
  context.textAlign = 'center';
  context.textBaseline = 'top';

  for (const grupo of grupos) {
    if (!grupo.texto) continue;

    // O intervalo vem da simbologia, em módulos. Um `inicio` negativo quer dizer
    // "antes da primeira barra" — o dígito que o EAN-13 imprime no canto, na
    // margem. O desenho sabe quanto vale a margem; a simbologia, não.
    const comMargem = {
      inicio: grupo.inicio < 0 ? -d.margem : grupo.inicio,
      fim: grupo.fim,
    };
    const x0 = (comMargem.inicio + d.margem) * d.escala;
    const x1 = (comMargem.fim + d.margem) * d.escala;
    const largura = x1 - x0;
    const centro = (x0 + x1) / 2;

    // Não há espaço para o texto: é melhor não imprimir nada deste grupo do
    // que o imprimir em cima da barra vizinha.
    if (largura < 6) continue;

    const tamanho = ajustarTamanho(context, grupo.texto, largura - 2 * d.escala, alturaLetra);

    // A legenda tem de caber na faixa de baixo. Se não couber, encolhe.
    let usado = tamanho;
    while (usado > 8 && topo + usado > d.pxAltura) usado -= 1;
    if (usado < 8) continue;

    context.font = fonteDe(usado);
    context.fillText(grupo.texto, Math.round(centro), topo);
  }
}

function fonteDe(tamanho) {
  return `${tamanho}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
}

/**
 * O maior tipo de letra com que o texto cabe no espaço dado, sem passar do
 * dobro do inicial.
 */
function ajustarTamanho(context, texto, larguraDisponivel, inicial) {
  if (larguraDisponivel <= 0) return 0;

  const cabem = (t) => {
    context.font = fonteDe(t);
    return context.measureText(texto).width <= larguraDisponivel;
  };

  let tamanho = inicial;
  // Encolhe enquanto não couber. Este é o sentido que faltava na primeira
  // versão: só sabia crescer, e um texto comprido nunca cabia — o nome saía
  // cortado dos dois lados.
  while (tamanho > 7 && !cabem(tamanho)) tamanho -= 1;
  if (!cabem(tamanho)) return 0;

  const maximo = Math.round(inicial * 2);
  while (tamanho < maximo && cabem(tamanho + 1)) tamanho += 1;

  context.font = fonteDe(tamanho);
  return tamanho;
}

function alturaBarraEmPx(d) {
  return d.alturaBarra * d.escala;
}

/**
 * O SVG.
 *
 * Um `<rect>` por barra em vez de um caminho. Num código de barras as barras são
 * stripes verticais, e um `<path>` não poupa nada aqui: são milhares de
 * caracteres contra uma linha por barra, e o ficheiro fica mais legível.
 */
export function paraSvg(codigo, opcoes = {}) {
  const { dark = '#000000', light = '#ffffff', comLegenda = true } = opcoes;
  const d = dimensoes(codigo, opcoes);

  const guardas = new Set(codigo.guards ?? []);
  const alturaNormal = Math.round(d.alturaBarra * d.escala * PROPORCAO);
  const alturaGuarda = Math.round(d.alturaBarra * d.escala * PROPORCAO_GUARDA);

  const barras = [];
  for (let i = 0; i < codigo.modules.length; i++) {
    if (!codigo.modules[i]) continue;
    const x = Math.round((i + d.margem) * d.escala);
    const h = guardas.has(i) ? alturaGuarda : alturaNormal;
    barras.push(`<rect x="${x}" y="0" width="${d.escala}" height="${h}"/>`);
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.pxLargura} ${d.pxAltura}" ` +
      `width="${d.pxLargura}" height="${d.pxAltura}" shape-rendering="crispEdges">`,
    `<rect width="${d.pxLargura}" height="${d.pxAltura}" fill="${light}"/>`,
    `<g fill="${dark}">${barras.join('')}</g>`,
  ];

  if (comLegenda && codigo.legenda) {
    /*
     * A legenda vai como <text> e não convertida em caminho, para o ficheiro
     * ficar pequeno e o texto continuar legível a quem abre o SVG num editor.
     * A fonte é a do sistema porque o SVG não embute fontes: quem o abrir noutra
     * máquina vê o que a máquina tiver, e um código de barras tem de ser lido
     * pela máquina, não pelo texto que está por baixo.
     *
     * Um <text> por grupo, nas mesmas posições que no canvas. A fonte do SVG é
     * `textLength` com `lengthAdjust`, que diz ao browser "faz este texto
     * caber exactamente neste comprimento" — é a forma de o SVG ter o mesmo
     * ajuste de tamanho que o canvas sem depender de a fonte ser a mesma nos
     * dois sítios, que não é.
     */
    const topo = Math.round(alturaGuarda + d.escala * 2);
    const alturaLetra = Math.max(8, Math.round(alturaBarraEmPx(d) * 0.15));

    for (const grupo of codigo.gruposLegenda ?? []) {
      if (!grupo.texto) continue;
      const inicio = grupo.inicio < 0 ? -d.margem : grupo.inicio;
      const x0 = (inicio + d.margem) * d.escala;
      const x1 = (grupo.fim + d.margem) * d.escala;
      const centro = Math.round((x0 + x1) / 2);
      svg.push(
        `<text x="${centro}" y="${topo}" fill="${dark}" ` +
          `font-family="ui-monospace, Menlo, Consolas, monospace" font-size="${alturaLetra}" ` +
          `text-anchor="middle" dominant-baseline="hanging" ` +
          `textLength="${Math.max(0, Math.round((x1 - x0) * 0.92))}" ` +
          `lengthAdjust="spacingAndGlyphs">` +
          escaparXml(grupo.texto) +
          '</text>',
      );
    }
  }

  svg.push('</svg>');
  return svg.join('');
}

function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
