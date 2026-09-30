/**
 * Codificador de QR Code (ISO/IEC 18004), modo byte, sem dependências.
 *
 * Porque à mão: uma biblioteca de QR para a web são ~40 KB de JavaScript e
 * uma cadeia de dependências. O algoritmo cabe em um ficheiro e assim sabemos
 * exactamente o que o site envia. Verificado descodificando a imagem com o
 * ZXing (ver tests/).
 *
 * Referência: ISO/IEC 18004, tabela das versões 1..40 e os quatro níveis de
 * correção de erro.
 */

const ECL = { L: 0, M: 1, Q: 2, H: 3 };

// Bits de ECC por bloco, indexados por [nível][versão]. Nível: L, M, Q, H.
const ECC_CODEWORDS_PER_BLOCK = [
  // 0 unused
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Número de blocos de correção de erro, indexado por [nível][versão].
const NUM_ERROR_CORRECTION_BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Bits que o formato de ECC leva (L=1, M=0, Q=3, H=2). */
const ECL_FORMAT_BITS = [1, 0, 3, 2];

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** Módulos de dados disponíveis numa versão, antes de subtracting o ECC. */
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version, ecl) {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl][version] * NUM_ERROR_CORRECTION_BLOCKS[ecl][version]
  );
}

/**
 * Centros dos padrões de alinhamento, por eixo.
 *
 * A fórmula parece arbitrária mas tem de sair certa: para a versão 7 dá
 * 6, 22, 38 (passo 16) e para a 40 dá 6, 30, 58, 86, 114, 142, 170. A versão
 * 32 é o único caso especial, com passo 26 e um primeiro intervalo maior.
 *
 * **Exportada porque o FrameQR precisa dela.** A posição dos padrões de
 * alinhamento aparece em dois sítios — em quem escreve os módulos e em quem
 * decide o que se pode apagar. Duplicar a regra de 6 em 6 com as excepções
 * dá a lista errada: a versão 2 devolvia doze centros onde há um, e o
 * FrameQR protegia módulos que eram dados e apagava o padrão que era
 * funcional. Uma fonte, uma regra.
 */
