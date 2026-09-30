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
import { dataMatrix as codificarDataMatrix } from './symbologies/datamatrix.js';
import { gs1DataMatrix } from './symbologies/gs1-datamatrix.js';
import { desenharDataMatrix, paraSvgDataMatrix } from './datamatrix.js';
import { sqrc as codificarSqrc } from './sqrc.js';
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

  /*
   * O painel do SQRC. São três campos e um botão, e o botão é o único que
   * escreve no campo da chave — o resto do formulário escreve em campos de
   * conteúdo e isso é previsível; escrever na chave de quem vai ser o único
   * ponto onde o comportamento é menos óbvio.
   */
  campoSqrc: el('campo-sqrc'),
  sqrcChave: el('sqrc-chave'),
  sqrcId: el('sqrc-id'),
  sqrcGerarChave: el('sqrc-gerar-chave'),
  ajudaChave: el('ajuda-chave'),
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
   * A matriz do Data Matrix (e do GS1 DataMatrix) tal como foi desenhada.
   *
   * Vive aqui pelo mesmo motivo que a do QR: o SVG tem de sair **igual** ao PNG,
   * e para isso precisa da mesma matriz e não do payload outra vez. Sem isto, os
   * dois ficheiros saíam de codificações diferentes e ninguém dizia nada.
   */
  dataMatrix: null,
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
/** O Data Matrix, e o GS1 DataMatrix: grelha 2D, mas não o QR. */
const ehDataMatrix = () =>
  dom.formato.value === 'datamatrix' || dom.formato.value === 'gs1-datamatrix';
/** O GS1 DataMatrix tem os AI entre parênteses; o Data Matrix normal, texto solto. */
const ehGs1DataMatrix = () => dom.formato.value === 'gs1-datamatrix';
/**
 * O SQRC: um QR cujo conteúdo vai cifrado.
 *
 * **É um QR para o desenho, e não para o conteúdo.** A grelha, a versão e a
 * correção de erros são as do QR — o que muda é o que entra no contentor, e
 * por isso o caminho de desenho é o do QR e não um quarto caminho.
 *
 * O que o distingue de todos os outros é que **precisa de dois campos** — o
 * conteúdo e a chave — e de uma operação assíncrona antes de haver payload. É
 * a única razão de o `atualizar()` ser uma função que devolve uma promessa.
 */
const ehSqrc = () => dom.formato.value === 'sqrc';

