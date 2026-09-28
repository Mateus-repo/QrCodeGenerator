/**
 * PIX / BR Code (EMV-QRCPS-MPM).
 *
 * Espelha `csharp/core/Pix/` e `python/qrcode_core/pix.py`. Os três têm de
 * produzir exatamente a mesma string para os mesmos campos — é isso que os
 * vetores de `spec/vectors.json` verificam.
 *
 * Referência: Banco Central do Brasil, "Manual de Padrões para Iniciação do Pix".
 */

import { clean, digitsOnly, toAscii } from './text.js';

export const GUI = 'br.gov.bcb.pix';
export const PLACEHOLDER_TXID = '***';
export const MAX_NAME = 25;
export const MAX_CITY = 15;
export const MAX_TXID = 25;
export const MAX_POSTCODE = 9;
export const MAX_TEMPLATE_26 = 99;

const CRC_TAG = '6304';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const PHONE_CHARS_RE = /^[\d\s.\-/]+$/;
const THOUSANDS_RE = /\.\d{3}(?!\d)/;

export class PixException extends Error {}

// --- CRC-16/CCITT-FALSE ----------------------------------------------------

/**
 * Polinómio 0x1021, valor inicial 0xFFFF, sem reflexão e sem XOR final.
 *
 * O detalhe que derruba a maioria das implementações é a ordem: concatena-se
 * "6304" ao fim da string <em>antes</em> de calcular.
 *
 * @param {string} data
 * @returns {number} 0..65535
 */
export function crc16(data) {
  let crc = 0xffff;
  const bytes = latin1Bytes(data);

  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc;
}

/** CRC em 4 caracteres hexadecimais maiúsculos. */
export function crc16Hex(data) {
  return crc16(data).toString(16).toUpperCase().padStart(4, '0');
}

/** UTF-8 em bytes, que é o que o CRC do BCB calcula. */
function latin1Bytes(data) {
  const encoded = new TextEncoder().encode(data);
  return Array.from(encoded, (b) => b & 0xff);
}

// --- TLV -------------------------------------------------------------------

/** `ID(2) + comprimento(2, com zeros) + valor`. */
export function tlv(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}

/**
 * Lê uma sequência TLV validando cada comprimento declarado.
 * Lança <code>PixException</code> se algo não bater certo.
 */
export function parseTlv(data) {
  const fields = [];
  let i = 0;

  while (i < data.length) {
    if (i + 4 > data.length) throw new PixException('Payload truncado (TLV incompleto).');

    const id = data.slice(i, i + 2);
    if (!/^\d\d$/.test(id)) throw new PixException(`Tag inválida: '${id}'.`);

    const rawLength = data.slice(i + 2, i + 4);
    if (!/^\d\d$/.test(rawLength)) {
      throw new PixException(`Campo ${id} tem comprimento inválido: '${rawLength}'.`);
    }

    const length = Number(rawLength);
    const value = data.slice(i + 4, i + 4 + length);
    if (value.length !== length) {
      throw new PixException(
        `Campo ${id} tem comprimento declarado ${length} mas contém ${value.length} caracteres — payload truncado ou corrompido.`,
      );
    }

    fields.push([id, value]);
    i += 4 + length;
  }

  return fields;
}

/** Lê uma sequência TLV e devolve um objeto indexado pelo identificador. */
export function parseTlvToMap(data) {
  return Object.fromEntries(parseTlv(data));
}

// --- Chave -----------------------------------------------------------------

function isValidCpf(value) {
  if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) return false;

  for (const position of [9, 10]) {
    let total = 0;
    for (let i = 0; i < position; i++) total += Number(value[i]) * (position + 1 - i);
    let check = (total * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(value[position])) return false;
  }

  return true;
}

function isValidCnpj(value) {
  if (value.length !== 14 || /^(\d)\1{13}$/.test(value)) return false;

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  for (const [weights, position] of [
    [firstWeights, 12],
    [secondWeights, 13],
  ]) {
    const total = weights.reduce((sum, w, i) => sum + Number(value[i]) * w, 0);
    const rest = total % 11;
    const check = rest < 2 ? 0 : 11 - rest;
    if (check !== Number(value[position])) return false;
  }

  return true;
}

function isValidPhone(value) {
  if (!value.startsWith('+55')) return false;
  const digits = value.slice(3);
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (digits[0] === '0' || digits[1] === '0') return false;
  return /^\d+$/.test(digits);
}

function isValidEmail(value) {
  if (!value || value.length > 77) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (value.includes(' ')) return false;

  return EMAIL_LOCAL_RE.test(local);
}

