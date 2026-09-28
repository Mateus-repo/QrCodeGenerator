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
 * Converte para ASCII sem acentos, sem caracteres de controlo e sem repetir
 * espaços. `collapse: false` preserva os espaços tal como estão — é o que o
 * leitor de PIX precisa, para não mexer nos comprimentos declarados.
 */
export function toAscii(value, { collapse = true } = {}) {
  if (value === null || value === undefined) return '';
  const ascii = String(value)
    .normalize('NFD')
    .replace(NON_SPACING_MARK, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '');

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
