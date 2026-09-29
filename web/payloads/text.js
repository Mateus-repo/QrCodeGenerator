/**
 * Normalização de texto partilhada por todos os tipos de payload.
 *
 * O comprimento de um payload é contado em caracteres, mas muitos leitores e
 * protocolos contam bytes. Acentos e emojis são a causa número um de payloads
 * que "parecem certos" e são recusados, por isso normalizamos para ASCII
 * sempre que o formato o exigir.
 *
 * Espelha `csharp/core/Text/Text.cs`. Alterar aqui é alterar lá.
 */

const NON_SPACING_MARK = /\p{Mn}/gu;

/**
 * As ligaduras que o NFD **nao** decompoe.
 *
 * **`œ` e' o caso, e `cœur` dava `cur`.** Ao contrario do `ç`, que vem `c` mais
 * cedilha e o NFD separa, o `œ` e' um caracter unico — o *modifier letter
 * small oe* — e o `NON_SPACING_MARK` nao o apanha. A remocao dos nao-ASCII de
 * seguida apaga-o, e `cœur` ficava `cur`.
 *
 * O mesmo em `manœuvre`, que dava `manuvre`, e em `Œuvre`, que dava `uvre`. **Um
 * nome com ligadura e' courant em frances e esta em Portugal**, e um QR que le
 * `cur` mostra o nome errado na etiqueta — e o nome errado e' o que a pessoa vai
 * ler no documento.
 *
 * **A troca e' antes da remocao**, e a ordem e' o que faz funcionar: trocar
 * depois seria tarde, porque o caracter ja nao estaria la. E nao se usa
 * `NFKD`, que resolveria tambem mas decompoe o que nao se quer — o `№` viraria
 * `No`.
 */
const LIGADURAS = {
  'œ': 'oe',
  'Œ': 'OE',
  'æ': 'ae',
  'Æ': 'AE',
  'ĳ': 'ij',
  'Ĳ': 'IJ',
  'ǳ': 'dz',
  'ǲ': 'Dz',
  'Ǳ': 'DZ',
  'ǉ': 'lj',
  'ǈ': 'Lj',
  'Ǌ': 'LJ',
  'ǌ': 'nj',
  'ǋ': 'Nj',
  'ſ': 's',
};

/**
 * Converte para ASCII sem acentos, sem caracteres de controlo e sem repetir
 * espaços. `collapse: false` preserva os espaços tal como estão — é o que o
 * leitor de PIX precisa, para não mexer nos comprimentos declarados.
 */
export function toAscii(value, { collapse = true } = {}) {
  if (value === null || value === undefined) return '';
  let ascii = String(value).normalize('NFD').replace(NON_SPACING_MARK, '');

  /*
   * **As ligaduras ANTES da remocao dos nao-ASCII**, e a ordem e' o que faz
   * funcionar. Trocar depois seria tarde, porque o caracter ja nao estaria la.
   */
  for (const [ligadura, letras] of Object.entries(LIGADURAS)) {
    ascii = ascii.split(ligadura).join(letras);
  }

  // eslint-disable-next-line no-control-regex
  ascii = ascii.replace(/[^\x00-\x7F]/g, '');

  return collapse ? ascii.trim().replace(/\s+/g, ' ') : ascii;
}

/** Normaliza, colapsa espaços e corta ao limite indicado. */
export function clean(value, maxLength) {
  const ascii = toAscii(value);
  return ascii.length <= maxLength ? ascii : ascii.slice(0, maxLength).trim();
}

/** Escapa texto de iCalendar / vCard: `\`, `;`, `,` e quebras de linha. */
export function escapeICal(value) {
  if (!value) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Escapa um valor WiFi: `\`, `;`, `,`, `:`, `"`. */
export function escapeWifi(value) {
  if (!value) return '';
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

/** Percent-encoding para query strings. `encodeURIComponent` dá %20, nunca `+`. */
export function urlEncode(value) {
  if (!value) return '';
  return encodeURIComponent(String(value));
}

/** Só dígitos. */
export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Número com ponto decimal, independente da locale do browser. */
export function invariant(value) {
  return String(value);
}