/** A simbologia 1D escolhida, se for o caso. */
const simbologiaActual = () =>
  ehQr() || ehPdf417() || ehDataMatrix() || ehSqrc() ? null : simbologiaPorId(dom.formato.value);

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

  if (ehDataMatrix()) {
    desenharCamposDataMatrix();
    return;
  }

  /*
   * **O SQRC fica com os campos do QR, e nao com os dos lineares.**
   *
   * A condicao e' `!ehQr() && !ehSqrc()` e nao so `!ehQr()`, e sem o `ehSqrc()`
   * o SQRC caia no ramo dos codigos de barras, onde `simbologiaActual()` devolve
   * `null` - e o `desenharCamposLineares()` sai sem desenhar nada, **sem erro**.
   *
   * O sintoma e' o pior possivel: o painel dos campos fica vazio, a pessoa
   * escreve o conteudo e nao acontece nada, e nao ha mensagem nenhuma. Nem o
   * `erro` nem a consola dizem porque - a funcao simplesmente nao desenhou.
   */
  if (!ehQr() && !ehSqrc()) {
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

  /*
   * O `select` das opcoes fixas, que e' o `wifiSec` da seguranca.
   *
   * **Um `select` nao leva `placeholder`, e por isso e' um ramo a parte.** Se
   * caisse no `input` de baixo com `type: 'select'`, o browser desenhava um
   * campo de texto com a palavra "select" no sitio e **nada mais** — e o campo
   * da seguranca do WiFi e' o que decide se o QR liga a rede ou nao, o que
   * e' a pior coisa para dar mal.
   */
  if (field.type === 'select' && Array.isArray(field.options)) {
    const select = document.createElement('select');
    select.id = `campo-${field.key}`;
    for (const opcao of field.options) {
      const item = document.createElement('option');
      item.value = opcao;
      item.textContent = opcao;
      select.append(item);
    }
    select.value = valor ?? field.options[0];
    select.addEventListener('change', atualizar);

    const label = document.createElement('label');
    label.htmlFor = select.id;
    label.textContent = field.label;

    div.append(label, select);
    return div;
  }

  const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
  input.id = `campo-${field.key}`;
  if (field.type && !['textarea', 'checkbox'].includes(field.type)) input.type = field.type;
  if (field.placeholder) input.placeholder = field.placeholder;

  /*
   * **O `defaultValue` e' o exemplo de um campo que nao mostra `placeholder`.**
   *
   * Um `datetime-local` **nao mostra o `placeholder` em lado nenhum**: o browser
   * desenha um selector com o calendario, e o texto do `placeholder` nunca
   * aparece. Escrever o exemplo num `placeholder` e' escrever num sitio onde
   * ninguem o ve — o campo fica vazio e nao ha forma de saber se e' bug.
   *
   * Por isso os campos de data trazem `defaultValue`, e aqui vai para o
   * `value`. A diferenca entre os dois e' que o `value` e' o que a pessoa ve
   * **e** o que o `build()` le, e por isso o exemplo **entra no payload**.
   *
   * E isso e' o que se quer: um evento com a data de hoje a serio e' um evento
   * que a pessoa pode usar. Um evento de exemplo, com data de 2030, nao e'.
   */
  if (field.defaultValue && valor === undefined) {
    input.value = field.defaultValue;
  } else {
    input.value = valor ?? '';
  }

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
    // **O número que falta e' o da propria imagem.** A mensagem dizia "fecha-a
    // para 70x70 px", mas nao dizia *de* quantos pixeis, e quem tem de a
    // redimensionar e' quem vai ler a frase. `modulos` e' a medida em modulos e
    // `pix` em pixeis, e sao numeros diferentes: e' a confusao entre as duas
    // unidades que a `AGENTS.md` manda escrever nos dois termos.
    dom.ajudaFrameImagem.textContent =
      `${nome} tem ${medida}, e a caixa é ${ideal} — ou seja ${pix}×${pix} ` +
      `píxeis na imagem exportada. O logótipo é menor do que a caixa, por isso ` +
      `vai ser esticado e fica a serrilhado — numa etiqueta pequena vê-se a um ` +
      `metro. Fecha a imagem para pelo menos ${pix}×${pix} px, ou põe um ` +
      `logótipo mais pequeno.`;
    return;
  }

  /*
   * Acima da medida ideal: **nao ha problema, e a razao importa.**
   *
   * A primeira versao dizia "está no tamanho certo — é grande, e o browser
   * reduz", que e' uma frase que se contradiz a meio. A segunda so media a
   * folga e nao dizia nada sobre a resolucao. **As duas sao incompletas**: o
   * que a pessoa quer saber e' se o logótipo sai nitido na imagem exportada, e
   * isso responde-se com `escala` — quantos pixeis do logótipo caem num modulo.
   *
   * Um logótipo com 8 pixeis por modulo ja e' nitido a olho nu; com 4, cada
   * modulo e' um bloco de 4 pixeis da imagem original e o contorno treme.
   */
  const pxPorModulo = Math.min(largura, altura) / modulos;
  const nitido = pxPorModulo >= 8;
  const medidaPorModulo = `${pxPorModulo.toFixed(1)} px por módulo`;

  dom.ajudaFrameImagem.textContent = nitido
    ? `${nome} tem ${medida}, e a caixa é ${ideal}. A imagem dá ` +
      `${medidaPorModulo}, o que é nitido — e acima do necessário o browser ` +
      `reduz sem se ver, por isso pode ser mais grande sem problema.`
    : `${nome} tem ${medida}, e a caixa é ${ideal}. A imagem dá só ` +
      `${medidaPorModulo}, e o contorno do logótipo pode tremer na imagem ` +
      `exportada. Acima de 8 px por módulo já é nitido; fecha a imagem para ` +
      `uns ${Math.ceil(modulos * 8)}×${Math.ceil(modulos * 8)} px se quiser ` +
      `o melhor resultado.`;
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
  const matriz = ehDataMatrix();
  const cifrado = ehSqrc();

  /*
   * O painel do SQRC aparece e desaparece com o formato, e **é a única coisa que
   * muda**. O resto do formulário — a categoria, a correcção de erros, o
   * logótipo — é o do QR, porque o desenho é o do QR.
   *
   * A categoria fica visível no SQRC **de propósito**: o conteúdo a cifrar é
   * o que a pessoa escolheria para escrever num QR, e pedir texto solto seria
   * pedir duas vezes a mesma coisa.
   */
  dom.campoCategoria.hidden = !(qr || cifrado);
  dom.campoSqrc.hidden = !cifrado;

  // O campo de correção de erros serve para o QR e para o PDF417, cada um com
  // as suas opções. São reconstruídos porque as opções são diferentes e não
  // vale a pena trocar os valores a meio.
  //
  // **O Data Matrix fica de fora, e não por ser 2D.** É que ele tem um único
  // nível, o ECC200, e não se escolhe: o `dom.campoEcc` ficaria visível com as
  // opções do PDF417, que são nove, e nenhuma delas se aplicaria. Deixar um
  // campo de correção de erros que não faz nada é pior do que não o ter — é o
  // que a nota do `campoEcc` diz, e o Data Matrix é o caso onde a tentação de o
  // mostrar é maior porque "é 2D, como o QR".
  dom.campoEcc.hidden = !(qr || empilhado);
  if (qr) preencherEcc(eccQr);
  else if (empilhado) preencherEcc(eccPdf417);

  /*
   * O SQRC fica com a correcção de erros do QR, e a **razão é a mesma do
   * logótipo**: um QR sem correcção de erros que apague um módulo devolve
   * bytes errados, e num SQRC isso é pior — quem lê recebe texto cifrado que
   * não descifra, e o erro é "chave errada" a apontar para o software.
   *
   * Por isso o logótipo **fica disponível** no SQRC: apagar módulos é
   * exactamente o caso em que a correcção de erros faz o seu trabalho, e é a
   * parte do QR que dá mais jeito a quem põe um logótipo numa etiqueta
   * cifrada.
   */
  dom.campoEcc.hidden = !(qr || empilhado || cifrado);
  if (qr || cifrado) preencherEcc(eccQr);
  else if (empilhado) preencherEcc(eccPdf417);

  dom.ajudaMargem.textContent = qr || cifrado
    ? 'A norma do QR pede 4. Só mexa se souber o que está a fazer.'
    : empilhado || matriz
      ? matriz
        ? 'O Data Matrix funciona com 0 ou 1. Só mexa se souber o que está a fazer.'
        : 'A norma do PDF417 pede 2. Só mexa se souber o que está a fazer.'
      : 'A ISO/IEC 15420 pede 10 módulos. Só mexa se souber o que está a fazer.';

  // A margem do QR e do PDF417 vai de 0 a 8; a do código de barras é bem maior, e
  // um campo que não deixa escrever 10 seria mais uma coisa a explicar. A do
  // Data Matrix é pequena como a do QR - ele tem guias, e a zona muda é de 2.
  dom.margem.max = qr || empilhado || matriz || cifrado ? '8' : '20';
  if (!qr && !cifrado) dom.margem.value = empilhado || matriz ? '2' : '10';

  // O quadrado do logótipo é um conceito do QR. Num código de barras não há
  // correção de erros que reconstrua o que se apaga, e o resultado seria um
  // código com um buraco no meio que ninguém lê.
  dom.campoFrame.hidden = !qr && !cifrado;

  dom.vazio.textContent = qr
    ? 'Preenche o conteúdo para o QR code aparecer aqui.'
    : cifrado
      ? 'Preenche o conteúdo e a chave para o SQRC aparecer aqui.'
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