export function alignmentPositions(version) {
  if (version === 1) return [];

  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;

  const result = [6];
  for (let pos = size(version) - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

const size = (version) => version * 4 + 17;

// --- Codificação de dados ---------------------------------------------------

class BitBuffer {
  constructor() {
    this.bits = [];
  }

  append(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }

  get length() {
    return this.bits.length;
  }
}

function toUtf8Bytes(text) {
  return new TextEncoder().encode(text);
}

/** Calculador de Reed-Solomon sobre GF(256), polinómio 0x11D. */
class ReedSolomon {
  constructor(degree) {
    this.divisor = new Uint8Array(degree);
    this.divisor[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        this.divisor[j] = gfMul(this.divisor[j], root);
        if (j + 1 < degree) this.divisor[j] ^= this.divisor[j + 1];
      }
      root = gfMul(root, 0x02);
    }
  }

  /** Resto da divisão — são os codewords de correção de erro. */
  remainder(data) {
    const result = new Uint8Array(this.divisor.length);
    for (const b of data) {
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (let i = 0; i < result.length; i++) result[i] ^= gfMul(this.divisor[i], factor);
    }
    return result;
  }
}

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/**
 * Escolhe a menor versão que cabe o payload e devolve os codewords finais,
 * já com a correção de erro aplicada e entrelaçada.
 */
function buildCodewords(bytes, version, ecl) {
  const capacityBits = dataCodewords(version, ecl) * 8;
  const buffer = new BitBuffer();

  buffer.append(0b0100, 4); // modo byte
  buffer.append(bytes.length, version <= 9 ? 8 : 16); // indicador de comprimento
  for (const b of bytes) buffer.append(b, 8);

  if (buffer.length > capacityBits) return null; // não cabe nesta versão

  buffer.append(0, Math.min(4, capacityBits - buffer.length)); // terminador
  buffer.append(0, (8 - (buffer.length % 8)) % 8); // alinhar em bytes

  // Bytes de preenchimento alternados 0xEC / 0x11.
  for (let pad = 0xec; buffer.length < capacityBits; pad ^= 0xec ^ 0x11) buffer.append(pad, 8);

  const data = new Uint8Array(buffer.length / 8);
  buffer.bits.forEach((bit, i) => {
    data[i >>> 3] |= bit << (7 - (i & 7));
  });

  return interleave(data, version, ecl);
}

/** Divide em blocos, calcula o ECC de cada um e entrelaça tudo. */
function interleave(data, version, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
  const eccLen = ECC_CODEWORDS_PER_BLOCK[ecl][version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  const rs = new ReedSolomon(eccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    blocks.push({ dat, ecc: rs.remainder(dat) });
  }

  const result = new Uint8Array(rawCodewords);
  let pos = 0;
  for (let i = 0; i < shortBlockLen - eccLen + 1; i++) {
    for (let b = 0; b < numBlocks; b++) {
      // O byte "extra" dos blocos longos é o último dos de dados.
      if (i < blocks[b].dat.length) result[pos++] = blocks[b].dat[i];
    }
  }
  for (let i = 0; i < eccLen; i++) {
    for (let b = 0; b < numBlocks; b++) result[pos++] = blocks[b].ecc[i];
  }
  return result;
}

// --- Matriz -----------------------------------------------------------------

class QrMatrix {
  constructor(version, ecl) {
    this.version = version;
    this.ecl = ecl;
    this.size = size(version);
    this.modules = Array.from({ length: this.size }, () => new Uint8Array(this.size));
    this.reserved = Array.from({ length: this.size }, () => new Uint8Array(this.size));
  }

  get(x, y) {
    return this.modules[y][x] === 1;
  }

  set(x, y, dark, reserve) {
    this.modules[y][x] = dark ? 1 : 0;
    if (reserve) this.reserved[y][x] = 1;
  }

  isReserved(x, y) {
    return this.reserved[y][x] === 1;
  }

  drawFunctionPatterns() {
    // Temporizadores (timing patterns).
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0, true);
      this.set(i, 6, i % 2 === 0, true);
    }

    // Finder patterns nos três cantos + separadores.
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    // Módulo sempre escuro.
    this.set(8, this.size - 8, true, true);

    // Padrões de alinhamento.
    const align = alignmentPositions(this.version);
    for (let i = 0; i < align.length; i++) {
      for (let j = 0; j < align.length; j++) {
        // Os três cantos já têm finder pattern.
        const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0);
        if (!corner) this.drawAlignment(align[i], align[j]);
      }
    }

    // Reserva das áreas de formato (preenchidas depois, ao escolher a máscara).
    this.drawFormatBits(0);
    this.drawVersionBits();
  }

  drawFinder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.set(x, y, dist !== 2 && dist !== 4, true);
      }
    }
  }

  drawAlignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
      }
    }
  }

  drawFormatBits(mask) {
    const data = (ECL_FORMAT_BITS[this.ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    const bit = (i) => ((bits >>> i) & 1) === 1;

    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i), true);
    this.set(8, 7, bit(6), true);
    this.set(8, 8, bit(7), true);
    this.set(7, 8, bit(8), true);
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i), true);

    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(i), true);
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(i), true);
    this.set(8, this.size - 8, true, true); // módulo escuro
  }

  drawVersionBits() {
    if (this.version < 7) return;

    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark, true);
      this.set(b, a, dark, true);
    }
  }

  drawCodewords(data) {
    let i = 0; // índice no fluxo de bits
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // a coluna 6 é o temporizador vertical

      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;

          if (this.isReserved(x, y) || i >= data.length * 8) continue;

          this.modules[y][x] = (data[i >>> 3] >>> (7 - (i & 7))) & 1;
          i++;
        }
      }
    }
  }

  applyMask(mask) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isReserved(x, y)) continue;

        // A norma define as máscaras em termos de (linha, coluna) = (y, x).
        // Cuidado com a 4: é a única assimétrica (divide a linha por 2 e a
        // coluna por 3). Trocar x e y dá um QR que parece certo e não é
        // legível — foi o que o teste cruzado com o ZXing apanhou.
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new Error('máscara desconhecida: ' + mask);
        }
        if (invert) this.modules[y][x] ^= 1;
      }
    }
  }

  /** Penalização da máscara — quanto mais baixa, melhor (ISO/IEC 18004 §8.8.2). */
  penaltyScore() {
    let result = 0;
    const n = this.size;

    // N1 e N3: horizontal e vertical, cinco ou mais módulos iguais seguidos.
    for (let dir = 0; dir < 2; dir++) {
      for (let i = 0; i < n; i++) {
        let runColor = false;
        let runX = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let j = 0; j < n; j++) {
          const dark = dir === 0 ? this.get(j, i) : this.get(i, j);
          if (dark === runColor) {
            runX++;
            if (runX === 5) result += PENALTY_N1;
            else if (runX > 5) result++;
          } else {
            this.finderPenaltyAddHistory(runX, history, n);
            if (!runColor) result += this.finderPenaltyCountPatterns(history) * PENALTY_N3;
            runColor = dark;
            runX = 1;
          }
        }
        result += this.finderPenaltyTerminate(runColor, runX, history, n) * PENALTY_N3;
      }
    }

    // N2: blocos 2x2 da mesma cor.
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = this.get(x, y);
        if (c === this.get(x + 1, y) && c === this.get(x, y + 1) && c === this.get(x + 1, y + 1)) {
          result += PENALTY_N2;
        }
      }
    }

    // N4: desvio da proporção de módulos escuros em relação a 50%.
    let dark = 0;
    for (const row of this.modules) for (const m of row) dark += m;
    const total = n * n;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  finderPenaltyAddHistory(runX, history, n) {
    if (history[0] === 0) runX += n; // o padrão pode atravessar a borda
    history.pop();
    history.unshift(runX);
  }

  finderPenaltyTerminate(currentRunColor, runX, history, n) {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(runX, history, n);
      runX = 0;
    }
    runX += n;
    this.finderPenaltyAddHistory(runX, history, n);
    return this.finderPenaltyCountPatterns(history);
  }

  finderPenaltyCountPatterns(history) {
    const n = history[1];
    const core =
      n > 0 &&
      history[2] === n &&
      history[3] === n * 3 &&
      history[4] === n &&
      history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  }
}

