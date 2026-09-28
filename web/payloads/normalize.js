/**
 * Normalização de telefone e de URL, partilhada por várias categorias.
 *
 * Espelha `csharp/core/Normalize.cs`.
 */

import { digitsOnly, toAscii } from './text.js';

const SCHEME_AT_START = /^([A-Za-z][A-Za-z0-9+.-]*):/;

const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel', 'sms', 'geo', 'wifi'];
const DANGEROUS_SCHEMES = ['javascript', 'data', 'file', 'vbscript', 'about', 'blob'];

/**
 * Normaliza o indicativo de país: `00` ou `351` → `+351`.
 *
 * Antes só era convertido quando o `00` estivesse exatamente no início da
 * string, o que fazia o mesmo número dar resultados diferentes conforme a
 * maneira como era colado.
 */
export function phonePrefix(raw) {
  let p = toAscii(raw).trim();
  if (p.length === 0) return '';

  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (!p.startsWith('+')) p = '+' + p;

  // Só podem sobrar dígitos depois do '+'.
  const afterPlus = p.slice(p.indexOf('+') + 1);
  const onlyDigits = afterPlus.replace(/\D/g, '');
  if (onlyDigits.length === 0) return '';

  return p.includes('+') ? '+' + onlyDigits : onlyDigits;
}

/** Número de telefone só com dígitos, já com o indicativo. */
export function phone(prefix, number) {
  return phonePrefix(prefix) + digitsOnly(number);
}

/**
 * Acrescenta o esquema em falta e recusa esquemas que possam executar código
 * no leitor.
 *
 * @returns {{url: string|null, error: string|null}}
 */
export function normalizeUrl(raw) {
  const url = String(raw ?? '').trim();

  if (url.length === 0) {
    return { url: null, error: 'Indica um link.' };
  }

  const match = SCHEME_AT_START.exec(url);
  if (!match) return { url: 'https://' + url, error: null };

  const scheme = match[1].toLowerCase();

  if (DANGEROUS_SCHEMES.includes(scheme)) {
    return { url: null, error: `O esquema '${scheme}:' não é permitido num QR code.` };
  }

  if (!ALLOWED_SCHEMES.includes(scheme)) {
    return {
      url: null,
      error: `Esquema '${scheme}:' não suportado. Usa ${ALLOWED_SCHEMES.map((s) => s + ':').join(', ')}.`,
    };
  }

  return { url, error: null };
}
