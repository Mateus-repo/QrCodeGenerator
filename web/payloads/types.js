/**
 * Payload e validação de cada categoria.
 *
 * Espelha `csharp/core/QrPayloadBuilder.cs` e `QrValidator.cs`. O formato de
 * cada tipo está descrito em `docs/TIPOS-QR.md`; se as três stacks
 * divergirem, é bug.
 */

import { clean, digitsOnly, escapeICal, escapeWifi, invariant, toAscii, urlEncode } from './text.js';
import { normalizeUrl, phone, phonePrefix } from './normalize.js';
import { build as buildPix, parseAmount as parsePixAmount, PLACEHOLDER_TXID } from './pix.js';

/** Níveis de correção de erro, por ordem de capacidade decrescente. */
export const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

/** iCalendar exige CRLF (RFC 5545), independentemente do sistema. */
export const ICAL_NEWLINE = '\r\n';

/**
 * Categorias, na ordem da interface. `fields` descreve o formulário — é o que
 * permite ao site desenhar a UI sem repetir a lista à mão.
 */
export const CATEGORIES = [
  {
    id: 'link',
    label: 'Link',
    fields: [{ key: 'url', label: 'Link', type: 'url', placeholder: 'exemplo.pt' }],
  },
  {
    id: 'texto',
    label: 'Texto',
    fields: [{ key: 'texto', label: 'Texto', type: 'textarea' }],
  },
  {
    id: 'email',
    label: 'Email',
    fields: [
      { key: 'mailTo', label: 'Destinatário', type: 'email', placeholder: 'ana@exemplo.pt' },
      { key: 'mailSubject', label: 'Assunto' },
      { key: 'mailBody', label: 'Mensagem', type: 'textarea' },
    ],
  },
  {
    id: 'telefone',
    label: 'Telefone',
    fields: [
      { key: 'phonePrefix', label: 'País (indicativo)', placeholder: '+351' },
      { key: 'phoneNumber', label: 'Número', type: 'tel' },
    ],
  },
  {
    id: 'sms',
    label: 'SMS',
    fields: [
      { key: 'phonePrefix', label: 'País (indicativo)', placeholder: '+351' },
      { key: 'phoneNumber', label: 'Número', type: 'tel' },
      { key: 'smsMessage', label: 'Mensagem', type: 'textarea' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    fields: [
      { key: 'phonePrefix', label: 'País (indicativo)', placeholder: '+351' },
      { key: 'phoneNumber', label: 'Número', type: 'tel' },
      { key: 'waMessage', label: 'Mensagem', type: 'textarea' },
    ],
  },
  {
    id: 'evento',
    label: 'Evento',
    fields: [
      { key: 'eventTitle', label: 'Título' },
      { key: 'eventStart', label: 'Data início', type: 'datetime-local' },
      { key: 'eventEnd', label: 'Data fim', type: 'datetime-local' },
      { key: 'eventLocation', label: 'Local' },
      { key: 'eventDescription', label: 'Descrição', type: 'textarea' },
    ],
  },
  {
    id: 'localizacao',
    label: 'Localização',
    fields: [
      { key: 'geoLat', label: 'Latitude', placeholder: '38.7223' },
      { key: 'geoLng', label: 'Longitude', placeholder: '-9.1393' },
    ],
  },
  {
    id: 'wifi',
    label: 'WiFi',
    fields: [
      { key: 'wifiSsid', label: 'Rede (SSID)' },
      { key: 'wifiPass', label: 'Password', type: 'password' },
      {
        key: 'wifiSec',
        label: 'Segurança',
        type: 'select',
        options: ['WPA/WPA2', 'WEP', 'Aberto'],
      },
      { key: 'wifiHidden', label: 'Rede oculta', type: 'checkbox' },
    ],
  },
  {
    id: 'vcard',
    label: 'VCard',
    fields: [
      { key: 'vcFirstName', label: 'Nome' },
      { key: 'vcLastName', label: 'Apelido' },
      { key: 'vcPhone', label: 'Telefone', type: 'tel' },
      { key: 'vcPhone2', label: 'Telefone 2', type: 'tel' },
      { key: 'vcEmail', label: 'Email', type: 'email' },
      { key: 'vcOrg', label: 'Organização' },
      { key: 'vcRole', label: 'Cargo' },
      { key: 'vcStreet', label: 'Rua' },
      { key: 'vcCity', label: 'Cidade' },
      { key: 'vcZip', label: 'Código postal' },
      { key: 'vcCountry', label: 'País' },
    ],
  },
  {
    id: 'pix',
    label: 'PIX',
    fields: [
      { key: 'pixKey', label: 'Chave PIX', placeholder: 'CPF, CNPJ, +55, email ou UUID' },
      { key: 'pixName', label: 'Nome do recebedor' },
      { key: 'pixCity', label: 'Cidade' },
      { key: 'pixAmount', label: 'Valor (opcional)', placeholder: '25,75' },
      { key: 'pixTxid', label: 'Txid (opcional)' },
      { key: 'pixPostcode', label: 'CEP (opcional)' },
      { key: 'pixDescription', label: 'Descrição (opcional)', type: 'textarea' },
      { key: 'pixSingleUse', label: 'Uso único', type: 'checkbox' },
    ],
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

/** Campos vazios de uma categoria, com os valores por omissão do formulário. */
export function emptyFields(categoryId) {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  const fields = {};
  for (const field of category?.fields ?? []) {
    fields[field.key] = field.type === 'checkbox' ? false : '';
  }
  if (categoryId === 'wifi') fields.wifiSec = 'WPA/WPA2';
  return fields;
}

// --- Validação -------------------------------------------------------------

/** Devolve a mensagem de erro, ou <code>null</code> se estiver tudo bem. */
export function validate(categoryId, f) {
  switch (categoryId) {
    case 'link':
      return normalizeUrl(f.url).error;

    case 'texto':
      return f.texto && f.texto.trim() ? null : 'Escreve algum texto.';

    case 'email': {
      if (!f.mailTo || !f.mailTo.trim()) return 'Indica o destinatário do email.';
      const to = f.mailTo.trim();
      if (!to.includes('@') || to.startsWith('@') || to.endsWith('@') || to.includes(' ')) {
        return 'O destinatário não parece um email válido.';
      }
      return null;
    }

    case 'telefone':
    case 'sms':
    case 'whatsapp': {
      if (!f.phoneNumber || !f.phoneNumber.trim()) return 'Indica o número de telefone.';
      if (phonePrefix(f.phonePrefix).length === 0) return 'Indica o indicativo do país (ex.: +351).';
      if (digitsOnly(f.phoneNumber).length < 4) return 'O número de telefone é curto demais.';

      if (categoryId === 'sms' && f.smsMessage) {
        if (!isSmsSafe(f.smsMessage)) {
          return 'A mensagem tem caracteres que um SMS não suporta (ex.: { } [ ] ~ ^ | €).';
        }
      }
      return null;
    }

    case 'evento': {
      if (!f.eventTitle || !f.eventTitle.trim()) return 'Indica o título do evento.';
      if (f.eventEnd && f.eventStart && new Date(f.eventEnd) < new Date(f.eventStart)) {
        return 'A data de fim não pode ser anterior à de início.';
      }
      return null;
    }

    case 'localizacao': {
      const lat = parseCoord(f.geoLat);
      const lng = parseCoord(f.geoLng);

      if (lat === null) return 'Indica uma latitude válida (ex.: 38.7223).';
      if (lng === null) return 'Indica uma longitude válida (ex.: -9.1393).';
      // Antes não havia validação de intervalo: qualquer número passava e
      // produzia um geo: que nenhum mapa conseguia abrir.
      if (lat < -90 || lat > 90) return 'A latitude tem de estar entre -90 e 90.';
      if (lng < -180 || lng > 180) return 'A longitude tem de estar entre -180 e 180.';
      return null;
    }

    case 'wifi': {
      if (!f.wifiSsid || !f.wifiSsid.trim()) return 'Indica o nome da rede (SSID).';
      const ssid = f.wifiSsid.trim();
      if (ssid.length > 32) return 'O SSID tem mais de 32 caracteres.';

      const open = String(f.wifiSec).toLowerCase() === 'aberto';
      if (!open && !f.wifiPass) return 'Indica a password da rede.';
      if (!open && f.wifiPass.length > 63) return 'A password tem mais de 63 caracteres.';
      return null;
    }

    case 'vcard': {
      const empty = ['vcFirstName', 'vcLastName', 'vcPhone', 'vcPhone2', 'vcEmail']
        .every((k) => !f[k] || !f[k].trim());
      if (empty) return 'Preenche pelo menos um campo do contacto.';

      if (f.vcEmail && f.vcEmail.trim()) {
        const email = f.vcEmail.trim();
        if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
          return 'O email não parece válido.';
        }
      }
      return null;
    }

    case 'pix': {
      try {
        // build() valida tudo; devolvemos a primeira mensagem que aparecer.
        build('pix', f);
        return null;
      } catch (error) {
        return error.message;
      }
    }

    default:
      return 'Categoria desconhecida.';
  }
}

// --- Construção ------------------------------------------------------------

/** Constrói o payload da categoria. Lança se algo estiver errado. */
export function build(categoryId, f) {
  switch (categoryId) {
    case 'link':
      return normalizeUrl(f.url).url;

    case 'texto':
      return String(f.texto ?? '').trim();

    case 'email': {
      const to = String(f.mailTo ?? '').trim();
      const parts = [];
      if (f.mailSubject && f.mailSubject.trim()) parts.push('subject=' + urlEncode(f.mailSubject.trim()));
      if (f.mailBody && f.mailBody.trim()) parts.push('body=' + urlEncode(f.mailBody.trim()));
      return parts.length === 0 ? 'mailto:' + to : 'mailto:' + to + '?' + parts.join('&');
    }

    case 'telefone':
      return 'tel:' + phone(f.phonePrefix, f.phoneNumber);

    case 'sms':
      // O corpo do SMSTO vai até ao fim da string: um ':' ou uma quebra de
      // linha fariam os leitores interpretarem mal (validados acima).
      return 'SMSTO:' + phone(f.phonePrefix, f.phoneNumber) + ':' + (f.smsMessage ?? '');

    case 'whatsapp': {
      const number = digitsOnly(phone(f.phonePrefix, f.phoneNumber));
      const message = f.waMessage ?? '';
      return message.length === 0
        ? `https://wa.me/${number}`
        : `https://wa.me/${number}?text=${urlEncode(message)}`;
    }

    case 'evento':
      return buildICalEvent(f);

    case 'localizacao':
      return `geo:${round7(parseCoord(f.geoLat))},${round7(parseCoord(f.geoLng))}`;

    case 'wifi':
      return buildWifi(f);

    case 'vcard':
      return buildVCard(f);

    case 'pix':
      return buildPix({
        key: f.pixKey,
        name: f.pixName,
        city: f.pixCity,
        amount: f.pixAmount,
        txid: f.pixTxid || PLACEHOLDER_TXID,
        description: f.pixDescription,
        postcode: f.pixPostcode ?? '',
        singleUse: Boolean(f.pixSingleUse),
      });

    default:
      throw new Error('Categoria desconhecida: ' + categoryId);
  }
}

// --- Blocos por tipo -------------------------------------------------------

function buildICalEvent(f) {
  const line = (name, value) => name + ':' + value + ICAL_NEWLINE;
  const stamp = (value) => {
    const date = value ? new Date(value) : new Date();
    const pad = (n, width = 2) => String(n).padStart(width, '0');
    return (
      `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
  };

  let out = 'BEGIN:VCALENDAR' + ICAL_NEWLINE;
  out += line('VERSION', '2.0');
  out += line('PRODID', '-//QrCodeGenerator//PT');
  out += line('CALSCALE', 'GREGORIAN');
  out += 'BEGIN:VEVENT' + ICAL_NEWLINE;
  out += line('DTSTAMP', stamp(f.eventStart));
  out += line('DTSTART', stamp(f.eventStart));
  out += line('DTEND', stamp(f.eventEnd));
  out += line('SUMMARY', escapeICal(String(f.eventTitle ?? '').trim()));
  out += line('LOCATION', escapeICal(String(f.eventLocation ?? '').trim()));
  out += line('DESCRIPTION', escapeICal(String(f.eventDescription ?? '').trim()));
  out += 'END:VEVENT' + ICAL_NEWLINE;
  out += 'END:VCALENDAR' + ICAL_NEWLINE;
  return out;
}

function buildWifi(f) {
  const auth = f.wifiSec === 'WEP' ? 'WEP' : f.wifiSec === 'Aberto' ? 'nopass' : 'WPA';

  let out = 'WIFI:';
  out += 'T:' + auth + ';';
  out += 'S:' + escapeWifi(String(f.wifiSsid ?? '').trim()) + ';';
  if (auth !== 'nopass') out += 'P:' + escapeWifi(f.wifiPass ?? '') + ';';
  if (f.wifiHidden) out += 'H:true;';
  out += ';'; // terminador vazio obrigatório
  return out;
}

function buildVCard(f) {
  const first = String(f.vcFirstName ?? '').trim();
  const last = String(f.vcLastName ?? '').trim();
  const line = (value) => value + ICAL_NEWLINE;

  let out = 'BEGIN:VCARD' + ICAL_NEWLINE;
  out += line('VERSION:4.0');
  out += line('FN:' + escapeICal(`${first} ${last}`.trim()));
  // N: família;given;extra;prefixo;sufixo — a família vem primeiro.
  out += line('N:' + escapeICal(last) + ';' + escapeICal(first) + ';;;');
  out += line('PRODID:-//QrCodeGenerator//PT');

  if (f.vcOrg && f.vcOrg.trim()) out += line('ORG:' + escapeICal(f.vcOrg.trim()));
  if (f.vcRole && f.vcRole.trim()) out += line('TITLE:' + escapeICal(f.vcRole.trim()));

  if (f.vcPhone && f.vcPhone.trim()) out += line('TEL;TYPE=cell:' + f.vcPhone.trim());
  if (f.vcPhone2 && f.vcPhone2.trim()) out += line('TEL;TYPE=work:' + f.vcPhone2.trim());
  if (f.vcEmail && f.vcEmail.trim()) out += line('EMAIL:' + f.vcEmail.trim());

  // ADR;TYPE=work:;;rua;localidade;região;código postal;país
  const street = String(f.vcStreet ?? '').trim();
  const city = String(f.vcCity ?? '').trim();
  const zip = String(f.vcZip ?? '').trim();
  const country = String(f.vcCountry ?? '').trim();

  if (street || city || zip || country) {
    out += line(
      'ADR;TYPE=work:;;' +
        escapeICal(street) + ';' +
        escapeICal(city) + ';;' +
        escapeICal(zip) + ';' +
        escapeICal(country),
    );
  }

  out += line('END:VCARD');
  return out;
}

// --- Utilitários -----------------------------------------------------------

/** Coordenada do formulário, com vírgula ou ponto decimal. */
export function parseCoord(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round7(value) {
  return invariant(Number(value.toFixed(7)));
}

/** Caracteres aceites no corpo de um SMS (GSM 03.38 + extensões). */
const SMS_SAFE = new Set(
  (
    '0123456789' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    'abcdefghijklmnopqrstuvwxyz' +
    " -.,!?()'*+/:&%£$€¥=#@\"_<>;"
  ).split(''),
);

export function isSmsSafe(message) {
  return [...String(message ?? '')].every((ch) => SMS_SAFE.has(ch));
}

export { toAscii, clean, parsePixAmount };