/**
 * O campo dos Data Matrix.
 *
 * O GS1 DataMatrix e o Data Matrix normal tem o mesmo campo - uma linha de texto
 * - e so muda o que se escreve nela e o que a dica diz. Sao duas funcoes e nao
 * uma com uma condicao porque **a dica e' a metade do que o utilizador precisa**:
 * o `((01)...)` com os AI entre parenteses nao e' adivinhavel, e uma dica que
 * nao mostra um exemplo completo deixa a pessoa a descobrir a sintaxe.
 */
function desenharCamposDataMatrix() {
  const gs1 = ehGs1DataMatrix();

  const div = document.createElement('div');
  div.className = 'campo';

  const input = document.createElement('input');
  input.id = 'campo-valor';
  input.placeholder = gs1 ? '(01)04012345678901(10)LOTE-A1' : 'MAST-2024-0001';
  input.value = state.payload;
  input.addEventListener('input', atualizar);

  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = gs1 ? 'Campos GS1' : 'Conteúdo';

  const ajuda = document.createElement('p');
  ajuda.className = 'ajuda';
  ajuda.textContent = gs1
    ? 'Cada campo começa por (AI) entre parênteses. O (01) é o GTIN de 14 ' +
      'dígitos, o (10) o lote e o (17) a validade, em AAMMDD. O quadradinho ' +
      'é o que vai em ampolas de farmácia e em chips — é o código 2D mais ' +
      'denso que existe.'
    : 'Texto solto, sem AI. Para etiquetas de farmácia e chips, o GS1 ' +
      'DataMatrix é o certo: traz o GTIN, o lote e a validade juntos.';

  div.append(label, input, ajuda);
  dom.campos.append(div);
}

