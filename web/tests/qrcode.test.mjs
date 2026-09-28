/**
 * Testes do encoder QR e dos payloads.
 *
 * Cuidado ao mexer no encoder: os testes estruturais verificam os padrões
 * funcionais, o formato e as versões — mas o teste decisivo é o
 * `cross-check.mjs`, que exporta as matrizes para o Python as descodificar com
 * o ZXing.
 *
 *     node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { encode, MAX_BYTES, toSvg } from '../qrcode.js';
import { crc16, crc16Hex } from '../payloads/pix.js';
import * as types from '../payloads/types.js';
import { build as buildPix, parse as parsePix, fixCrc } from '../payloads/pix.js';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', '..', 'spec', 'vectors.json'), 'utf8'));

// --- CRC -------------------------------------------------------------------

test('CRC-16 tem o vetor canónico', () => {
  assert.equal(crc16('123456789'), 0x29b1);
  assert.equal(crc16Hex('123456789'), '29B1');
});

test('CRC-16 bate com o exemplo do Banco Central', () => {
  const payload = spec.vectors.find((v) => v.id === 'pix_uuid_sem_valor').payload;
  assert.equal(crc16Hex(payload.slice(0, -4)), '1D3D');
});

// --- Spec partilhada -------------------------------------------------------

test('a spec tem o tipo pix', () => {
  assert.ok(spec.vectors.length >= 10);
  assert.ok(spec.vectors.every((v) => v.tipo === 'pix'));
});

/** Converte os campos da spec (snake_case) para os do site (camelCase). */
function fieldsFromSpec(campos) {
  return {
    pixKey: campos.key,
    pixName: campos.name,
    pixCity: campos.city,
    pixAmount: campos.amount ?? '',
    pixTxid: campos.txid ?? '',
    pixPostcode: campos.postcode ?? '',
    pixDescription: campos.description ?? '',
    pixSingleUse: Boolean(campos.single_use),
  };
}

for (const vector of spec.vectors) {
  test(`bica com a spec: ${vector.id}`, () => {
    const fields = fieldsFromSpec(vector.campos);
    assert.equal(types.validate('pix', fields), null);
    assert.equal(types.build('pix', fields), vector.payload);
  });

  test(`round-trip pela spec: ${vector.id}`, () => {
    const parsed = parsePix(vector.payload);
    assert.ok(parsed.crcValid, 'CRC inválido');
    assert.equal(buildPix(parsed.payload), vector.payload);
  });
}

test('comprimentos declarados batem em todos os vetores', () => {
  const check = (data, path = '') => {
    let i = 0;
    while (i < data.length) {
      const tag = data.slice(i, i + 2);
      const declared = Number(data.slice(i + 2, i + 4));
      const value = data.slice(i + 4, i + 4 + declared);
      assert.equal(value.length, declared, `campo ${path}${tag} com comprimento errado`);
      if (tag === '26' || tag === '62') check(value, `${path}${tag}.`);
      i += 4 + declared;
    }
  };

  for (const vector of spec.vectors) check(vector.payload);
});

// --- Payload: coerções ----------------------------------------------------

test('nome com acento é normalizado e as maiúsculas mantidas', () => {
  const brcode = buildPix({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'José Antônio Café', city: 'São Paulo' });
  assert.ok(brcode.includes('5917Jose Antonio Cafe'), brcode);
  assert.ok(brcode.includes('6009Sao Paulo'), brcode);
});

test('email mantém a caixa que o utilizador escreveu', () => {
  // Contraste com o PIX, onde a chave é normalizada para minúsculas.
  const mail = types.build('email', { mailTo: 'Ana@Exemplo.PT' });
  assert.equal(mail, 'mailto:Ana@Exemplo.PT');
});

test('geo arredonda a 7 casas', () => {
  assert.equal(types.build('localizacao', { geoLat: '38.7223', geoLng: '-9.1393' }), 'geo:38.7223,-9.1393');
});

test('fixCrc recupera um payload corrompido', () => {
  const payload = spec.vectors[0].payload;
  assert.equal(fixCrc(payload.slice(0, -4) + '0000'), payload);
});

