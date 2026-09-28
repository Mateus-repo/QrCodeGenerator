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
import { aplicarFrame, modulosMaximos } from './frameqr.js';
import { ligarSeletores } from './themes.js';
import { SIMBOLOGIAS, codificar as codificarLinear, simbologiaPorId } from './symbologies/index.js';
import { desenhar as desenharLinear, paraSvg as linearParaSvg, dimensoes } from './symbologies/linear.js';

const el = (id) => document.getElementById(id);

const dom = {
  formato: el('formato'),
  campoCategoria: el('campo-categoria'),
  categoria: el('categoria'),
  campos: el('campos'),
  formulario: el('formulario'),
  canvas: el('canvas'),
  vazio: el('vazio'),
  erro: el('erro'),
  acoes: el('acoes'),
  tema: el('tema'),
  temaModos: el('tema-modos'),
  campoEcc: el('campo-ecc'),
  ecc: el('ecc'),
  tamanho: el('tamanho'),
  ajudaTamanho: el('ajuda-tamanho'),
  margem: el('margem'),
  ajudaMargem: el('ajuda-margem'),
  campoFrame: el('campo-frame'),
  frame: el('frame'),
  frameTamanho: el('frame-tamanho'),
  ajudaFrame: el('ajuda-frame'),
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
  /**
   * A matriz do QR como foi desenhada, com a zona do logotipo ja apagada.
   *
   * Vive aqui para o SVG sair igual ao PNG. Se cada um voltasse a codificar o
   * payload, o PNG tinha o logotipo e o SVG nao — dois ficheiros com o mesmo
   * nome e conteudos diferentes, sem nenhum aviso.
   */
  qr: null,
  /**
   * O codigo de barras codificado, quando o formato e 1D.
   *
   * Vive ao lado do `payload` em vez de o substituir porque sao coisas
   * diferentes: o payload e o texto que o QR leva dentro, e o codigo de barras
   * e a sequencia de barras ja desenhada. O que se copia e o valor que o
   * utilizador escreveu, e o que se exporta e a imagem — que e o unico sitio
   * onde os dois se cruzam.
   */
  codigo: null,
};

/** O formato escolhido: 2D (QR) ou 1D (código de barras). */
const ehQr = () => dom.formato.value === 'qr';

/** A simbologia 1D escolhida, se for o caso. */
const simbologiaActual = () => (ehQr() ? null : simbologiaPorId(dom.formato.value));

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
  dom.campos.textContent = '';

  if (!ehQr()) {
    desenharCamposLineares();
    return;
  }

  const category = CATEGORIES.find((c) => c.id === dom.categoria.value);
  state.fields = emptyFields(dom.categoria.value);

  for (const field of category.fields) {
    dom.campos.append(campoDe(field, state.fields[field.key]));
  }
}

/**
 * O formulário de um código de barras: um campo só.
 *
 * O campo vem do registo de simbologias, com a sua etiqueta, o seu exemplo e a
 * sua dica. Nao e preciso escrever duas vezes a mesma coisa — a lista em
 * `symbologies/index.js` e a fonte unica do que cada simbologia aceita.
 */
function desenharCamposLineares() {
  const simbologia = simbologiaActual();
  if (simbologia === null) return;

  const div = document.createElement('div');
  div.className = 'campo';

  const input = document.createElement('input');
  input.id = `campo-${simbologia.campo.key}`;
  if (simbologia.campo.placeholder) input.placeholder = simbologia.campo.placeholder;
  // Teclado numérico no telemóvel: quem está a transcrever um código de uma
  // embalagem está a usar o dedo, e o teclado completo é lento e propenso a
  // erros. O Code 128 é a excepção, porque leva letras e símbolos.
  if (simbologia.id !== 'code128') input.inputMode = 'numeric';
  input.addEventListener('input', atualizar);

  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = simbologia.campo.label;

  div.append(label, input);

  if (simbologia.campo.dica) {
    const ajuda = document.createElement('p');
    ajuda.className = 'ajuda';
    ajuda.textContent = simbologia.campo.dica;
    div.append(ajuda);
  }

  const descricao = document.createElement('p');
  descricao.className = 'ajuda';
  descricao.textContent = simbologia.descricao;
  dom.campos.append(descricao, div);
}