/**
 * Gera a matriz de um QR code.
 *
 * @param {string} text  conteúdo (UTF-8, modo byte)
 * @param {{ecl?: 'L'|'M'|'Q'|'H', minVersion?: number, maxVersion?: number, mask?: number}} [options]
 * @returns {{size: number, version: number, mask: number, modules: Uint8Array[]}}
 */
export function encode(text, options = {}) {
  const ecl = ECL[options.ecl ?? 'M'];
  if (ecl === undefined) throw new Error("Nível de correção desconhecido: " + options.ecl);

  const bytes = toUtf8Bytes(text);
  const minVersion = options.minVersion ?? 1;
  const maxVersion = options.maxVersion ?? 40;

  let version = 0;
  let codewords = null;
  for (let v = minVersion; v <= maxVersion; v++) {
    codewords = buildCodewords(bytes, v, ecl);
    if (codewords) {
      version = v;
      break;
    }
  }
  if (!codewords) {
    throw new Error(
      `Conteúdo demasiado longo: ${bytes.length} bytes não cabem num QR code (ECC ${options.ecl ?? 'M'}).`,
    );
  }

  const qr = new QrMatrix(version, ecl);
  qr.drawFunctionPatterns();
  qr.drawCodewords(codewords);

  // Escolhe a máscara com menor penalização. Forçar uma máscara só serve para
  // depurar contra outra implementação — nunca em produção.
  let bestMask = options.mask ?? 0;
  if (options.mask === undefined) {
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      qr.applyMask(mask);
      qr.drawFormatBits(mask);
      const score = qr.penaltyScore();
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
      }
      qr.applyMask(mask); // desfazer
    }
  }

  qr.applyMask(bestMask);
  qr.drawFormatBits(bestMask);

  /*
   * O `ecl` volta com o resto, e não é um detalhe. O FrameQR precisa dele para
   * saber quanto da área pode apagar com segurança, e sem esta propriedade
   * `aplicarFrame` assumia o nível M para todos — e um QR com 30% de correcção
   * era limitado como se fosse de 15%.
   */
  return { size: qr.size, version, ecl, mask: bestMask, modules: qr.modules };
}

/** Capacidade máxima em modo byte, por nível de correção. */
export const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };

/**
 * Desenha num canvas, com a zona silenciosa de 4 módulos que a norma exige.
 *
 * Aceita uma matriz já feita em `options.qr`, e é o que permite ao FrameQR
 * desenhar o código com a zona do logótipo já apagada. Sem isso, esta função
 * voltava a codificar o texto e a zone apagada desaparecia — e o pior era
 * isso não dar erro nenhum: saía um QR normal que lia o texto certo e não
 * tinha logótipo nenhum.
 */
export function draw(canvas, text, options = {}) {
  const { scale = 8, border = 4, dark = '#000000', light = '#ffffff', ecl = 'M' } = options;
  const qr = options.qr ?? encode(text, { ecl });

  const context = canvas.getContext('2d', { willReadFrequently: false });
  const pixels = (qr.size + border * 2) * scale;

  canvas.width = pixels;
  canvas.height = pixels;

  context.fillStyle = light;
  context.fillRect(0, 0, pixels, pixels);
  context.fillStyle = dark;

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        context.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
      }
    }
  }

  return qr;
}

/**
 * SVG do QR — escala sem perda e ficheiro minúsculo.
 *
 * Aceita uma matriz já feita em `options.qr`, pelo mesmo motivo que `draw`.
 */
