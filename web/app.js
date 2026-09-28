/**
 * Interface do gerador.
 *
 * Decisões de portabilidade, porque o mesmo código tem de correr em Windows,
 * macOS, Linux e telemóvel:
 *
 *  - Nada de módulos de UI, nada de framework, nada de CDN. Sem `node_modules`
 *    e sem `npm install` — é por isso que abre a partir de um servidor
 *    estático em qualquer lado.
 *  - A Clipboard API só existe em contexto seguro (https/localhost). Como o
 *    site também pode ser aberto de `file://`, há uma via alternativa com um
 *    `<textarea>` temporário.
 *  - `navigator.share` só existe em alguns browsers e sobretudo em telemóvel.
 *    Quando não existe, o botão Guardar faz o mesmo.
 *  - O service worker só se regista em http/https; em `file://` é ignorado em
 *    silêncio, sem erro na consola.
 *  - Descarregar ficheiros usa `<a download>` e um Blob, que é a via que
 *    funciona em todos os browsers modernos, em vez de APIs só do Chromium.
 */

import { CATEGORIES, ECC_LEVELS, build, emptyFields, validate } from './payloads/types.js';
import { draw, encode, toSvg, MAX_BYTES } from './qrcode.js';

const el = (id) => document.getElementById(id);

const dom = {
  categoria: el('categoria'),
  campos: el('campos'),
  formulario: el('formulario'),
  canvas: el('canvas'),
  vazio: el('vazio'),
  erro: el('erro'),
  acoes: el('acoes'),
  ecc: el('ecc'),
  tamanho: el('tamanho'),
  margem: el('margem'),
  payload: el('payload'),
  contagem: el('contagem'),
  btnPng: el('btn-png'),
  btnSvg: el('btn-svg'),
  btnCopiar: el('btn-copiar'),
  btnPartilhar: el('btn-partilhar'),
  btnCopiarPayload: el('btn-copiar-payload'),
};

const state = {
  fields: {},
  payload: '',
  valido: false,
};

// --- Formulário ------------------------------------------------------------

function popularCategorias() {
  for (const category of CATEGORIES) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.label;
    dom.categoria.append(option);
  }
}

function desenharCampos() {
  const category = CATEGORIES.find((c) => c.id === dom.categoria.value);
  dom.campos.textContent = '';
  state.fields = emptyFields(dom.categoria.value);

  for (const field of category.fields) {
    const div = document.createElement('div');
    div.className = 'campo';

    if (field.type === 'checkbox') {
      const caixa = document.createElement('div');
      caixa.className = 'caixa';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `campo-${field.key}`;
      input.addEventListener('change', atualizar);

      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = field.label;

      caixa.append(input, label);
      div.append(caixa);
    } else {
      const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
      input.id = `campo-${field.key}`;
      if (field.type && !['textarea', 'checkbox'].includes(field.type)) input.type = field.type;
      if (field.placeholder) input.placeholder = field.placeholder;
      input.value = state.fields[field.key] ?? '';
      input.addEventListener('input', atualizar);

      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = field.label;

      div.append(label, input);
    }

    dom.campos.append(div);
  }
}

// --- Geração ---------------------------------------------------------------

function opcoes() {
  return {
    ecl: dom.ecc.value,
    border: Math.min(8, Math.max(0, Number(dom.margem.value) || 4)),
    targetPx: Math.max(64, Number(dom.tamanho.value) || 512),
  };
}

function atualizar() {
  const category = dom.categoria.value;

  // Relê os valores do DOM — a fonte da verdade é o que o utilizador escreveu.
  const fields = { ...emptyFields(category) };
  for (const field of CATEGORIES.find((c) => c.id === category).fields) {
    const input = document.getElementById(`campo-${field.key}`);
    if (input) fields[field.key] = input.type === 'checkbox' ? input.checked : input.value;
  }
  state.fields = fields;

  const erro = validate(category, fields);
  if (erro) {
    mostrarErro(erro);
    return;
  }

  try {
    const payload = build(category, fields);
    const { ecl, border, targetPx } = opcoes();

    // O limite do QR depende do ECC escolhido; avisamos com números em vez de
    // deixar a imagem falhar em silêncio.
    const limite = MAX_BYTES[ecl];
    const usados = new TextEncoder().encode(payload).length;
    if (usados > limite) {
      mostrarErro(`O conteúdo ocupa ${usados} bytes e o limite com ECC ${ecl} é ${limite}.`);
      return;
    }

    // A escala só pode ser calculada depois de saber quantos módulos tem a
    // matriz. Com `ceil` o resultado nunca fica abaixo do tamanho pedido —
    // arredondar para baixo dava 456 px quando se pediu 512.
    const info = encode(payload, { ecl });
    const scale = Math.max(1, Math.ceil(targetPx / (info.size + border * 2)));

    draw(dom.canvas, payload, { ecl, border, scale });

    state.payload = payload;
    state.valido = true;
    dom.erro.hidden = true;
    dom.vazio.hidden = true;
    dom.acoes.hidden = false;
    dom.payload.textContent = payload;
    dom.contagem.textContent =
      `${info.size}×${info.size} módulos · versão ${info.version} · ` +
      `${usados} de ${limite} bytes (ECC ${ecl})`;
  } catch (exception) {
    mostrarErro(exception.message || 'Não foi possível gerar o QR code.');
  }
}