/** Um campo do formulário, com o valor por omissão. */
function campoDe(field, valor) {
  const div = document.createElement('div');
  div.className = 'campo';

  if (field.type === 'checkbox') {
    const caixa = document.createElement('div');
    caixa.className = 'caixa';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `campo-${field.key}`;
    input.checked = valor === true;
    input.addEventListener('change', atualizar);

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = field.label;

    caixa.append(input, label);
    div.append(caixa);
    return div;
  }

  const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
  input.id = `campo-${field.key}`;
  if (field.type && !['textarea', 'checkbox'].includes(field.type)) input.type = field.type;
  if (field.placeholder) input.placeholder = field.placeholder;
  input.value = valor ?? '';
  input.addEventListener('input', atualizar);

  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = field.label;

  div.append(label, input);
  return div;
}

/**
 * Mostra e esconde o que só faz sentido num dos dois formatos.
 *
 * A correção de erros é o caso obvio: é uma propriedade do QR, e um código de
 * barras não tem. Deixá-la visível e a fingir que funciona é pior do que
 * escondê-la.
 */
function alternarFormato() {
  const qr = ehQr();

  dom.campoCategoria.hidden = !qr;
  dom.campoEcc.hidden = !qr;

  dom.ajudaMargem.textContent = qr
    ? 'A norma do QR pede 4. Só mexa se souber o que está a fazer.'
    : 'A ISO/IEC 15420 pede 10 módulos. Só mexa se souber o que está a fazer.';

  // A margem do QR vai de 0 a 8; a do código de barras é bem maior, e um
  // campo que não deixa escrever 10 seria mais uma coisa a explicar.
  dom.margem.max = qr ? '8' : '20';
  if (!qr) dom.margem.value = '10';

  // O quadrado do logótipo é um conceito do QR. Num código de barras não há
  // correção de erros que reconstrua o que se apaga, e o resultado seria um
  // código com um buraco no meio que ninguém lê.
  dom.campoFrame.hidden = !qr;

  dom.vazio.textContent = qr
    ? 'Preenche o conteúdo para o QR code aparecer aqui.'
    : 'Preenche o código para as barras aparecerem aqui.';

  desenharCampos();
  atualizar();
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
  if (!ehQr()) {
    atualizarLinear();
    return;
  }

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

    /*
     * O quadrado do logótipo, se estiver ligado.
     *
     * O limite vem de `modulosMaximos`, que é medido com o ZXing e não deduzido
     * da percentagem teórica da norma — a teórica é 4 a 6 vezes o que um QR
     * pequeno aguenta, e usá-la dá logótipos que às vezes leem. O pior
     * resultado possível, porque o defeito só aparece no cartão impresso.
     *
     * E a matriz apagada é que vai para o desenho, por isso `draw` e `toSvg`
     * recebem `qr`: sem isso voltavam a codificar o texto de novo e a zona
     * desaparecia, sem dar erro nenhum.
     */
    let codigo = info;
    let zona = null;

    if (dom.frame.checked) {
      const maximo = modulosMaximos(info.size, ecl);
      const pedido = Math.min(Number(dom.frameTamanho.value) || 0, maximo);

      if (pedido > 0) {
        codigo = aplicarFrame(info, { modulos: pedido });
        zona = codigo.zona;
      }
    }

    // O cursor fica sempre no maior valor que ainda lê. Se o texto é grande e
    // a matriz sai pequena, o logótipo disponível é menor — e um cursor acima
    // do limite seria uma promessa que o leitor não cumpre.
    const maximoFrame = modulosMaximos(info.size, ecl);
    dom.frameTamanho.max = String(maximoFrame);
    if (Number(dom.frameTamanho.value) > maximoFrame) {
      dom.frameTamanho.value = String(maximoFrame);
    }

    /*
     * A mensagem diz o que fazer quando não cabe, e não só que não cabe.
     *
     * Com ECC L ou M num QR pequeno o limite é mesmo zero módulos, e "acima
     * disso a correcção de erros já não chega" deixa o utilizador a achar que
     * é um problema da aplicação. Não é: é a correcção de erros que tem de
     * reconstruir a zona, e num QR de 29x29 a nível M não chega para nada.
     * A saída é subir o nível, e é isso que se lhe diz.
     */
    dom.ajudaFrame.textContent = !dom.frame.checked
      ? ''
      : maximoFrame === 0
        ? `Neste código não cabe um logótipo com ECC ${ecl}: a correção de ` +
          'erros não tem módulos a mais para reconstruir a zona. Suba para Q ou H.'
        : `Até ${maximoFrame} módulos de lado com ECC ${ecl} neste código. ` +
          'Acima disso a correção de erros já não chega.';

    const scale = Math.max(1, Math.ceil(targetPx / (info.size + border * 2)));

    draw(dom.canvas, payload, { ecl, border, scale, qr: codigo });

    state.payload = payload;
    state.qr = codigo;
    state.valido = true;
    dom.erro.hidden = true;
    dom.vazio.hidden = true;
    dom.acoes.hidden = false;
    dom.payload.textContent = payload;
    dom.contagem.textContent =
      `${info.size}×${info.size} módulos · versão ${info.version} · ` +
      `${usados} de ${limite} bytes (ECC ${ecl})` +
      (zona
        ? ` · ${codigo.apagados} módulos apagados para o logótipo (${codigo.percentagem.toFixed(1)}%)`
        : '');
  } catch (exception) {
    mostrarErro(exception.message || 'Não foi possível gerar o QR code.');
  }
}

