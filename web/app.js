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
import { aplicarFrame, modulosMaximos, desenharLogotipo, dimensaoDoLogotipo } from './frameqr.js';
import { pdf417 } from './symbologies/pdf417.js';
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
  frameFicheiro: el('frame-ficheiro'),
  ajudaFrameImagem: el('ajuda-frame-imagem'),
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
   * A imagem do logotipo do FrameQR, ja carregada.
   *
   * Vive aqui e nao num `<img>` do DOM porque o canvas precisa dela com as
   * dimensoes **naturais**, e um `<img>` escondido pode ter sido reescalado
   * pelo CSS. A resolucao e o que interessa, e a unica forma de a ter a
   * certeza e ler da propria imagem.
   */
  /**
   * A escala e a zona do FrameQR, para o logotipo sair no sítio certo.
   *
   * O SVG vive em coordenadas de **módulo**, e o canvas em píxeis. Passar de
   * uns para os outros é dividir pela escala, e essa divisão tem de ser feita
   * uma vez e aqui — e não nos dois sítios, onde uma diferença de um arredondamento
   * põe o logotipo um módulo ao lado do sítio e o código deixa de ler.
   */
  escalaFrame: 1,
  zonaFrame: null,
  logotipo: null,
  nomeLogotipo: '',
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

/**
 * O formato escolhido.
 *
 * São três caminhos e não dois, porque o PDF417 é uma grelha de duas dimensões
 * como o QR mas não é um QR: tem payload próprio (o texto cru, não o resultado
 * de um gerador de tipo), não tem versão nem máscara nem margem de 4, e a sua
 * zona muda é de 2 módulos. Fingir que é um QR dá erros nos dois sentidos.
 */
const ehQr = () => dom.formato.value === 'qr';
const ehPdf417 = () => dom.formato.value === 'pdf417';

/** A simbologia 1D escolhida, se for o caso. */
const simbologiaActual = () =>
  ehQr() || ehPdf417() ? null : simbologiaPorId(dom.formato.value);

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

  if (ehPdf417()) {
    desenharCamposPdf417();
    return;
  }

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
 * O formulário do PDF417: um campo de texto, e só.
 *
 * O QR tem categorias porque cada uma monta um payload diferente. O PDF417 não
 * tem categorias: é um transportador de texto, e o que escreve vai dentro tal
 * e qual. Um utilizador que venha de um código de barras espera um campo e não
 * uma lista — e o que ele está a fazer, colar o conteúdo e imprimir, dá igualmente bem num e noutro.
 *
 * O `inputMode` fica no teclado normal, e não no numérico: o PDF417 é o único
 * formato deste ecrã que leva texto corrente, e pôr o teclado numérico seria
 * dizer que não leva.
 */