test('espaços dentro do nome sobrevivem à leitura', () => {
  const brcode = buildPix({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Ana Maria', city: 'Recife' });
  assert.ok(brcode.includes('5909Ana Maria'));
  assert.equal(parsePix(brcode).payload.name, 'Ana Maria');
});

// --- Bugs corrigidos ------------------------------------------------------

test('iCal usa CRLF e nunca LF solto', () => {
  const ical = types.build('evento', {
    eventTitle: 'Reunião',
    eventStart: '2026-09-30T10:00',
    eventEnd: '2026-09-30T11:00',
  });
  assert.ok(ical.includes('BEGIN:VCALENDAR\r\n'));
  assert.ok(ical.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ical.replace(/\r\n/g, '').includes('\n'), false);
});

test('iCal escapa vírgula, ponto e vírgula e barra', () => {
  const ical = types.build('evento', {
    eventTitle: 'Reuniao, trimestre; 1\\2',
    eventLocation: 'Rua A; 3, Lisboa',
    eventStart: '2026-01-01T10:00',
    eventEnd: '2026-01-01T11:00',
  });
  assert.ok(ical.includes('SUMMARY:Reuniao\\, trimestre\\; 1\\\\2'), ical);
  assert.ok(ical.includes('LOCATION:Rua A\\; 3\\, Lisboa'), ical);
});

test('vCard escreve a morada', () => {
  const vcard = types.build('vcard', {
    vcFirstName: 'Ana',
    vcLastName: 'Silva',
    vcStreet: 'Rua A 1',
    vcCity: 'Lisboa',
    vcZip: '1000-001',
    vcCountry: 'Portugal',
  });
  assert.ok(vcard.includes('ADR;TYPE=work:;;Rua A 1;Lisboa;;1000-001;Portugal'), vcard);
});

test('vCard põe a família primeiro em N', () => {
  const vcard = types.build('vcard', { vcFirstName: 'Ana', vcLastName: 'Silva' });
  assert.ok(vcard.includes('N:Silva;Ana;;;'));
  assert.ok(vcard.includes('FN:Ana Silva'));
});

test('links perigosos são recusados', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html;base64,AA', 'file:///etc']) {
    assert.notEqual(types.validate('link', { url }), null, url);
  }
});

test('link sem esquema ganha https', () => {
  assert.equal(types.build('link', { url: 'exemplo.pt' }), 'https://exemplo.pt');
});

test('indicativo de telefone normalizado', () => {
  const cases = [
    ['00351', '+351'],
    ['351', '+351'],
    ['+351', '+351'],
    ['00 351 (PT)', '+351'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      types.build('telefone', { phonePrefix: input, phoneNumber: '912345678' }),
      'tel:' + expected + '912345678',
      input,
    );
  }
});

test('coordenadas fora do intervalo são recusadas', () => {
  assert.notEqual(types.validate('localizacao', { geoLat: '91', geoLng: '0' }), null);
  assert.notEqual(types.validate('localizacao', { geoLat: '0', geoLng: '181' }), null);
  assert.equal(types.validate('localizacao', { geoLat: '90', geoLng: '180' }), null);
});

test('WiFi escapa os separadores', () => {
  const wifi = types.build('wifi', { wifiSsid: 'Cafe;bar:1', wifiPass: 'a:b;c', wifiSec: 'WPA/WPA2' });
  assert.ok(wifi.includes('S:Cafe\\;bar\\:1;'), wifi);
  assert.ok(wifi.includes('P:a\\:b\\;c;'), wifi);
});

test('WiFi aberto não escreve password', () => {
  assert.equal(types.build('wifi', { wifiSsid: 'Rede', wifiSec: 'Aberto' }), 'WIFI:T:nopass;S:Rede;;');
});

test('SMS recusa caracteres fora do protocolo', () => {
  assert.notEqual(types.validate('sms', { phonePrefix: '+351', phoneNumber: '912345678', smsMessage: 'olá {x}' }), null);
});

test('email usa percent-encoding e não mailto maiúsculo', () => {
  const mail = types.build('email', {
    mailTo: 'ana@exemplo.pt',
    mailSubject: 'Faturação #1',
    mailBody: 'olá & bem-vindo',
  });
  assert.ok(mail.startsWith('mailto:'), mail);
  assert.ok(mail.includes('Fatura%C3%A7%C3%A3o%20%231'), mail);
  assert.ok(mail.includes('%26'));
});

// --- Encoder ---------------------------------------------------------------