/**
 * O caminho do Data Matrix e do GS1 DataMatrix.
 *
 * **O Data Matrix é o código 2D mais denso que existe**, e isso é a razão de ele
 * ser pequeno e não haver mush choices. Um símbolo de 22×22 leva 44 caracteres
 * de dados, que é quase o que um QR de nível L com a mesma informação leva em
 * área. A razão é a correção de erros: o ECC200 põe até 62% do símbolo em
 * codewords de correcção, três vezes mais do que o QR mais robusto, porque as
 * etiquetas são pequenas e apanham inferno.
 *
 * O que ele não tem são os três padrões de localização nos cantos que o QR tem.
 * A orientação vem de duas guias em L. É por isso que é muito mais pequeno.
 */
function atualizarDataMatrix() {
  const input = document.getElementById('campo-valor');
  const texto = input ? input.value : '';

  if (texto.length === 0) {
    mostrarErro(
      'Escreve alguma coisa para codificar.',
      ehGs1DataMatrix()
        ? 'Preenche os campos GS1 para o código aparecer aqui.'
        : 'Preenche o conteúdo para o Data Matrix aparecer aqui.',
    );
    return;
  }

  try {
    const codigo = ehGs1DataMatrix()
      ? gs1DataMatrix(texto)
      : codificarDataMatrix(texto);

    const margem = Math.min(8, Math.max(0, Number(dom.margem.value) || 2));
    const alvo = Math.max(64, Number(dom.tamanho.value) || 512);

    desenharDataMatrix(dom.canvas, codigo, { margem, targetPx: alvo });

    state.payload = texto;
    // A matriz guarda-se para o SVG sair igual ao PNG, pelo mesmo motivo que no
    // QR com o logótipo e no PDF417.
    /*
     * A matriz do Data Matrix guarda-se tal como a do QR e a do PDF417, e pelo
     * mesmo motivo: o SVG tem de sair **igual** ao PNG, e para isso precisa da
     * mesma matriz e nao do payload outra vez. Sem isto, mudar o campo faria o
     * PNG e o SVG divergirem sem nenhum aviso.
     */
    state.dataMatrix = codigo;
    state.valido = true;
    dom.erro.hidden = true;
    dom.vazio.hidden = true;
    dom.acoes.hidden = false;
    dom.payload.textContent = texto;

    const info = ehGs1DataMatrix()
      ? `${codigo.campos.length} campos GS1 · ${codigo.separadores} FNC1 · ` +
        `${codigo.colunas}×${codigo.linhas} módulos · ${codigo.usado} de ` +
        `${codigo.capacidade} codewords`
      : `${codigo.colunas}×${codigo.linhas} módulos · ${codigo.usado} de ` +
        `${codigo.capacidade} codewords · ECC200`;
    dom.contagem.textContent = info;
  } catch (exception) {
    mostrarErro(exception.message);
  }
}