/** Limpa a chave introduzida pelo utilizador (máscaras, `+55`, maiúsculas). */
export function normalizeKey(raw) {
  const key = toAscii(raw).trim();

  if (key.length === 0) throw new PixException('Indica a chave PIX.');
  if (key.includes('@')) return key.toLowerCase();

  // Chave aleatória (UUID).
  if (key.includes('-') && /^[A-Za-z0-9-]+$/.test(key.replace(/[ -]/g, ''))) return key.toLowerCase();

  const digits = digitsOnly(key);
  if (digits.length > 0) {
    // Telefone: o padrão exige o indicativo +55, mas aceitamos escrever sem o
    // "+" e sem o 55, desde que sobrem 10 ou 11 dígitos.
    let candidate = null;
    if (digits.length === 13 && digits.startsWith('55')) candidate = '+55' + digits.slice(2);
    else if (key.startsWith('+55') && (digits.length === 12 || digits.length === 13)) {
      candidate = '+55' + digits.slice(2);
    } else if (key.startsWith('+') && [12, 13, 14].includes(digits.length)) {
      candidate = '+' + digits;
    }

    if (candidate !== null && isValidPhone(candidate)) return candidate;

    // CPF (11) / CNPJ (14), com ou sem máscara.
    if ((digits.length === 11 || digits.length === 14) && PHONE_CHARS_RE.test(key)) return digits;
  }

  return key;
}

/** Valida a chave e devolve-a normalizada. Lança <code>PixException</code>.</summary> */
export function validateKey(raw) {
  const key = normalizeKey(raw);

  if (/^\d+$/.test(key)) {
    if (key.length === 11 && isValidCpf(key)) return key;
    if (key.length === 14 && isValidCnpj(key)) return key;
    throw new PixException(
      'CPF/CNPJ inválido (os dígitos verificadores não conferem). ' +
        'Se esta chave for um telefone, escreve com o indicativo +55.',
    );
  }

  if (key.startsWith('+')) {
    if (isValidPhone(key)) return key;
    throw new PixException('Telefone inválido. Usa o formato +55 seguido de DDD e número.');
  }

  if (key.includes('@')) {
    if (isValidEmail(key)) return key;
    throw new PixException('Email inválido como chave PIX.');
  }

  if (UUID_RE.test(key)) return key;

  throw new PixException(
    'Chave PIX inválida. Use CPF, CNPJ, telefone com +55, email ou chave aleatória (UUID).',
  );
}

/** Tipo da chave, depois de validada: cpf | cnpj | phone | email | random. */
export function keyType(raw) {
  const key = validateKey(raw);
  if (/^\d+$/.test(key)) return key.length === 11 ? 'cpf' : 'cnpj';
  if (key.startsWith('+')) return 'phone';
  if (key.includes('@')) return 'email';
  return 'random';
}

// --- Valor -----------------------------------------------------------------

/**
 * Aceita `25,75` (pt-BR) e `25.75`. O ponto só é separador de milhar quando
 * seguido de exatamente 3 dígitos e não no fim do valor.
 *
 * @returns {number|null}
 */
export function parseAmount(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (raw < 0) throw new PixException('O valor não pode ser negativo.');
    return Math.round(raw * 100) / 100;
  }

  let text = toAscii(String(raw)).trim().replace(/R\$/i, '').replace(/ /g, '');
  if (text.length === 0) return null;

  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (THOUSANDS_RE.test(text)) text = text.replace(/\./g, '');

  if (!/^\d*\.?\d*$/.test(text) || text === '.' || text === '') {
    throw new PixException(`Valor inválido: '${raw}'.`);
  }

  const value = Number(text);
  if (Number.isNaN(value)) throw new PixException(`Valor inválido: '${raw}'.`);
  if (value < 0) throw new PixException('O valor não pode ser negativo.');

  return Math.round(value * 100) / 100;
}

function formatAmount(value) {
  return value.toFixed(2);
}

function cleanTxid(raw) {
  const txid = toAscii(raw).replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_TXID);
  return txid.length === 0 ? PLACEHOLDER_TXID : txid;
}

/**
 * Monta o template 26, truncando a descrição para respeitar o teto de 99
 * caracteres. A chave nunca é cortada.
 */
function merchantAccountTemplate(key, description) {
  const template = tlv('00', GUI) + tlv('01', key);
  if (!description || !description.trim()) return template;

  const room = MAX_TEMPLATE_26 - template.length - 4; // -4 = tag+length de "02"
  if (room <= 0) return template;

  const text = clean(description, room);
  return text.length === 0 ? template : template + tlv('02', text);
}