function mostrarErro(mensagem) {
  state.valido = false;
  dom.erro.textContent = mensagem;
  dom.erro.hidden = false;
  dom.vazio.hidden = false;
  dom.acoes.hidden = true;
  dom.payload.textContent = '';
  dom.contagem.textContent = '';
}

// --- Guardar, copiar, partilhar -------------------------------------------

function nomeFicheiro(extensao) {
  return `qrcode-${dom.categoria.value}.${extensao}`;
}

function guardar(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Espera antes de libertar: no Safari, revogar já durante o click
  // cancela a transferência.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function guardarPng() {
  if (!state.valido) return;
  dom.canvas.toBlob((blob) => {
    if (blob) guardar(blob, nomeFicheiro('png'));
  }, 'image/png');
}

function guardarSvg() {
  if (!state.valido) return;
  const svg = toSvg(state.payload, { ecl: dom.ecc.value, border: opcoes().border });
  guardar(new Blob([svg], { type: 'image/svg+xml' }), nomeFicheiro('svg'));
}

/** `navigator.clipboard` só existe em contexto seguro. */
async function copiar(texto, botao) {
  const original = botao.textContent;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
    } else {
      copiarSemClipboard(texto);
    }
    botao.textContent = 'Copiado!';
  } catch {
    botao.textContent = 'Não foi possível copiar';
  }

  setTimeout(() => {
    botao.textContent = original;
  }, 1800);
}

function copiarSemClipboard(texto) {
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

async function partilhar() {
  if (!state.valido) return;

  try {
    dom.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const ficheiro = new File([blob], nomeFicheiro('png'), { type: 'image/png' });

      if (navigator.canShare?.({ files: [ficheiro] })) {
        await navigator.share({ files: [ficheiro], title: 'QR code' });
      } else {
        guardar(blob, ficheiro.name);
      }
    }, 'image/png');
  } catch (exception) {
    console.warn('Partilha indisponível:', exception);
    guardarPng();
  }
}

// --- Arranque --------------------------------------------------------------

function registarServiceWorker() {
  // Em `file://` não há service worker; registar dá erro e polui a consola.
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;

  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.warn('Service worker não registado:', error);
  });
}

function arranque() {
  popularCategorias();
  desenharCampos();

  dom.categoria.addEventListener('change', () => {
    desenharCampos();
    atualizar();
  });

  for (const control of [dom.ecc, dom.tamanho, dom.margem]) {
    control.addEventListener('change', atualizar);
  }

  dom.btnPng.addEventListener('click', guardarPng);
  dom.btnSvg.addEventListener('click', guardarSvg);
  dom.btnCopiar.addEventListener('click', () => copiarImagem(dom.btnCopiar));
  dom.btnCopiarPayload.addEventListener('click', () => copiar(state.payload, dom.btnCopiarPayload));
  dom.btnPartilhar.addEventListener('click', partilhar);

  // Só faz sentido oferecer "partilhar" onde a API existe.
  if (navigator.share) dom.btnPartilhar.hidden = false;

  window.addEventListener('resize', atualizar, { passive: true });
  atualizar();

  // O empacotador do ficheiro único define __FICHEIRO_UNICO__: nesse caso não
  // há sw.js ao lado e registá-lo só provocaria um 404.
  if (typeof __FICHEIRO_UNICO__ === 'undefined') registarServiceWorker();
}

/** Copiar a imagem: a Clipboard API só aceita texto em muitos browsers. */
async function copiarImagem(botao) {
  const original = botao.textContent;

  try {
    if (!navigator.clipboard || !window.ClipboardItem || !window.isSecureContext) {
      throw new Error('Clipboard de imagens indisponível');
    }
    const blob = await new Promise((resolve) => dom.canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    botao.textContent = 'Copiado!';
  } catch {
    // Alternativa honesta: copiar o payload em texto, que é o que a maioria
    // dos browsers permite e o que interessa na maioria dos casos.
    await copiar(state.payload, botao);
  }

  setTimeout(() => {
    botao.textContent = original;
  }, 1800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arranque);
} else {
  arranque();
}