function atualizar() {
  if (ehPdf417()) {
    atualizarPdf417();
    return;
  }

  if (ehDataMatrix()) {
    atualizarDataMatrix();
    return;
  }

  /*
   * O SQRC é o único caminho que é **assíncrono**, porque cifrar é uma operação
   * da Web Crypto e não há versão síncrona.
   *
   * E a razão de o `atualizar` não poder simplesmente devolver: quem o chama
   * não espera, e não deve passar a esperar — um evento de `input` que
   * bloqueasse o fio a cada tecla seria um cliente que não responde, e a
   * pessoa_notaria antes de eu perceber porquê.
   *
   * A alternativa — cifrar só quando se carrega num botão — afasta a
   * pré-visualização, e quem faz um QR quer ver o QR enquanto escreve. Por isso
   * a cifra corre a cada alteração e o desenho espera por ela.
   */
  if (ehSqrc()) {
    atualizarSqrc();
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

  desenharQr(build(category, fields));
}

/**
 * O desenho de um QR, a partir do payload ja pronto.
 *
 * ## Porque e' uma funcao e nao um bloco do `atualizar`
 *
 * **Porque ha dois formatos que desenham um QR e so um deles tinha o pipeline
 * inteiro.** O QR normal e o SQRC, que e' um QR com o conteudo cifrado. A
 * primeira versao do SQRC tinha o desenho **repetido** dentro do seu `atualizar`,
 * e a consequencia foi concreta:
 *
 *  - o **logotipo nao funcionava**. O `aplicarFrame` — que apaga os modulos
 *    para o logotipo caber — so era chamado no caminho do QR. No SQRC o painel
 *    aparecia, o cursor arrastava-se, e nao apagava nada. **Um campo que aceita
 *    ser mexido e que nao faz nada e' pior do que um campo que nao existe**,
 *    porque a pessoa acredita que funcionou e imprime;
 *  - e a proxima correccao no QR ia ter de ser feita **duas vezes**, e a
 *    segunda ficava para tras. E o que acontece com um caminho repetido.
 *
 * Por isso o SQRC calcula o payload e chama isto, e o que muda entre os dois
 * e' so o que entra no `state.payload` — que ja esta posto antes da chamada.
 *
 * ## O que este metodo sabe
 *
 * A versao que sai, o limite em bytes, a escala, a **zona apagada** do logotipo,
 * e o SVG com o logotipo dentro. Tudo isso e' igual nos dois, e e' por isso que
 * e' a mesma funcao.
 *
 * E a razao de o `ajudaFrame` sair daqui: **o limite do logotipo depende do
 * tamanho do codigo**, que so se sabe depois de codificar. Um SQRC tem a base64
 * maior do que o texto — a cifra acrescenta 28 bytes e a base64 cresce de 4/3 —
 * e por isso que o codigo e' maior e o logotipo disponivel e' menor. A mensagem
 * tem de dizer o limite **deste** codigo, e nao o de outro.
 */
function desenharQr(payload) {
  try {
    const { ecl, border, targetPx } = opcoes();

    /*
     * O limite do QR depende do ECC escolhido, e avisamos com numeros em vez de
     * deixar a imagem falhar em silencio.
     *
     * **A mensagem do SQRC e' diferente, e a razao e' que a culpa nao e' do
     * texto.** Quem escreve "peca-4471" e ve "o conteudo ocupa 200 bytes" pensa
     * que o texto e' grande demais — e nao e'. E' a **cifra** que cresceu: 28
     * bytes de nonce e etiqueta, mais a base64 a 4/3. Por isso a mensagem diz
     * que e' a cifra, e nao repete o numero sem contexto.
     */
    const limite = MAX_BYTES[ecl];
    const usados = new TextEncoder().encode(payload).length;
    if (usados > limite) {
      mostrarErro(
        ehSqrc()
          ? `O conteúdo cifrado ocupa ${usados} bytes e o limite com ECC ${ecl} é ${limite}. ` +
            'É a cifra que cresceu, não o teu texto: encurta o conteúdo.'
          : `O conteúdo ocupa ${usados} bytes e o limite com ECC ${ecl} é ${limite}.`,
      );
      return;
    }

    // A escala só pode ser calculada depois de saber quantos módulos tem a
    // matriz. Com `ceil` o resultado nunca fica abaixo do tamanho pedido —
    // arredondar para baixo dava 456 px quando se pediu 512.
    const info = encode(payload, { ecl });

    /*
     * O quadrado do logotipo, se estiver ligado.
     *
     * O limite vem de `modulosMaximos`, que e' medido com o ZXing e nao deduzido
     * da percentagem teorica da norma — a teorica e' 4 a 6 vezes o que um QR
     * pequeno aguenta, e usa-la da logotipos que as vezes leem. O pior
     * resultado possivel, porque o defeito so aparece no cartao impresso.
     *
     * E a matriz apagada e' que vai para o desenho, por isso `draw` e `toSvg`
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

    // O cursor fica sempre no maior valor que ainda le. Se o texto e' grande e
    // a matriz sai pequena, o logotipo disponivel e' menor — e um cursor acima
    // do limite seria uma promessa que o leitor nao cumpre.
    const maximoFrame = modulosMaximos(info.size, ecl);
    dom.frameTamanho.max = String(maximoFrame);
    if (Number(dom.frameTamanho.value) > maximoFrame) {
      dom.frameTamanho.value = String(maximoFrame);
    }

    /*
     * A mensagem diz o que fazer quando nao cabe, e nao so que nao cabe.
     *
     * Com ECC L ou M num QR pequeno o limite e' mesmo zero modulos, e "acima
     * disso a correccao de erros ja nao chega" deixa a pessoa a achar que e' um
     * problema da aplicacao. Nao e': e' a correccao de erros que tem de
     * reconstruir a zona, e num QR de 29x29 a nivel M nao chega para nada.
     * A saida e' subir o nivel, e e' isso que se lhe diz.
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
     * O desenho tem de vir **depois** do QR, e nao antes: a zona apagada e' o
     * que ficou branco, e a imagem e' o que va la dentro. Ao contrario, a
     * correccao de erros nao reconstruia nada e o codigo nao lia.
     */
    if (codigo !== info && state.logotipo) {
      const contexto = dom.canvas.getContext('2d');
      desenharLogotipo(contexto, codigo, state.logotipo, {
        escala: scale,
        /*
         * **Isto e' `offset`, e nao `margem`.** A margem do codigo entra como
         * deslocamento em modulos, porque a zona apagada e' dada em coordenadas
         * do *codigo* e o canvas desenha a partir da *margem* — a mesma grelha
         * com origens diferentes.
         *
         * **A chamada passou `margem: border` durante muito tempo, e o nome
         * estava errado.** O `offset` ficava no seu valor por omissao de zero e
         * o logotipo saia `border` modulos para a esquerda e para cima: medido,
         * 40 px a 10 px por modulo, e o QR continuava a ler. Nenhum teste falhava
         * porque o codigo estava certo — so o desenho saia torto.
         *
         * E' o bug que a `AGENTS.md` descreve com "o logotipo saiu 4 modulos a
         * esquerda", e a correccao estava escrita no comentario **e** no sitio
         * errado. Um comentario que explica a armadilha e' inofensivo; o que
         * importa e' o nome do argumento, que e' o que o codigo le.
         */
        offset: border,
      });
    }

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
        ? ` · ${codigo.apagados} módulos apagados para o logotipo (${codigo.percentagem.toFixed(1)}%)`
        : '');
  } catch (exception) {
    mostrarErro(exception.message || 'Não foi possível gerar o QR code.');
  }
}