// --- Geração ---------------------------------------------------------------

/**
 * Gera a string BR Code (PIX copia e cola).
 *
 * @param {{key: string, name: string, city: string, amount?: string|number|null,
 *          txid?: string, description?: string, postcode?: string, singleUse?: boolean}} payload
 * @returns {string}
 */
export function build(payload) {
  const key = validateKey(payload.key);

  const name = clean(payload.name, MAX_NAME);
  if (name.length === 0) {
    throw new PixException(`Indica o nome do recebedor (max. ${MAX_NAME} caracteres).`);
  }

  const city = clean(payload.city, MAX_CITY);
  if (city.length === 0) {
    throw new PixException(`Indica a cidade do recebedor (max. ${MAX_CITY} caracteres).`);
  }

  let postcode = digitsOnly(payload.postcode).slice(0, MAX_POSTCODE);

  const fields = [['00', '01']];
  if (payload.singleUse) fields.push(['01', '12']);

  fields.push(['26', merchantAccountTemplate(key, payload.description)]);
  fields.push(['52', '0000']);
  fields.push(['53', '986']);

  const amount = parseAmount(payload.amount);
  if (amount !== null) fields.push(['54', formatAmount(amount)]);

  fields.push(['58', 'BR'], ['59', name], ['60', city]);
  if (postcode.length > 0) fields.push(['61', postcode]);
  fields.push(['62', tlv('05', cleanTxid(payload.txid))]);

  const body = fields.map(([id, value]) => tlv(id, value)).join('') + CRC_TAG;
  return body + crc16Hex(body);
}

// --- Leitura ---------------------------------------------------------------

/**
 * Remove quebras de linha e tabulações — <em>nunca</em> os espaços.
 *
 * Um `replace(/\s/g, "")` genérico destrói o espaço dentro de "Fulano de Tal" e
 * desalinha todos os comprimentos declarados a partir dali, produzindo um
 * payload que parece válido e é recusado pelo banco.
 */
function stripWrapping(brcode) {
  return toAscii(brcode, { collapse: false })
    .replace(/[\r\n\t]/g, '')
    .trim();
}

/**
 * Lê um BR Code. Com CRC inválido não lança: devolve <code>crcValid: false</code>.
 *
 * @returns {{payload: object, crcValid: boolean, raw: string,
 *            pointOfInitiation: string|null, url: string|null}}
 */
export function parse(brcode) {
  const cleaned = stripWrapping(brcode);

  if (!cleaned.startsWith('0002')) {
    throw new PixException('Isto não parece um PIX copia e cola (falta o campo 00).');
  }

  const fields = parseTlv(cleaned);
  const get = (id) => fields.find(([f]) => f === id)?.[1] ?? null;

  const crcValue = get('63');
  if (crcValue === null) throw new PixException('O payload não tem o campo 63 (CRC16).');

  const body = cleaned.slice(0, cleaned.lastIndexOf(CRC_TAG) + CRC_TAG.length);
  const crcValid = crcValue === crc16Hex(body);

  const raw26 = get('26');
  if (raw26 === null) {
    throw new PixException('O payload não tem o campo 26 (informação da conta).');
  }

  const template26 = parseTlvToMap(raw26);
  if (template26['00'] !== GUI) {
    throw new PixException(`GUI inválido: '${template26['00'] ?? ''}' (esperado ${GUI}).`);
  }

  const template62 = get('62') ? parseTlvToMap(get('62')) : {};
  const txid = template62['05'];
  const rawAmount = get('54');

  return {
    payload: {
      key: template26['01'] ?? '',
      name: get('59') ?? '',
      city: get('60') ?? '',
      amount: rawAmount ? Number(rawAmount) : null,
      txid: txid || PLACEHOLDER_TXID,
      description: template26['02'] ?? '',
      postcode: get('61') ?? '',
      singleUse: get('01') === '12',
    },
    crcValid,
    raw: cleaned,
    pointOfInitiation: get('01'),
    url: template26['25'] ?? null,
  };
}

/** Recalcula o CRC de um payload (útil para recuperar códigos colados). */
export function fixCrc(brcode) {
  const cleaned = stripWrapping(brcode);
  const index = cleaned.lastIndexOf(CRC_TAG);
  if (index < 0) throw new PixException('O payload não tem o campo 63 (CRC16).');

  const body = cleaned.slice(0, index + CRC_TAG.length);
  return body + crc16Hex(body);
}