function desenharCamposPdf417() {
  const div = document.createElement('div');
  div.className = 'campo';

  const input = document.createElement('input');
  input.id = 'campo-valor';
  input.placeholder = 'Conteúdo a codificar';
  input.value = state.payload;
  input.addEventListener('input', atualizar);

  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = 'Conteúdo';

  const ajuda = document.createElement('p');
  ajuda.className = 'ajuda';
  ajuda.textContent =
    'Texto ou números, até 2710 caracteres. O PDF417 comprime os números ' +
    'muito mais do que as letras: um número de série longo sai em metade do ' +
    'tamanho do mesmo texto com letras.';

  div.append(label, input, ajuda);
  dom.campos.append(div);
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
 * Os níveis de correção de erros, por formato.
 *
 * São listas diferentes e não a mesma com outros nomes. No QR são quatro e
 * chamam-se L, M, Q, H. No PDF417 são **nove**, chamam-se 0 a 8, e cada um é
 * `2^(nível+1)` codewords de correcção — o nível 8 são 512, e é mais do que o
 * QR máximo. Pôr os quatro do QR no PDF417 e dizer "H — máximo" seria uma
 * mentira pequena e de consequência: quem quisesse o máximo ficaria com um quarto
 * do que dá.
 */
const eccQr = [
  ['L', 'L — mais conteúdo, menos robustez'],
  ['M', 'M — equilibrado (recomendado)'],
  ['Q', 'Q — mais robustez'],
  ['H', 'H — máximo, para imprimir'],
];

const eccPdf417 = [
  ['0', '0 — 2 codewords. Só para texto que nunca se danifica'],
  ['1', '1 — 4 codewords'],
  ['2', '2 — 8 codewords (recomendado)'],
  ['3', '3 — 16 codewords'],
  ['4', '4 — 32 codewords, para imprimir'],
  ['5', '5 — 64 codewords'],
  ['6', '6 — 128 codewords'],
  ['7', '7 — 256 codewords'],
  ['8', '8 — 512 codewords. Enche o código de barras inútil'],
];

function preencherEcc(opcoes) {
  const anterior = dom.ecc.value;
  dom.ecc.textContent = '';

  for (const [valor, texto] of opcoes) {
    const option = document.createElement('option');
    option.value = valor;
    option.textContent = texto;
    dom.ecc.append(option);
  }

  // Tenta manter o que lá estava, para não trocar de formato e perder a escolha.
  if (opcoes.some(([valor]) => valor === anterior)) dom.ecc.value = anterior;
}

/**
 * O que dizer ao utilizador sobre a imagem do logótipo.
 *
 * **O número muda com a escala, e é por isso que isto é uma função.** A escala
 * depende do tamanho pedido e da versão do QR, e ambas mudam enquanto o
 * utilizador escreve: o mesmo logótipo de 5 módulos dá uma caixa de 60×60 px a
 * 512 e de 250×250 a 2048. Uma mensagem escrita uma vez seria uma mentira em
 * metade dos casos, e a pessoa só descobria a meio de imprimir.
 *
 * O que se diz tem os dois lados, porque as correções são diferentes: uma
 * imagem pequena fica a serrilhada e o remédio é fechá-la ou pôr o logótipo
 * mais pequeno; uma grande não é problema nenhum, porque o browser reduz bem e
 * o ideal é mesmo N×N **módulos**, onde já não há resolução a ganhar.
 */
function dizerDoLogotipo(info, codigo, escala, modulos) {
  if (!dom.frame.checked || modulos === 0) {
    dom.ajudaFrameImagem.textContent =
      'Sem ficheiro, fica só o quadrado apagado — que é o que o FieldQR está feito para: os dados dentro dele são reconstruídos pela correção de erros.';
    return;
  }

  const { pix } = dimensaoDoLogotipo(modulos, escala);
  const ideal = `${pix}×${pix} px (${modulos}×${modulos} módulos a ${escala} px por módulo)`;
  const imagem = state.logotipo;

  if (!imagem) {
    dom.ajudaFrameImagem.textContent = `Escolhe uma imagem para pôr no quadrado. A caixa é ${ideal}.`;
    return;
  }

  const largura = imagem.naturalWidth;
  const altura = imagem.naturalHeight;
  const nome = state.nomeLogotipo;
  const medida = `${largura}×${altura} px`;

  /*
   * A partir de `modulos` píxeis por lado já não há nada a ganhar: um módulo é
   * o menor elemento do código, e ampliar mais só repete pixels. O browser
   * reduz bem, por isso acima disso **não há problema nenhum** — e dizer que há
   * um máximo seria inventar uma restrição que não existe. O aviso é só para
   * baixo, que é onde a imagem é esticada e o logotipo fica a serrilhado.
   *
   * A primeira versão dizia "está no tamanho certo — é grande, e o browser
   * reduz", que é uma frase que se contradiz a meio. O que interessa dizer é
   * uma coisa só, e o resto é silêncio.
   */
  if (largura < modulos || altura < modulos) {
    dom.ajudaFrameImagem.textContent =
      `${nome} tem ${medida}, e a caixa é ${ideal}. A imagem é menor do que a ` +
      `caixa, por isso vai ser esticada e o logotipo fica a serrilhado — numa ` +
      `etiqueta pequena vê-se a um metro. Fecha-a para ${modulos}×${modulos} px, ` +
      'ou põe o logotipo mais pequeno.';
    return;
  }

  const folga = Math.max(largura, altura) / modulos;
  dom.ajudaFrameImagem.textContent =
    folga > 8
      ? `${nome} tem ${medida}, e a caixa é ${ideal}. Está muito acima do ` +
        'necessário, mas o resultado é o mesmo — o browser reduz sem se ver.'
      : `${nome} tem ${medida}, e a caixa é ${ideal}. Está no tamanho certo.`;
}

/**
 * Carrega a imagem do logótipo.
 *
 * A imagem é lida por `FileReader` e não por um `<img>` escondido, porque o
 * que interessa é a **dimensão natural** e um elemento no DOM pode ter sido
 * reescalado pelo CSS. A resolução é a única coisa que decide se o logótipo
 * fica nítido, e é a que se diz ao utilizador.
 */
function carregarLogotipo(ficheiro) {
  if (!ficheiro) {
    state.logotipo = null;
    state.nomeLogotipo = '';
    atualizar();
    return;
  }

  if (!ficheiro.type.startsWith('image/')) {
    state.logotipo = null;
    state.nomeLogotipo = '';
    dom.ajudaFrameImagem.textContent = `"${ficheiro.name}" não é uma imagem.`;
    mostrarErro(`"${ficheiro.name}" não é uma imagem. Escolhe um PNG, um JPEG ou um SVG.`);
    return;
  }

  const leitor = new FileReader();

  leitor.onload = () => {
    const imagem = new Image();
    imagem.onload = () => {
      state.logotipo = imagem;
      state.nomeLogotipo = ficheiro.name;
      // Um erro anterior pode estar a tapar o código, e agora já há código.
      dom.erro.hidden = true;
      atualizar();
    };
    imagem.onerror = () => {
      state.logotipo = null;
      state.nomeLogotipo = '';
      mostrarErro(`Não consegui ler "${ficheiro.name}". O ficheiro pode estar corrompido.`);
    };
    imagem.src = leitor.result;
  };

  leitor.onerror = () => {
    state.logotipo = null;
    state.nomeLogotipo = '';
    mostrarErro(`Não consegui ler "${ficheiro.name}".`);
  };

  leitor.readAsDataURL(ficheiro);
}

/**
 * Mostra e esconde o que só faz sentido num dos formatos.
 *
 * A correção de erros é o caso obvio: é uma propriedade do QR, e um código de
 * barras não tem. Deixá-la visível e a fingir que funciona é pior do que
 * escondê-la.
 *
 * O PDF417 complica: **tem** correção de erros, e é a mais ajustável dos três
 * — nove níveis, de 0 a 8. Por isso o campo aparece, mas com o texto do PDF417
 * e não o do QR, porque os níveis não são os mesmos e dizer "H — máximo" seria
 * mentira.
 */
function alternarFormato() {
  const qr = ehQr();
  const empilhado = ehPdf417();

  dom.campoCategoria.hidden = !qr;

  // O campo de correcção de erros serve para o QR e para o PDF417, cada um com
  // as suas opções. São reconstruídos porque as opções são diferentes e não
  // vale a pena trocar os valores a meio.
  dom.campoEcc.hidden = !(qr || empilhado);
  if (qr) preencherEcc(eccQr);
  else if (empilhado) preencherEcc(eccPdf417);

  dom.ajudaMargem.textContent = qr
    ? 'A norma do QR pede 4. Só mexa se souber o que está a fazer.'
    : empilhado
      ? 'A norma do PDF417 pede 2. Só mexa se souber o que está a fazer.'
      : 'A ISO/IEC 15420 pede 10 módulos. Só mexa se souber o que está a fazer.';

  // A margem do QR vai de 0 a 8; a do código de barras é bem maior, e um
  // campo que não deixa escrever 10 seria mais uma coisa a explicar.
  dom.margem.max = qr || empilhado ? '8' : '20';
  if (!qr) dom.margem.value = empilhado ? '2' : '10';

  // O quadrado do logótipo é um conceito do QR. Num código de barras não há
  // correção de erros que reconstrua o que se apaga, e o resultado seria um
  // código com um buraco no meio que ninguém lê.
  dom.campoFrame.hidden = !qr;

  dom.vazio.textContent = qr
    ? 'Preenche o conteúdo para o QR code aparecer aqui.'
    : empilhado
      ? 'Preenche o conteúdo para o PDF417 aparecer aqui.'
      : 'Preenche o código para as barras aparecerem aqui.';

  desenharCampos();
  atualizar();
}

// --- Geração ---------------------------------------------------------------

/**
 * O caminho do PDF417.
 *
 * Não é o do QR com outros valores, e também não o do código de barras. É uma
 * grelha de duas dimensões, como o QR, mas o que se escreve dentro é o texto
 * tal e qual — o PDF417 é um transportador de texto, não um gerador de tipos
 * como o QR, e não há categorias nem payloads estruturados.
 *
 * **As linhas são mais altas do que largas**, e é o que o distingue à primeira
 * vista. Um módulo é um módulo quadrado num código de barras 1D e num QR, mas
 * no PDF417 a especificação pede que a linha tenha cerca de três a quatro
 * vezes a altura do módulo. Desenhar a grelha com módulos quadrados dá um
 * código que o leitor lê, e que não parece com nenhum PDF417 do mundo — o que
 * é sinal de que alguma coisa está errada antes de o ler.
 */
function atualizarPdf417() {
  const input = document.getElementById('campo-valor');
  const texto = input ? input.value : '';
  const nivel = Number(dom.ecc.value);
  const colunas = 6;

  if (texto.length === 0) {
    mostrarErro('Escreve alguma coisa para codificar.', 'Preenche o conteúdo para o PDF417 aparecer aqui.');
    return;
  }

  try {
    const codigo = pdf417(texto, { colunas, nivel });
    const margem = Math.min(20, Math.max(0, Number(dom.margem.value) || 2));
    const alvo = Math.max(64, Number(dom.tamanho.value) || 512);

    // O alvo é a largura, como no QR. A escala em píxeis por módulo sai da
    // largura, e a altura vem da razão das linhas.
    const modulos = codigo.modules[0].length + margem * 2;
    const escala = Math.max(1, Math.ceil(alvo / modulos));
    const largura = modulos * escala;
    const altura = (codigo.modules.length + margem * 2) * escala * RAZAO_LINHA_PDF417;

    dom.canvas.width = largura;
    dom.canvas.height = altura;

    const contexto = dom.canvas.getContext('2d');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, largura, altura);
    contexto.fillStyle = '#000000';

    const alturaModulo = escala * RAZAO_LINHA_PDF417;
    for (let y = 0; y < codigo.modules.length; y++) {
      for (let x = 0; x < codigo.modules[y].length; x++) {
        if (!codigo.modules[y][x]) continue;
        const x0 = (x + margem) * escala;
        const y0 = (y + margem) * alturaModulo;
        contexto.fillRect(x0, y0, escala, alturaModulo);
      }
    }

    state.payload = texto;
    // A matriz guarda-se para o SVG sair igual ao PNG, pelo mesmo motivo que
    // no QR com o logótipo.
    state.qr = codigo;
    state.valido = true;
    dom.erro.hidden = true;
    dom.vazio.hidden = true;
    dom.acoes.hidden = false;
    dom.payload.textContent = texto;
    dom.contagem.textContent =
      `${codigo.linhas} linhas × ${codigo.colunas} colunas · ` +
      `${codigo.palavras} codewords · ECC ${nivel} (${2 ** (nivel + 1)} de correcção) · ` +
      `${codigo.modules[0].length} módulos de largura`;
  } catch (exception) {
    mostrarErro(exception.message || 'Não foi possível gerar o PDF417.');
  }
}