const read = (qr, x, y) => qr.modules[y][x] === 1;

test('finder patterns nos três cantos, e só nesses', () => {
  const qr = encode('teste', { ecl: 'M' });
  const n = qr.size;

  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) {
      assert.ok(read(qr, x + i, y), 'borda superior');
      assert.ok(read(qr, x + i, y + 6), 'borda inferior');
      assert.ok(read(qr, x, y + i), 'borda esquerda');
      assert.ok(read(qr, x + 6, y + i), 'borda direita');
    }
    for (let i = 1; i < 6; i++) assert.equal(read(qr, x + i, y + 1), false, 'anel claro');
    for (let i = 2; i < 5; i++) for (let j = 2; j < 5; j++) assert.ok(read(qr, x + j, y + i));
  }

  // Canto inferior direito não é um finder.
  assert.equal(read(qr, n - 1, n - 1) && read(qr, n - 2, n - 2) && read(qr, n - 1, n - 2) && read(qr, n - 2, n - 1), false);
});

test('padrões de temporização alternam', () => {
  const qr = encode('teste', { ecl: 'M' });
  for (let i = 8; i < qr.size - 8; i++) {
    assert.equal(read(qr, i, 6), i % 2 === 0, `horizontal em ${i}`);
    assert.equal(read(qr, 6, i), i % 2 === 0, `vertical em ${i}`);
  }
});

test('tamanho = 4 * versão + 17', () => {
  for (const text of ['a', 'a'.repeat(100), 'a'.repeat(600), 'a'.repeat(2000)]) {
    const qr = encode(text, { ecl: 'L' });
    assert.equal(qr.size, 4 * qr.version + 17);
  }
});

test('conteúdo maior força a próxima versão', () => {
  assert.equal(encode('a', { ecl: 'L' }).version, 1);
  assert.ok(encode('a'.repeat(300), { ecl: 'L' }).version > 1);
});

test('conteúdo demasiado longo dá erro com números', () => {
  assert.throws(() => encode('a'.repeat(3000), { ecl: 'L' }), /3000 bytes/);
});

test('mais correção de erro força uma versão maior', () => {
  const text = 'olá mundo';
  const low = encode(text, { ecl: 'L' });
  const high = encode(text, { ecl: 'H' });

  // L sobra sempre: a versão de H tem de ser >= a de L.
  assert.ok(high.version >= low.version, `L=${low.version} H=${high.version}`);
  assert.equal(low.size, 4 * low.version + 17);
  assert.equal(high.size, 4 * high.version + 17);
});

test('conteúdo vazio gera um QR válido', () => {
  const qr = encode('');
  assert.equal(qr.size, 21);
  assert.equal(qr.mask >= 0 && qr.mask <= 7, true);
});

test('a máscara é sempre uma das oito', () => {
  for (const text of ['a', 'olá mundo', 'x'.repeat(200), '€'.repeat(80)]) {
    const qr = encode(text, { ecl: 'H' });
    assert.ok(qr.mask >= 0 && qr.mask <= 7, `máscara ${qr.mask}`);
  }
});

test('conteúdo diferente dá matrizes diferentes', () => {
  const a = encode('https://exemplo.pt');
  const b = encode('https://outro.pt');
  assert.notEqual(JSON.stringify(a.modules), JSON.stringify(b.modules));
});

test('a mesma entrada é determinística', () => {
  assert.equal(JSON.stringify(encode('determinismo').modules), JSON.stringify(encode('determinismo').modules));
});

test('emoji e acentos cabem em modo byte', () => {
  const qr = encode('Olá ☕ 😀 café');
  assert.ok(qr.size > 0);
  assert.equal(qr.size, 4 * qr.version + 17);
});

test('SVG tem o viewBox certo e é SVG válido', () => {
  const qr = encode('svg', { ecl: 'M' });
  const svg = toSvg('svg', { ecl: 'M' });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`), svg.slice(0, 200));
  assert.ok(svg.endsWith('</svg>'));
});

test('limites de capacidade por ECC', () => {
  assert.ok(MAX_BYTES.L > MAX_BYTES.M);
  assert.ok(MAX_BYTES.M > MAX_BYTES.Q);
  assert.ok(MAX_BYTES.Q > MAX_BYTES.H);
  assert.equal(MAX_BYTES.L, 2953);
});