/**
 * O caminho do SQRC: um QR com o conteúdo cifrado.
 *
 * ## A ordem é o que interessa aqui, e não é a óbvia
 *
 * O conteúdo é lido, a chave é lida, o conteúdo é **cifrado**, e só então é que
 * há payload. O payload do SQRC **não é o que a pessoa escreveu** — é a base64
 * do contentor. E é isso que vai para o campo de texto, para o PNG, para o SVG e
 * para o botão de copiar, que é o que uma pessoa precisa de levar para outro
 * sítio.
 *
 * Se o payload fosse o texto original, o botão de cópia entregaria o segredo em
 * claro, e o QR desenhado seria uma coisa e o copiado outra. **Um SQRC cuja
 * exportação não é o SQRC é o pior dos dois.**
 *
 * ## Por que a chave vai para uma `CryptoKey` e não para os bytes
 *
 * `crypto.subtle.importKey` não aceita uma `CryptoKey` de outro sítio, e não
 * guarda a chave em lado nenhum do nosso lado: a `CryptoKey` que este módulo
 * tem é a única cópia, e vai para o lixo quando a função acaba. O texto da
 * chave continua no campo — quem o escreve é quem o tem.
 */
async function atualizarSqrc() {
  const category = dom.categoria.value;

  // Os valores do DOM, como no QR.
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

  const texto = build(category, fields);

  /*
   * **Uma chave vazia é o estado inicial, não um erro**, e pela mesma razão que
   * um campo de código de barras vazio não é: o aviso a vermelho em cima de um
   * formulário em branco é ruído. A pessoa ainda não fez nada de errado.
   *
   * Mas o aviso do painel — "sem a chave perdeste isto para sempre" — está lá
   * sempre, porque esse é sobre o que vai acontecer, e não sobre o que
   * aconteceu.
   */
  const textoChave = dom.sqrcChave.value;
  if (textoChave === '') {
    mostrarErro(null, 'Preenche a chave para o SQRC aparecer aqui.');
    return;
  }

  try {
    /*
     * **A chave sai de uma frase com PBKDF2, e não de ser usada como bytes.**
     *
     * A DENSO especifica uma derivação, e ela não é opcional: uma frase de 12
     * caracteres são 12 bytes, e o AES-128 quer 16 ou 32. Usar os bytes da frase
     * directamente daria menos entropia do que parece e, pior, daria chaves
     * diferentes para frases com o mesmo comprimento — o que faria duas pessoas
     * com a mesma frase terem códigos que não abrem um no outro.
     *
     * O sal é fixo e o custo é alto de propósito: o sal fixo é porque quem tem
     * a frase e o código tem de dar a mesma chave, e o custo é para que
     * adivinhar a frase a partir do código seja caro. **Aqui não há
     * armazenamento de senhas a proteger**, e por isso o custo é o mesmo para
     * toda a gente.
     */
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(textoChave),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    const chave = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new TextEncoder().encode('qrcodegenerator/sqrc'), iterations: 210000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const id = new TextEncoder().encode(dom.sqrcId.value);
    const codigo = await codificarSqrc(texto, chave, id);

    /*
     * **O payload é a base64 do contentor, e é o que vai para tudo** — o canvas,
     * o SVG, a cópia e a partilha. Um único valor, e é o que a nota acima do
     * `state.payload` quer dizer.
     */
    state.payload = codigo.base64;

    /*
     * **A partir daqui e' o QR, e o caminho e' o mesmo caminho.**
     *
     * A primeira versao do SQRC **repetia o desenho do QR**: calculava a
     * escala, chamava o `draw`, desenhava o logotipo, e escrevia o `state`. E o
     * que acontece com um caminho repetido e' o que aconteceu aqui:
     *
     *  - o **logotipo nao funcionava**, porque o `aplicarFrame` - que apaga os
     *    modulos para o logotipo caber - so era chamado no caminho do QR. O
     *    painel aparecia, o cursor arrastava-se, e nao apagava nada. **Um
     *    campo que aceita ser mexido e que nao faz nada** e' pior do que um
     *    campo que nao existe;
     *  - e a proxima correccao no QR - uma escala diferente, um limite novo -
     *    ia ter de ser feita duas vezes, e a segunda ficava paratras.
     *
     * Por isso o SQRC **calcula o payload e depois chama o caminho do QR**,
     * que ja sabe de tudo: versao, escala, logotipo, zona apagada, e o SVG com
     * o logotipo dentro. A unica coisa que muda e' o `state.payload`, que ja
     * esta posto.
     */
    desenharQr(codigo.base64);
  } catch (exception) {

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

  if (ehDataMatrix()) {
    /*
     * A **mesma matriz** que o canvas, e nao o payload outra vez. Sem isto o PNG
     * e o SVG saiam de codificacoes diferentes, e dois ficheiros com o mesmo nome
     * e conteudos diferentes e' o bug que ja aconteceu com o QR com o logotipo.
     */
    const margem = Math.min(8, Math.max(0, Number(dom.margem.value) || 2));
    const svg = paraSvgDataMatrix(state.dataMatrix, { margem });
    guardar(new Blob([svg], { type: 'image/svg+xml' }), nomeFicheiro('svg'));
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

  /*
   * Os campos do SQRC.
   *
   * **`input` e nao `change`**, como nos campos de conteúdo: quem escreve a
   * chave quer ver o código aparecer enquanto escreve. O custo é uma cifra por
   * tecla, e o PBKDF2 a 210000 iterações **não é barato** — mas é a mesma cifra
   * que se faria ao carregar num botão, e aqui a pessoa vê o resultado em vez de
   * carregar em nada.
   *
   * O que muda é a **espera**: sem um atraso, escrever uma frase de 20
   * caracteres dispara vinte cifras em fila, e as vinte desenham fora de ordem
   * — a que acaba primeiro desenha, e a que foi pedida primeiro fica por cima.
   * O sintoma é o código piscar e o resultado final ser o de uma tecla atrás.
   */
  let sqrcTimer = null;
  const sqrcAdiado = () => {
    clearTimeout(sqrcTimer);
    sqrcTimer = setTimeout(atualizar, 120);
  };

  dom.sqrcChave.addEventListener('input', sqrcAdiado);
  dom.sqrcId.addEventListener('input', sqrcAdiado);

  /*
   * Gerar uma chave.
   *
   * **O botão escreve no campo, e não aplica a chave.** Escrever no campo é o
   * que deixa a pessoa ver o que tem, confirmar que o guardou, e mudar um
   * carácter se discoversse um erro. Aplicar a chave direto deixava-a sem
   * maneira de a confirmar, e quem não sabe qual é a sua chave tem um problema
   * que não tem solução.
   *
   * E por isso que **não vai para o histórico**: um botão de "não te esqueças"
   * que põe a chave no histórico do browser está a fazer o contrário do que
   * promete.
   */
  dom.sqrcGerarChave.addEventListener('click', () => {
    /*
     * **16 bytes de entropia, em base32 sem ambiguidade.**
     *
     * O alfabeto base32 sem `I`, `L`, `O` e `U` — os que se confundem com o
     * `1` e o `0`. Uma chave que a pessoa vai ler num ecrã e escrever num papel
     * não pode ter caracteres que se confundem, porque o erro de transcrição é
     * indetectável: dá "chave errada", e ninguém sabe que foi um `1` por um `I`.
     *
     * E são 16 bytes, não 32: é o tamanho que a DENSO especifica, e uma chave
     * de 256 bits numa frase que a pessoa tem de escrever à mão não é mais
     * segura — é mais difícil de acertar.
     */
    const alfabeto = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let chave = '';
    for (const b of bytes) chave += alfabeto[b % alfabeto.length];

    dom.sqrcChave.value = chave;
    atualizar();
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