/** A razão entre a altura e a largura de um módulo no PDF417. */
const RAZAO_LINHA_PDF417 = 4;

function opcoes() {
  return {
    ecl: dom.ecc.value,
    border: Math.min(8, Math.max(0, Number(dom.margem.value) || 4)),
    targetPx: Math.max(64, Number(dom.tamanho.value) || 512),
  };
}

function atualizar() {
  if (ehPdf417()) {
    atualizarPdf417();
    return;
  }

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
    let numModulosFrame = 0;

    if (dom.frame.checked) {
      const maximo = modulosMaximos(info.size, ecl);
      const pedido = Math.min(Number(dom.frameTamanho.value) || 0, maximo);

      if (pedido > 0) {
        codigo = aplicarFrame(info, { modulos: pedido });
        zona = codigo.zona;
        numModulosFrame = pedido;
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

    /*
     * O logotipo, por cima do quadrado apagado.
     *
     * O desenho tem de vir **depois** do QR, e não antes: a zona apagada é o
     * que ficou branco, e a imagem é o que vai lá dentro. Ao contrário, a
     * correcção de erros não reconstruía nada e o código não lia.
     */
    if (codigo !== info && state.logotipo) {
      const contexto = dom.canvas.getContext('2d');
      desenharLogotipo(contexto, codigo, state.logotipo, {
        escala: scale,
        // A margem do código. Sem isto o logotipo sai 4 módulos à esquerda:
        // a zona apagada é a mesma, o código continua a ler, e só o desenho é
        // que fica torto — o pior género de bug, porque nada falha.
        offset: border,
      });
    }

    dizerDoLogotipo(info, codigo, scale, numModulosFrame);

    state.payload = payload;
    /*
     * A matriz, a escala e a zona guardam-se para o SVG sair **igual** ao PNG.
     *
     * A escala e a zona são o que coloca o logotipo, e são as duas coisas que
     * podem divergir entre os dois ficheiros: o SVG tem o seu próprio sistema
     * de coordenadas, em módulos, e converter a escala de píxeis para módulos
     * à mão é o caminho mais curto para os dois ficheiros deixarem de ser o
     * mesmo código — que é o bug que já aconteceu uma vez.
     */
    state.qr = codigo;
    state.escalaQr = scale;
    state.zonaFrame = zona;
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

/**
 * O PDF417 em SVG, com a mesma grelha que está no canvas.
 *
 * Sai da **mesma matriz**, e não de codificar o texto outra vez. É a mesma
 * razão do QR com o logótipo: se os dois ficheiros saíssem de codificações
 * diferentes, o PNG e o SVG seriam códigos diferentes com o mesmo nome, e
 * ninguém saberia qual dos dois está certo.
 *
 * `shape-rendering="crispEdges"` é o que impede o browser de pôr módulos
 * cinzentos nas margens entre eles. Num código de barras 2D isso é a diferença
 * entre se ler e não se ler.
 */
function svgPdf417() {
  const grade = state.qr.modules;
  const margem = Math.min(20, Math.max(0, Number(dom.margem.value) || 2));
  const colunas = grade[0].length + margem * 2;
  const linhas = grade.length + margem * 2;

  const rects = [];
  for (let y = 0; y < grade.length; y++) {
    for (let x = 0; x < grade[y].length; x++) {
      if (grade[y][x]) {
        rects.push(
          `<rect x="${x + margem}" y="${y + margem}" width="1" height="1"/>`,
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${colunas} ${linhas}" ` +
    `shape-rendering="crispEdges">` +
    `<rect width="${colunas}" height="${linhas}" fill="#fff"/>` +
    `<g fill="#000">${rects.join('')}</g></svg>`
  );
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

  if (ehPdf417()) {
    guardar(new Blob([svgPdf417()], { type: 'image/svg+xml' }), nomeFicheiro('svg'));
    return;
  }

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
   *
   * E o logotipo vai embutido no SVG como uma imagem, senão o mesmo problema
   * numa forma diferente: o PNG com o logotipo e o SVG com o buraco.
   */
  const svg = toSvg(state.payload, {
    ecl: dom.ecc.value,
    border: opcoes().border,
    qr: state.qr,
    logotipo: state.logotipo,
    escala: state.escalaQr,
    zona: state.zonaFrame,
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
  dom.frameFicheiro.addEventListener('change', () => {
    carregarLogotipo(dom.frameFicheiro.files[0]);
  });

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