/**
 * O caminho dos códigos de barras.
 *
 * Não é o do QR com outros valores: um código de barras não tem payload, não
 * tem versão, não tem correção de erros e não tem limite de bytes. Tem um valor
 * e uma simbologia, e a validação é da própria simbologia — está no registo em
 * `symbologies/index.js`, e é lá que vive a regra do número de dígitos.
 */
function atualizarLinear() {
  const simbologia = simbologiaActual();
  if (simbologia === null) {
    mostrarErro('Formato desconhecido.');
    return;
  }

  const input = document.getElementById(`campo-${simbologia.campo.key}`);
  const valor = input ? input.value : '';
  state.fields = { [simbologia.campo.key]: valor };

  if (valor.trim() === '') {
    // Um campo vazio não é um erro: é o estado inicial. O aviso a vermelho de
    // "escreve alguma coisa" em cima de um formulário em branco é apenas ruído.
    mostrarErro(null, 'Preenche o código para o ver aqui.');
    return;
  }

  try {
    const codigo = codificarLinear(dom.formato.value, valor);

    const targetPx = Math.max(64, Number(dom.tamanho.value) || 512);
    const margem = Math.min(20, Math.max(0, Number(dom.margem.value) || 10));

    /*
     * A escala é calculada a partir do tamanho pedido e da largura que a
     * simbologia vai ter. `ceil` garante que nunca fica abaixo do pedido —
     * arredondar para baixo dava 508 px quando se pediu 512, e o utilizador
     * fica com uma imagem que não pediu.
     */
    const larguraModulos = codigo.modules.length + margem * 2;
    const escala = Math.max(1, Math.ceil(targetPx / larguraModulos));
    const comLegenda = dom.margem.dataset.legenda !== 'off';

    const d = desenharLinear(dom.canvas, codigo, { escala, margem, comLegenda });

    state.codigo = codigo;
    state.payload = codigo.legenda;
    state.valido = true;
    dom.erro.hidden = true;
    dom.vazio.hidden = true;
    dom.acoes.hidden = false;
    dom.payload.textContent = codigo.legenda;
    dom.contagem.textContent =
      `${simbologia.rotulo} · ${codigo.modules.length} módulos · ` +
      `${d.pxLargura}×${d.pxAltura} px · escala ${escala} px/módulo`;
    dom.ajudaTamanho.textContent =
      'A altura segue a proporção que o leitor aguenta, e é por isso que a ' +
      'imagem não fica quadrada.';
  } catch (exception) {
    mostrarErro(exception.message || 'Não foi possível gerar o código de barras.');
  }
}