export function toSvg(text, options = {}) {
  const { border = 4, dark = '#000000', light = '#ffffff', ecl = 'M' } = options;
  const qr = options.qr ?? encode(text, { ecl });
  const dimension = qr.size + border * 2;

  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }

  /*
   * O logótipo, nas mesmas coordenadas de módulo que a matriz.
   *
   * O SVG tem o seu próprio sistema: **um módulo é uma unidade**, e o
   * `viewBox` é o que dá a escala. Por isso o logotipo é aqui um `<image>` com
   * as medidas em módulos — e não em píxeis, que seriam o tamanho do ecrã e não
   * o do código. Passar a escala aqui é o que garante que o SVG e o PNG têm o
   * logotipo no mesmo sítio; a escala em píxeis vive em `options.escala`.
   *
   * Sem isto o PNG saía com o logótipo e o SVG com o buraco: dois ficheiros
   * com o mesmo nome e conteúdos diferentes, sem nenhum aviso. Já aconteceu.
   */
  let logotipo = '';
  const { escala = 1, logotipo: imagem } = options;

  /*
   * **A zona vem de `qr.zona`, e nao de `options.zona`.**
   *
   * A versão anterior fazia `const { zona, ... } = options`, e `options` nunca
   * teve `zona` — a zona apagada vive dentro de `qr`, que é `options.qr` ou o
   * resultado de `encode`. **`imagem && zona` era sempre falso**, e o SVG saía
   * sem logótipo nenhum: um ficheiro com o nome certo e o conteúdo diferente
   * do PNG, que é exactamente o bug que o comentário logo acima descreve como
   * "já aconteceu".
   *
   * **Não há sintoma nenhum disto**: um SVG sem `<image>` é um SVG válido, o
   * botão de exportar funciona, o ficheiro abre, e o QR lê-se na mesma porque
   * o logótipo é que falta — e o logótipo é uma imagem, não parte do código.
   * Quem vai receber o ficheiro é que vê, e o sintoma é "o logo desapareceu",
   * que ninguém reporta como bug do gerador.
   */
  const zona = qr.zona;

  if (imagem && zona) {
    /*
     * **O `viewBox` conta módulos, e as coordenadas também. A escala não entra.**
     *
     * A versão anterior dividia por `escala`, o que punha o logótipo a 1/9 do
     * sítio e o mandava para o canto: com `escala: 9` e uma zona de 7 módulos,
     * o logótipo saía em `x = 2.78` em vez de `25`, a vinte e cinco módulos do
     * centro — que é quase o canto da zona apagada.
     *
     * **E não há sintoma nenhum**, porque a imagem fica *dentro* do `viewBox` e
     * o SVG continua válido. O QR lê-se — a zona apagada é a mesma, e a imagem
     * só tapa o canto do buraco. O sintoma é "o logotipo saiu torto", que é
     * o mesmo que o bug do `offset` no canvas e pela mesma razão: **duas
     * grelhas com origens diferentes**, aqui o `viewBox` em módulos e o
     * `drawImage` em píxeis.
     *
     * `escala` fica na assinatura porque é o que o `app.js` passa e porque dá
     * para o usar quando o SVG for gerado em píxeis — mas o valor não entra
     * nesta conta, e por isso não é lido.
     */
    const lado = zona.fim - zona.inicio;

    const larguraImagem = imagem.naturalWidth / imagem.naturalHeight;
    let largura;
    let altura;

    // Entra pelo lado mais comprido, como no canvas: esticar deformava.
    if (imagem.naturalWidth >= imagem.naturalHeight) {
      largura = lado;
      altura = lado / larguraImagem;
    } else {
      altura = lado;
      largura = lado * larguraImagem;
    }

    /*
     * **Mais a margem, e é o que faz o logotipo sair centrado.** A zona é dada
     * em coordenadas do código, e o `viewBox` conta a partir da margem. A
     * primeira versão não somava a margem e o logotipo ficava `border` módulos
     * ao canto — o mesmo bug do canvas, nas mesmas coordenadas, e pela mesma
     * razão: duas grelhas com origens diferentes.
     */
    const x0 = zona.inicio + border + (lado - largura) / 2;
    const y0 = zona.inicio + border + (lado - altura) / 2;

    logotipo =
      `<image x="${x0.toFixed(4)}" y="${y0.toFixed(4)}" ` +
      `width="${largura.toFixed(4)}" height="${altura.toFixed(4)}" ` +
      `href="${imagem.src}" preserveAspectRatio="none"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" ` +
    `shape-rendering="crispEdges"><rect width="${dimension}" height="${dimension}" fill="${light}"/>` +
    `<path d="${parts.join('')}" fill="${dark}"/>` +
    logotipo +
    `</svg>`
  );
}