/**
 * Mostra o estado de erro, ou o estado inicial quando não há erro nenhum.
 *
 * `mensagem === null` não é um erro: é o formulário ainda vazio. A diferença
 * importa, porque pintar de vermelho um campo em branco que o utilizador ainda
 * não preencheu é ruído — e obriga a leitura de ecrã a anunciar um erro que
 * não existe.
 */
function mostrarErro(mensagem, textoVazio) {
  state.valido = false;
  state.codigo = null;
  dom.acoes.hidden = true;
  dom.payload.textContent = '';
  dom.contagem.textContent = '';

  if (mensagem) {
    dom.erro.textContent = mensagem;
    dom.erro.hidden = false;
    dom.vazio.hidden = true;
    return;
  }

  dom.erro.hidden = true;
  dom.vazio.textContent = textoVazio ?? 'Preenche o conteúdo para o QR code aparecer aqui.';
  dom.vazio.hidden = false;
}

// --- Guardar, copiar, partilhar -------------------------------------------

function nomeFicheiro(extensao) {
  // O nome do ficheiro diz o que foi gerado. Um `qrcode-pix.png` que é na
  // verdade um EAN-13 obriga a abrir o ficheiro para saber o que é.
  const nome = ehQr() ? `qrcode-${dom.categoria.value}` : `codigo-${dom.formato.value}`;
  return `${nome}.${extensao}`;
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

  if (!ehQr()) {
    const margem = Math.min(20, Math.max(0, Number(dom.margem.value) || 10));
    const escala = Math.max(
      1,
      Math.ceil(Math.max(64, Number(dom.tamanho.value) || 512) / (state.codigo.modules.length + margem * 2)),
    );
    const svg = linearParaSvg(state.codigo, { escala, margem });
    guardar(new Blob([svg], { type: 'image/svg+xml' }), nomeFicheiro('svg'));
    return;
  }

  /*
   * A mesma matriz que está no canvas, e não o payload outra vez.
   *
   * Sem isto, o PNG saía com o logótipo e o SVG saía sem ele — dois ficheiros
   * diferentes com o mesmo nome, e nenhum aviso. Guardar o `qr` em `state` é o
   * que garante que os dois são o mesmo código.
   */
  const svg = toSvg(state.payload, {
    ecl: dom.ecc.value,
    border: opcoes().border,
    qr: state.qr,
  });
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
  ligarSeletores(dom.tema, dom.temaModos);
  popularCategorias();
  desenharCampos();

  dom.formato.addEventListener('change', alternarFormato);

  dom.categoria.addEventListener('change', () => {
    desenharCampos();
    atualizar();
  });

  for (const control of [dom.ecc, dom.tamanho, dom.margem]) {
    control.addEventListener('change', atualizar);
  }

  /*
   * O `input` e nao o `change`: o cursor do logótipo arrasta-se, e com o
   * `change` o código só se redesenhava no fim. Para um utilizador a arrastar
   * um cursor isso é o código a ficar congelado enquanto se mexe, e a largura
   * das barras de tools não justifica o custo — apagar módulos é barato, e
   * `aplicarFrame` só percorre a zona.
   */
  dom.frame.addEventListener('change', atualizar);
  dom.frameTamanho.addEventListener('input', atualizar);

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
