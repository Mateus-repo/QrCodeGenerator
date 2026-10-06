/**
 * Interface do gerador.
 *
 * DecisÃµes de portabilidade, porque o mesmo cÃ³digo tem de correr em Windows,
 * macOS, Linux e telemÃ³vel:
 *
 *  - Nada de mÃ³dulos de UI, nada de framework, nada de CDN. Sem `node_modules`
 *    e sem `npm install` â€” Ã© por isso que abre a partir de um servidor
 *    estÃ¡tico em qualquer lado.
 *  - A Clipboard API sÃ³ existe em contexto seguro (https/localhost). Como o
 *    site tambÃ©m pode ser aberto de `file://`, hÃ¡ uma via alternativa com um
 *    `<textarea>` temporÃ¡rio.
 *  - `navigator.share` sÃ³ existe em alguns browsers e sobretudo em telemÃ³vel.
 *    Quando nÃ£o existe, o botÃ£o Guardar faz o mesmo.
 *  - O service worker sÃ³ se regista em http/https; em `file://` Ã© ignorado em
 *    silÃªncio, sem erro na consola.
 *  - Descarregar ficheiros usa `<a download>` e um Blob, que Ã© a via que
 *    funciona em todos os browsers modernos, em vez de APIs sÃ³ do Chromium.
 */

import { CATEGORIES, ECC_LEVELS, build, emptyFields, validate } from './payloads/types.js';
import { draw, encode, toSvg, MAX_BYTES } from './qrcode.js';
import { aplicarFrame, modulosMaximos, desenharLogotipo, dimensaoDoLogotipo, FORMAS } from './frameqr.js';
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
  frameForma: el('frame-forma'),
  frameTamanho: el('frame-tamanho'),
  ajudaFrame: el('ajuda-frame'),
  frameAngulo: el('frame-angulo'),
  ajudaFrameAngulo: el('ajuda-frame-angulo'),
  framePosicao: el('frame-posicao'),
  ajudaFramePosicao: el('ajuda-frame-posicao'),
  frameFicheiro: el('frame-ficheiro'),
  ajudaFrameImagem: el('ajuda-frame-imagem'),

  /*
   * O painel do SQRC. SÃ£o trÃªs campos e um botÃ£o, e o botÃ£o Ã© o Ãºnico que
   * escreve no campo da chave â€” o resto do formulÃ¡rio escreve em campos de
   * conteÃºdo e isso Ã© previsÃ­vel; escrever na chave de quem vai ser o Ãºnico
   * ponto onde o comportamento Ã© menos Ã³bvio.
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
   * e para isso precisa da mesma matriz e nÃ£o do payload outra vez. Sem isto, os
   * dois ficheiros saÃ­am de codificaÃ§Ãµes diferentes e ninguÃ©m dizia nada.
   */
  dataMatrix: null,
  /**
   * A matriz do QR como foi desenhada, com a zona do logotipo ja apagada.
   *
   * Vive aqui para o SVG sair igual ao PNG. Se cada um voltasse a codificar o
   * payload, o PNG tinha o logotipo e o SVG nao â€” dois ficheiros com o mesmo
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
   * A escala e a zona do FrameQR, para o logotipo sair no sÃ­tio certo.
   *
   * O SVG vive em coordenadas de **mÃ³dulo**, e o canvas em pÃ­xeis. Passar de
   * uns para os outros Ã© dividir pela escala, e essa divisÃ£o tem de ser feita
   * uma vez e aqui â€” e nÃ£o nos dois sÃ­tios, onde uma diferenÃ§a de um arredondamento
   * pÃµe o logotipo um mÃ³dulo ao lado do sÃ­tio e o cÃ³digo deixa de ler.
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
   * utilizador escreveu, e o que se exporta e a imagem â€” que e o unico sitio
   * onde os dois se cruzam.
   */
  codigo: null,
};

/**
 * O formato escolhido.
 *
 * SÃ£o trÃªs caminhos e nÃ£o dois, porque o PDF417 Ã© uma grelha de duas dimensÃµes
 * como o QR mas nÃ£o Ã© um QR: tem payload prÃ³prio (o texto cru, nÃ£o o resultado
 * de um gerador de tipo), nÃ£o tem versÃ£o nem mÃ¡scara nem margem de 4, e a sua
 * zona muda Ã© de 2 mÃ³dulos. Fingir que Ã© um QR dÃ¡ erros nos dois sentidos.
 */
const ehQr = () => dom.formato.value === 'qr';
const ehPdf417 = () => dom.formato.value === 'pdf417';
/** O Data Matrix, e o GS1 DataMatrix: grelha 2D, mas nÃ£o o QR. */
const ehDataMatrix = () =>
  dom.formato.value === 'datamatrix' || dom.formato.value === 'gs1-datamatrix';
/** O GS1 DataMatrix tem os AI entre parÃªnteses; o Data Matrix normal, texto solto. */
const ehGs1DataMatrix = () => dom.formato.value === 'gs1-datamatrix';
/**
 * O SQRC: um QR cujo conteÃºdo vai cifrado.
 *
 * **Ã‰ um QR para o desenho, e nÃ£o para o conteÃºdo.** A grelha, a versÃ£o e a
 * correÃ§Ã£o de erros sÃ£o as do QR â€” o que muda Ã© o que entra no contentor, e
 * por isso o caminho de desenho Ã© o do QR e nÃ£o um quarto caminho.
 *
 * O que o distingue de todos os outros Ã© que **precisa de dois campos** â€” o
 * conteÃºdo e a chave â€” e de uma operaÃ§Ã£o assÃ­ncrona antes de haver payload. Ã‰
 * a Ãºnica razÃ£o de o `atualizar()` ser uma funÃ§Ã£o que devolve uma promessa.
 */
const ehSqrc = () => dom.formato.value === 'sqrc';

/** A simbologia 1D escolhida, se for o caso. */
const simbologiaActual = () =>
  ehQr() || ehPdf417() || ehDataMatrix() || ehSqrc() ? null : simbologiaPorId(dom.formato.value);

// --- FormulÃ¡rio ------------------------------------------------------------

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
 * O formulÃ¡rio do PDF417: um campo de texto, e sÃ³.
 *
 * O QR tem categorias porque cada uma monta um payload diferente. O PDF417 nÃ£o
 * tem categorias: Ã© um transportador de texto, e o que escreve vai dentro tal
 * e qual. Um utilizador que venha de um cÃ³digo de barras espera um campo e nÃ£o
 * uma lista â€” e o que ele estÃ¡ a fazer, colar o conteÃºdo e imprimir, dÃ¡ igualmente bem num e noutro.
 *
 * O `inputMode` fica no teclado normal, e nÃ£o no numÃ©rico: o PDF417 Ã© o Ãºnico
 * formato deste ecrÃ£ que leva texto corrente, e pÃ´r o teclado numÃ©rico seria
 * dizer que nÃ£o leva.
 */
function desenharCamposPdf417() {
  const div = document.createElement('div');
  div.className = 'campo';

  const input = document.createElement('input');
  input.id = 'campo-valor';
  input.placeholder = 'ConteÃºdo a codificar';
  input.value = state.payload;
  input.addEventListener('input', atualizar);

  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = 'ConteÃºdo';

  const ajuda = document.createElement('p');
  ajuda.className = 'ajuda';
  ajuda.textContent =
    'Texto ou nÃºmeros, atÃ© 2710 caracteres. O PDF417 comprime os nÃºmeros ' +
    'muito mais do que as letras: um nÃºmero de sÃ©rie longo sai em metade do ' +
    'tamanho do mesmo texto com letras.';

  div.append(label, input, ajuda);
  dom.campos.append(div);
}

/**
 * O formulÃ¡rio de um cÃ³digo de barras: um campo sÃ³.
 *
 * O campo vem do registo de simbologias, com a sua etiqueta, o seu exemplo e a
 * sua dica. Nao e preciso escrever duas vezes a mesma coisa â€” a lista em
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
  // Teclado numÃ©rico no telemÃ³vel: quem estÃ¡ a transcrever um cÃ³digo de uma
  // embalagem estÃ¡ a usar o dedo, e o teclado completo Ã© lento e propenso a
  // erros. O Code 128 Ã© a excepÃ§Ã£o, porque leva letras e sÃ­mbolos.
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

/** Um campo do formulÃ¡rio, com o valor por omissÃ£o. */
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
   * campo de texto com a palavra "select" no sitio e **nada mais** â€” e o campo
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
   * ninguem o ve â€” o campo fica vazio e nao ha forma de saber se e' bug.
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
 * Os nÃ­veis de correÃ§Ã£o de erros, por formato.
 *
 * SÃ£o listas diferentes e nÃ£o a mesma com outros nomes. No QR sÃ£o quatro e
 * chamam-se L, M, Q, H. No PDF417 sÃ£o **nove**, chamam-se 0 a 8, e cada um Ã©
 * `2^(nÃ­vel+1)` codewords de correcÃ§Ã£o â€” o nÃ­vel 8 sÃ£o 512, e Ã© mais do que o
 * QR mÃ¡ximo. PÃ´r os quatro do QR no PDF417 e dizer "H â€” mÃ¡ximo" seria uma
 * mentira pequena e de consequÃªncia: quem quisesse o mÃ¡ximo ficaria com um quarto
 * do que dÃ¡.
 */
const eccQr = [
  ['L', 'L â€” mais conteÃºdo, menos robustez'],
  ['M', 'M â€” equilibrado (recomendado)'],
  ['Q', 'Q â€” mais robustez'],
  ['H', 'H â€” mÃ¡ximo, para imprimir'],
];

const eccPdf417 = [
  ['0', '0 â€” 2 codewords. SÃ³ para texto que nunca se danifica'],
  ['1', '1 â€” 4 codewords'],
  ['2', '2 â€” 8 codewords (recomendado)'],
  ['3', '3 â€” 16 codewords'],
  ['4', '4 â€” 32 codewords, para imprimir'],
  ['5', '5 â€” 64 codewords'],
  ['6', '6 â€” 128 codewords'],
  ['7', '7 â€” 256 codewords'],
  ['8', '8 â€” 512 codewords. Enche o cÃ³digo de barras inÃºtil'],
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

  // Tenta manter o que lÃ¡ estava, para nÃ£o trocar de formato e perder a escolha.
  if (opcoes.some(([valor]) => valor === anterior)) dom.ecc.value = anterior;
}

/**
 * O que dizer ao utilizador sobre a imagem do logÃ³tipo.
 *
 * **O nÃºmero muda com a escala, e Ã© por isso que isto Ã© uma funÃ§Ã£o.** A escala
 * depende do tamanho pedido e da versÃ£o do QR, e ambas mudam enquanto o
 * utilizador escreve: o mesmo logÃ³tipo de 5 mÃ³dulos dÃ¡ uma caixa de 60Ã—60 px a
 * 512 e de 250Ã—250 a 2048. Uma mensagem escrita uma vez seria uma mentira em
 * metade dos casos, e a pessoa sÃ³ descobria a meio de imprimir.
 *
 * O que se diz tem os dois lados, porque as correÃ§Ãµes sÃ£o diferentes: uma
 * imagem pequena fica a serrilhada e o remÃ©dio Ã© fechÃ¡-la ou pÃ´r o logÃ³tipo
 * mais pequeno; uma grande nÃ£o Ã© problema nenhum, porque o browser reduz bem e
 * o ideal Ã© mesmo NÃ—N **mÃ³dulos**, onde jÃ¡ nÃ£o hÃ¡ resoluÃ§Ã£o a ganhar.
 */
/**
 * O nome de uma forma, para as mensagens.
 *
 * **Vem de `FORMAS`, que Ã© a lista do mÃ³dulo.** Escrever os nomes outra vez aqui
 * dava dois conjuntos que divergem em silÃªncio â€” e a `AGENTS.md` chama a isso
 * exatamente o que Ã©, com o exemplo do GS1-128: entrou no registo e nÃ£o
 * aparecia no selector.
 *
 * Uma forma desconhecida **nÃ£o dÃ¡ erro**: devolve o identificador, que Ã©
 * literal e ainda Ãºtil numa mensagem de erro. Dar `undefined` punha "undefined"
 * na tela, e a pessoa culparia a aplicaÃ§Ã£o por uma coisa que ela nÃ£o escolheu.
 */
function nomeDaForma(forma) {
  return (FORMAS.find(([id]) => id === forma) ?? [null, forma])[1];
}

/**
 * O que dizer ao utilizador sobre a imagem do logÃ³tipo.
 *
 * **O nÃºmero muda com a escala, e Ã© por isso que isto Ã© uma funÃ§Ã£o.** A escala
 * depende do tamanho pedido e da versÃ£o do QR, e ambas mudam enquanto o
 * utilizador escreve: o mesmo logÃ³tipo de 5 mÃ³dulos dÃ¡ uma caixa de 60Ã—60 px a
 * 512 e de 250Ã—250 a 2048. Uma mensagem escrita uma vez seria uma mentira em
 * metade dos casos, e a pessoa sÃ³ descobria a meio de imprimir.
 */
function dizerDoLogotipo(info, codigo, escala, modulos) {
  if (!dom.frame.checked || modulos === 0) {
    dom.ajudaFrameImagem.textContent =
      'Sem ficheiro, fica sÃ³ a Ã¡rea apagada â€” que Ã© o que o FieldQR estÃ¡ feito ' +
      'para: os dados dentro dela sÃ£o reconstruÃ­dos pela correÃ§Ã£o de erros.';
    return;
  }

  const { pix } = dimensaoDoLogotipo(modulos, escala);
  const ideal = `${pix}Ã—${pix} px (${modulos}Ã—${modulos} mÃ³dulos a ${escala} px por mÃ³dulo)`;
  const imagem = state.logotipo;

  if (!imagem) {
    dom.ajudaFrameImagem.textContent = `Escolhe uma imagem para pÃ´r no quadrado. A caixa Ã© ${ideal}.`;
    return;
  }

  const largura = imagem.naturalWidth;
  const altura = imagem.naturalHeight;
  const nome = state.nomeLogotipo;
  const medida = `${largura}Ã—${altura} px`;

  /*
   * A partir de `modulos` pÃ­xeis por lado jÃ¡ nÃ£o hÃ¡ nada a ganhar: um mÃ³dulo Ã©
   * o menor elemento do cÃ³digo, e ampliar mais sÃ³ repete pixels. O browser
   * reduz bem, por isso acima disso **nÃ£o hÃ¡ problema nenhum** â€” e dizer que hÃ¡
   * um mÃ¡ximo seria inventar uma restriÃ§Ã£o que nÃ£o existe. O aviso Ã© sÃ³ para
   * baixo, que Ã© onde a imagem Ã© esticada e o logotipo fica a serrilhado.
   *
   * A primeira versÃ£o dizia "estÃ¡ no tamanho certo â€” Ã© grande, e o browser
   * reduz", que Ã© uma frase que se contradiz a meio. O que interessa dizer Ã©
   * uma coisa sÃ³, e o resto Ã© silÃªncio.
   */
  if (largura < modulos || altura < modulos) {
    // **O nÃºmero que falta e' o da propria imagem.** A mensagem dizia "fecha-a
    // para 70x70 px", mas nao dizia *de* quantos pixeis, e quem tem de a
    // redimensionar e' quem vai ler a frase. `modulos` e' a medida em modulos e
    // `pix` em pixeis, e sao numeros diferentes: e' a confusao entre as duas
    // unidades que a `AGENTS.md` manda escrever nos dois termos.
    dom.ajudaFrameImagem.textContent =
      `${nome} tem ${medida}, e a caixa Ã© ${ideal} â€” ou seja ${pix}Ã—${pix} ` +
      `pÃ­xeis na imagem exportada. O logÃ³tipo Ã© menor do que a caixa, por isso ` +
      `vai ser esticado e fica a serrilhado â€” numa etiqueta pequena vÃª-se a um ` +
      `metro. Fecha a imagem para pelo menos ${pix}Ã—${pix} px, ou pÃµe um ` +
      `logÃ³tipo mais pequeno.`;
    return;
  }

  /*
   * Acima da medida ideal: **nao ha problema, e a razao importa.**
   *
   * A primeira versao dizia "estÃ¡ no tamanho certo â€” Ã© grande, e o browser
   * reduz", que e' uma frase que se contradiz a meio. A segunda so media a
   * folga e nao dizia nada sobre a resolucao. **As duas sao incompletas**: o
   * que a pessoa quer saber e' se o logÃ³tipo sai nitido na imagem exportada, e
   * isso responde-se com `escala` â€” quantos pixeis do logÃ³tipo caem num modulo.
   *
   * Um logÃ³tipo com 8 pixeis por modulo ja e' nitido a olho nu; com 4, cada
   * modulo e' um bloco de 4 pixeis da imagem original e o contorno treme.
   */
  const pxPorModulo = Math.min(largura, altura) / modulos;
  const nitido = pxPorModulo >= 8;
  const medidaPorModulo = `${pxPorModulo.toFixed(1)} px por mÃ³dulo`;

  dom.ajudaFrameImagem.textContent = nitido
    ? `${nome} tem ${medida}, e a caixa Ã© ${ideal}. A imagem dÃ¡ ` +
      `${medidaPorModulo}, o que Ã© nitido â€” e acima do necessÃ¡rio o browser ` +
      `reduz sem se ver, por isso pode ser mais grande sem problema.`
    : `${nome} tem ${medida}, e a caixa Ã© ${ideal}. A imagem dÃ¡ sÃ³ ` +
      `${medidaPorModulo}, e o contorno do logÃ³tipo pode tremer na imagem ` +
      `exportada. Acima de 8 px por mÃ³dulo jÃ¡ Ã© nitido; fecha a imagem para ` +
      `uns ${Math.ceil(modulos * 8)}Ã—${Math.ceil(modulos * 8)} px se quiser ` +
      `o melhor resultado.`;
}

/**
 * Carrega a imagem do logÃ³tipo.
 *
 * A imagem Ã© lida por `FileReader` e nÃ£o por um `<img>` escondido, porque o
 * que interessa Ã© a **dimensÃ£o natural** e um elemento no DOM pode ter sido
 * reescalado pelo CSS. A resoluÃ§Ã£o Ã© a Ãºnica coisa que decide se o logÃ³tipo
 * fica nÃ­tido, e Ã© a que se diz ao utilizador.
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
    dom.ajudaFrameImagem.textContent = `"${ficheiro.name}" nÃ£o Ã© uma imagem.`;
    mostrarErro(`"${ficheiro.name}" nÃ£o Ã© uma imagem. Escolhe um PNG, um JPEG ou um SVG.`);
    return;
  }

  const leitor = new FileReader();

  leitor.onload = () => {
    const imagem = new Image();
    imagem.onload = () => {
      state.logotipo = imagem;
      state.nomeLogotipo = ficheiro.name;
      // Um erro anterior pode estar a tapar o cÃ³digo, e agora jÃ¡ hÃ¡ cÃ³digo.
      dom.erro.hidden = true;
      atualizar();
    };
    imagem.onerror = () => {
      state.logotipo = null;
      state.nomeLogotipo = '';
      mostrarErro(`NÃ£o consegui ler "${ficheiro.name}". O ficheiro pode estar corrompido.`);
    };
    imagem.src = leitor.result;
  };

  leitor.onerror = () => {
    state.logotipo = null;
    state.nomeLogotipo = '';
    mostrarErro(`NÃ£o consegui ler "${ficheiro.name}".`);
  };

  leitor.readAsDataURL(ficheiro);
}

/**
 * Mostra e esconde o que sÃ³ faz sentido num dos formatos.
 *
 * A correÃ§Ã£o de erros Ã© o caso obvio: Ã© uma propriedade do QR, e um cÃ³digo de
 * barras nÃ£o tem. DeixÃ¡-la visÃ­vel e a fingir que funciona Ã© pior do que
 * escondÃª-la.
 *
 * O PDF417 complica: **tem** correÃ§Ã£o de erros, e Ã© a mais ajustÃ¡vel dos trÃªs
 * â€” nove nÃ­veis, de 0 a 8. Por isso o campo aparece, mas com o texto do PDF417
 * e nÃ£o o do QR, porque os nÃ­veis nÃ£o sÃ£o os mesmos e dizer "H â€” mÃ¡ximo" seria
 * mentira.
 */
function alternarFormato() {
  const qr = ehQr();
  const empilhado = ehPdf417();
  const matriz = ehDataMatrix();
  const cifrado = ehSqrc();

  /*
   * O painel do SQRC aparece e desaparece com o formato, e **Ã© a Ãºnica coisa que
   * muda**. O resto do formulÃ¡rio â€” a categoria, a correcÃ§Ã£o de erros, o
   * logÃ³tipo â€” Ã© o do QR, porque o desenho Ã© o do QR.
   *
   * A categoria fica visÃ­vel no SQRC **de propÃ³sito**: o conteÃºdo a cifrar Ã©
   * o que a pessoa escolheria para escrever num QR, e pedir texto solto seria
   * pedir duas vezes a mesma coisa.
   */
  dom.campoCategoria.hidden = !(qr || cifrado);
  dom.campoSqrc.hidden = !cifrado;

  // O campo de correÃ§Ã£o de erros serve para o QR e para o PDF417, cada um com
  // as suas opÃ§Ãµes. SÃ£o reconstruÃ­dos porque as opÃ§Ãµes sÃ£o diferentes e nÃ£o
  // vale a pena trocar os valores a meio.
  //
  // **O Data Matrix fica de fora, e nÃ£o por ser 2D.** Ã‰ que ele tem um Ãºnico
  // nÃ­vel, o ECC200, e nÃ£o se escolhe: o `dom.campoEcc` ficaria visÃ­vel com as
  // opÃ§Ãµes do PDF417, que sÃ£o nove, e nenhuma delas se aplicaria. Deixar um
  // campo de correÃ§Ã£o de erros que nÃ£o faz nada Ã© pior do que nÃ£o o ter â€” Ã© o
  // que a nota do `campoEcc` diz, e o Data Matrix Ã© o caso onde a tentaÃ§Ã£o de o
  // mostrar Ã© maior porque "Ã© 2D, como o QR".
  dom.campoEcc.hidden = !(qr || empilhado);
  if (qr) preencherEcc(eccQr);
  else if (empilhado) preencherEcc(eccPdf417);

  /*
   * O SQRC fica com a correcÃ§Ã£o de erros do QR, e a **razÃ£o Ã© a mesma do
   * logÃ³tipo**: um QR sem correcÃ§Ã£o de erros que apague um mÃ³dulo devolve
   * bytes errados, e num SQRC isso Ã© pior â€” quem lÃª recebe texto cifrado que
   * nÃ£o descifra, e o erro Ã© "chave errada" a apontar para o software.
   *
   * Por isso o logÃ³tipo **fica disponÃ­vel** no SQRC: apagar mÃ³dulos Ã©
   * exactamente o caso em que a correcÃ§Ã£o de erros faz o seu trabalho, e Ã© a
   * parte do QR que dÃ¡ mais jeito a quem pÃµe um logÃ³tipo numa etiqueta
   * cifrada.
   */
  dom.campoEcc.hidden = !(qr || empilhado || cifrado);
  if (qr || cifrado) preencherEcc(eccQr);
  else if (empilhado) preencherEcc(eccPdf417);

  dom.ajudaMargem.textContent = qr || cifrado
    ? 'A norma do QR pede 4. SÃ³ mexa se souber o que estÃ¡ a fazer.'
    : empilhado || matriz
      ? matriz
        ? 'O Data Matrix funciona com 0 ou 1. SÃ³ mexa se souber o que estÃ¡ a fazer.'
        : 'A norma do PDF417 pede 2. SÃ³ mexa se souber o que estÃ¡ a fazer.'
      : 'A ISO/IEC 15420 pede 10 mÃ³dulos. SÃ³ mexa se souber o que estÃ¡ a fazer.';

  // A margem do QR e do PDF417 vai de 0 a 8; a do cÃ³digo de barras Ã© bem maior, e
  // um campo que nÃ£o deixa escrever 10 seria mais uma coisa a explicar. A do
  // Data Matrix Ã© pequena como a do QR - ele tem guias, e a zona muda Ã© de 2.
  dom.margem.max = qr || empilhado || matriz || cifrado ? '8' : '20';
  if (!qr && !cifrado) dom.margem.value = empilhado || matriz ? '2' : '10';

  // O quadrado do logÃ³tipo Ã© um conceito do QR. Num cÃ³digo de barras nÃ£o hÃ¡
  // correÃ§Ã£o de erros que reconstrua o que se apaga, e o resultado seria um
  // cÃ³digo com um buraco no meio que ninguÃ©m lÃª.
  dom.campoFrame.hidden = !qr && !cifrado;

  dom.vazio.textContent = qr
    ? 'Preenche o conteÃºdo para o QR code aparecer aqui.'
    : cifrado
      ? 'Preenche o conteÃºdo e a chave para o SQRC aparecer aqui.'
      : empilhado
        ? 'Preenche o conteÃºdo para o PDF417 aparecer aqui.'
        : 'Preenche o cÃ³digo para as barras aparecerem aqui.';

  desenharCampos();
  atualizar();
}

// --- GeraÃ§Ã£o ---------------------------------------------------------------

/**
 * O caminho do PDF417.
 *
 * NÃ£o Ã© o do QR com outros valores, e tambÃ©m nÃ£o o do cÃ³digo de barras. Ã‰ uma
 * grelha de duas dimensÃµes, como o QR, mas o que se escreve dentro Ã© o texto
 * tal e qual â€” o PDF417 Ã© um transportador de texto, nÃ£o um gerador de tipos
 * como o QR, e nÃ£o hÃ¡ categorias nem payloads estruturados.
 *
 * **As linhas sÃ£o mais altas do que largas**, e Ã© o que o distingue Ã  primeira
 * vista. Um mÃ³dulo Ã© um mÃ³dulo quadrado num cÃ³digo de barras 1D e num QR, mas
 * no PDF417 a especificaÃ§Ã£o pede que a linha tenha cerca de trÃªs a quatro
 * vezes a altura do mÃ³dulo. Desenhar a grelha com mÃ³dulos quadrados dÃ¡ um
 * cÃ³digo que o leitor lÃª, e que nÃ£o parece com nenhum PDF417 do mundo â€” o que
 * Ã© sinal de que alguma coisa estÃ¡ errada antes de o ler.
 */
function atualizarPdf417() {
  const input = document.getElementById('campo-valor');
  const texto = input ? input.value : '';
  const nivel = Number(dom.ecc.value);
  const colunas = 6;

  if (texto.length === 0) {
    mostrarErro('Escreve alguma coisa para codificar.', 'Preenche o conteÃºdo para o PDF417 aparecer aqui.');
    return;
  }

  try {
    const codigo = pdf417(texto, { colunas, nivel });
    const margem = Math.min(20, Math.max(0, Number(dom.margem.value) || 2));
    const alvo = Math.max(64, Number(dom.tamanho.value) || 512);

    // O alvo Ã© a largura, como no QR. A escala em pÃ­xeis por mÃ³dulo sai da
    // largura, e a altura vem da razÃ£o das linhas.
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
    // no QR com o logÃ³tipo.
    state.qr = codigo;
    state.valido = true;
    dom.erro.hidden = true;
    dom.vazio.hidden = true;
    dom.acoes.hidden = false;
    dom.payload.textContent = texto;
    dom.contagem.textContent =
      `${codigo.linhas} linhas Ã— ${codigo.colunas} colunas Â· ` +
      `${codigo.palavras} codewords Â· ECC ${nivel} (${2 ** (nivel + 1)} de correcÃ§Ã£o) Â· ` +
      `${codigo.modules[0].length} mÃ³dulos de largura`;
  } catch (exception) {
    mostrarErro(exception.message || 'NÃ£o foi possÃ­vel gerar o PDF417.');
  }
}

/** A razÃ£o entre a altura e a largura de um mÃ³dulo no PDF417. */
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
  label.textContent = gs1 ? 'Campos GS1' : 'ConteÃºdo';

  const ajuda = document.createElement('p');
  ajuda.className = 'ajuda';
  ajuda.textContent = gs1
    ? 'Cada campo comeÃ§a por (AI) entre parÃªnteses. O (01) Ã© o GTIN de 14 ' +
      'dÃ­gitos, o (10) o lote e o (17) a validade, em AAMMDD. O quadradinho ' +
      'Ã© o que vai em ampolas de farmÃ¡cia e em chips â€” Ã© o cÃ³digo 2D mais ' +
      'denso que existe.'
    : 'Texto solto, sem AI. Para etiquetas de farmÃ¡cia e chips, o GS1 ' +
      'DataMatrix Ã© o certo: traz o GTIN, o lote e a validade juntos.';

  div.append(label, input, ajuda);
  dom.campos.append(div);
}

/**
 * O caminho do Data Matrix e do GS1 DataMatrix.
 *
 * **O Data Matrix Ã© o cÃ³digo 2D mais denso que existe**, e isso Ã© a razÃ£o de ele
 * ser pequeno e nÃ£o haver mush choices. Um sÃ­mbolo de 22Ã—22 leva 44 caracteres
 * de dados, que Ã© quase o que um QR de nÃ­vel L com a mesma informaÃ§Ã£o leva em
 * Ã¡rea. A razÃ£o Ã© a correÃ§Ã£o de erros: o ECC200 pÃµe atÃ© 62% do sÃ­mbolo em
 * codewords de correcÃ§Ã£o, trÃªs vezes mais do que o QR mais robusto, porque as
 * etiquetas sÃ£o pequenas e apanham inferno.
 *
 * O que ele nÃ£o tem sÃ£o os trÃªs padrÃµes de localizaÃ§Ã£o nos cantos que o QR tem.
 * A orientaÃ§Ã£o vem de duas guias em L. Ã‰ por isso que Ã© muito mais pequeno.
 */
function atualizarDataMatrix() {
  const input = document.getElementById('campo-valor');
  const texto = input ? input.value : '';

  if (texto.length === 0) {
    mostrarErro(
      'Escreve alguma coisa para codificar.',
      ehGs1DataMatrix()
        ? 'Preenche os campos GS1 para o cÃ³digo aparecer aqui.'
        : 'Preenche o conteÃºdo para o Data Matrix aparecer aqui.',
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
    // QR com o logÃ³tipo e no PDF417.
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
      ? `${codigo.campos.length} campos GS1 Â· ${codigo.separadores} FNC1 Â· ` +
        `${codigo.colunas}Ã—${codigo.linhas} mÃ³dulos Â· ${codigo.usado} de ` +
        `${codigo.capacidade} codewords`
      : `${codigo.colunas}Ã—${codigo.linhas} mÃ³dulos Â· ${codigo.usado} de ` +
        `${codigo.capacidade} codewords Â· ECC200`;
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
   * O SQRC Ã© o Ãºnico caminho que Ã© **assÃ­ncrono**, porque cifrar Ã© uma operaÃ§Ã£o
   * da Web Crypto e nÃ£o hÃ¡ versÃ£o sÃ­ncrona.
   *
   * E a razÃ£o de o `atualizar` nÃ£o poder simplesmente devolver: quem o chama
   * nÃ£o espera, e nÃ£o deve passar a esperar â€” um evento de `input` que
   * bloqueasse o fio a cada tecla seria um cliente que nÃ£o responde, e a
   * pessoa_notaria antes de eu perceber porquÃª.
   *
   * A alternativa â€” cifrar sÃ³ quando se carrega num botÃ£o â€” afasta a
   * prÃ©-visualizaÃ§Ã£o, e quem faz um QR quer ver o QR enquanto escreve. Por isso
   * a cifra corre a cada alteraÃ§Ã£o e o desenho espera por ela.
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

  // RelÃª os valores do DOM â€” a fonte da verdade Ã© o que o utilizador escreveu.
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
 *  - o **logotipo nao funcionava**. O `aplicarFrame` â€” que apaga os modulos
 *    para o logotipo caber â€” so era chamado no caminho do QR. No SQRC o painel
 *    aparecia, o cursor arrastava-se, e nao apagava nada. **Um campo que aceita
 *    ser mexido e que nao faz nada e' pior do que um campo que nao existe**,
 *    porque a pessoa acredita que funcionou e imprime;
 *  - e a proxima correccao no QR ia ter de ser feita **duas vezes**, e a
 *    segunda ficava para tras. E o que acontece com um caminho repetido.
 *
 * Por isso o SQRC calcula o payload e chama isto, e o que muda entre os dois
 * e' so o que entra no `state.payload` â€” que ja esta posto antes da chamada.
 *
 * ## O que este metodo sabe
 *
 * A versao que sai, o limite em bytes, a escala, a **zona apagada** do logotipo,
 * e o SVG com o logotipo dentro. Tudo isso e' igual nos dois, e e' por isso que
 * e' a mesma funcao.
 *
 * E a razao de o `ajudaFrame` sair daqui: **o limite do logotipo depende do
 * tamanho do codigo**, que so se sabe depois de codificar. Um SQRC tem a base64
 * maior do que o texto â€” a cifra acrescenta 28 bytes e a base64 cresce de 4/3 â€”
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
     * que o texto e' grande demais â€” e nao e'. E' a **cifra** que cresceu: 28
     * bytes de nonce e etiqueta, mais a base64 a 4/3. Por isso a mensagem diz
     * que e' a cifra, e nao repete o numero sem contexto.
     */
    const limite = MAX_BYTES[ecl];
    const usados = new TextEncoder().encode(payload).length;
    if (usados > limite) {
      mostrarErro(
        ehSqrc()
          ? `O conteÃºdo cifrado ocupa ${usados} bytes e o limite com ECC ${ecl} Ã© ${limite}. ` +
            'Ã‰ a cifra que cresceu, nÃ£o o teu texto: encurta o conteÃºdo.'
          : `O conteÃºdo ocupa ${usados} bytes e o limite com ECC ${ecl} Ã© ${limite}.`,
      );
      return;
    }

    // A escala sÃ³ pode ser calculada depois de saber quantos mÃ³dulos tem a
    // matriz. Com `ceil` o resultado nunca fica abaixo do tamanho pedido â€”
    // arredondar para baixo dava 456 px quando se pediu 512.
    const info = encode(payload, { ecl });

    /*
     * O quadrado do logotipo, se estiver ligado.
     *
     * O limite vem de `modulosMaximos`, que e' medido com o ZXing e nao deduzido
     * da percentagem teorica da norma â€” a teorica e' 4 a 6 vezes o que um QR
     * pequeno aguenta, e usa-la da logotipos que as vezes leem. O pior
     * resultado possivel, porque o defeito so aparece no cartao impresso.
     *
     * E a matriz apagada e' que vai para o desenho, por isso `draw` e `toSvg`
     * recebem `qr`: sem isso voltavam a codificar o texto de novo e a zona
     * desaparecia, sem dar erro nenhum.
     */
    let codigo = info;
    let zona = null;

    const forma = dom.frameForma.value || 'quadrado';
    const angulo = Number(dom.frameAngulo.value) || 0;
    const desloc = Number(dom.framePosicao.value) || 0;

    /*
     * **O limite Ã© por forma, e o cursor tem de o seguir.**
     *
     * A forma decide quantos mÃ³dulos se apagam, e isso decide se o cÃ³digo se lÃª.
     * O mesmo QR aguenta um logÃ³tipo maior em estrela do que em quadrado, e
     * dizer o nÃºmero do quadrado a quem escolheu uma redonda Ã© ser conservador
     * demais para quem escolheu a forma por ser mais legÃ­vel.
     */
    const maximo = modulosMaximos(info.size, ecl, undefined, forma);

    if (dom.frame.checked) {
      const pedido = Math.min(Number(dom.frameTamanho.value) || 0, maximo);

      if (pedido > 0) {
        codigo = aplicarFrame(info, { modulos: pedido, forma });
        zona = codigo.zona;
      }
    }

    /*
     * **Mover o logÃ³tipo aproxima-o dos padrÃµes de funÃ§Ã£o.**
     *
     * O deslocamento nÃ£o muda quantos mÃ³dulos se apagam â€” muda *quais* â€” e um
     * mÃ³dulo apagado Ã  mais junto de um padrÃ£o de localizaÃ§Ã£o vale por mais do
     * que um no meio. O limite Ã© por isso que desce de `maximo` para
     * `maximo - |desloc|` e nÃ£o fica no mesmo nÃºmero: **dar o mesmo limite para
     * a posiÃ§Ã£o 0 e para a 8 seria uma promessa que o leitor nÃ£o cumpre**, e o
     * sintoma seria um cÃ³digo que lÃª no ecrÃ£ e nÃ£o lÃª no cartÃ£o.
     */
    const limiteLogotipo = Math.max(0, maximo - Math.abs(desloc));

    // O cursor fica sempre no maior valor que ainda lÃª.
    dom.frameTamanho.max = String(maximo);
    if (Number(dom.frameTamanho.value) > maximo) {
      dom.frameTamanho.value = String(maximo);
    }
    if (Number(dom.frameTamanho.value) > limiteLogotipo) {
      dom.frameTamanho.value = String(limiteLogotipo);
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
      : maximo === 0
        ? `Neste cÃ³digo nÃ£o cabe um logÃ³tipo com ECC ${ecl}: a correÃ§Ã£o de ` +
          'erros nÃ£o tem mÃ³dulos a mais para reconstruir a zona. Suba para Q ou H.'
        : (limiteLogotipo < maximo
            ? `AtÃ© ${maximo} mÃ³dulos de lado em ${nomeDaForma(forma)}, ` +
              `mas com o logÃ³tipo a ${Math.abs(desloc)} mÃ³dulo${Math.abs(descol) === 1 ? '' : 's'} ` +
              `do centro sÃ³ atÃ© ${limite} â€” quanto mais longe do centro, ` +
              `mais perto dos padrÃµes de localizaÃ§Ã£o, e mais custa reconstruir.`
            : `AtÃ© ${maximo} mÃ³dulos de lado em ${nomeDaForma(forma)} com ECC ${ecl} ` +
              'neste cÃ³digo. Acima disso a correÃ§Ã£o de erros jÃ¡ nÃ£o chega.');

    /*
     * O Ã¢ngulo e a posiÃ§Ã£o **nÃ£o mexem em quantos mÃ³dulos se apagam** â€” mexem em
     * quais. Por isso que a mensagem do Ã¢ngulo diz o que ele faz e nÃ£o dÃ¡ um
     * limite: um logÃ³tipo rodado lÃª se o apagado Ã© o mesmo, e o teste com o
     * ZXing Ã© que diz se o rodado atrapalha.
     */
    dom.ajudaFrameAngulo.textContent = !dom.frame.checked
      ? ''
      : angulo === 0
        ? 'Sem rotaÃ§Ã£o.'
        : `Rodado ${angulo}Â°. O Ã¢ngulo nÃ£o muda os mÃ³dulos apagados, sÃ³ a ` +
          'posiÃ§Ã£o deles, e o conteÃºdo continua a ler-se. A roda Ã© Ã  volta do ' +
          'centro da Ã¡rea, nÃ£o da imagem.';

    dom.ajudaFramePosicao.textContent = !dom.frame.checked
      ? ''
      : desloc === 0
        ? 'No centro.'
        : `${desloc > 0 ? 'Ã€ direita' : 'Ã€ esquerda'} ${Math.abs(desloc)} ` +
          `mÃ³dulo${Math.abs(desloc) === 1 ? '' : 's'}. ` +
          'Mover o logÃ³tipo aproxima-o dos padrÃµes de localizaÃ§Ã£o, por isso o ' +
          'limite ao lado Ã© menor.';

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
         * do *codigo* e o canvas desenha a partir da *margem* â€” a mesma grelha
         * com origens diferentes.
         *
         * **A chamada passou `margem: border` durante muito tempo, e o nome
         * estava errado.** O `offset` ficava no seu valor por omissao de zero e
         * o logotipo saia `border` modulos para a esquerda e para cima: medido,
         * 40 px a 10 px por modulo, e o QR continuava a ler. Nenhum teste falhava
         * porque o codigo estava certo â€” so o desenho saia torto.
         *
         * E' o bug que a `AGENTS.md` descreve com "o logotipo saiu 4 modulos a
         * esquerda", e a correccao estava escrita no comentario **e** no sitio
         * errado. Um comentario que explica a armadilha e' inofensivo; o que
         * importa e' o nome do argumento, que e' o que o codigo le.
         */
        offset: border,
        /*
         * O ângulo vem do mesmo sítio que o SVG usa, e não de outro estado. **O
         * ângulo em dois sítios diferentes é um bug esperando**: o PNG saía com o
         * logótipo rodado e o SVG sem, e os dois ficheiros têm o mesmo nome.
         */
        angulo,
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
      `${info.size}Ã—${info.size} mÃ³dulos Â· versÃ£o ${info.version} Â· ` +
      `${usados} de ${limite} bytes (ECC ${ecl})` +
      (zona
        ? ` Â· ${codigo.apagados} mÃ³dulos apagados para o logotipo (${codigo.percentagem.toFixed(1)}%)`
        : '');
  } catch (exception) {
    mostrarErro(exception.message || 'NÃ£o foi possÃ­vel gerar o QR code.');
  }
}

/**
 * O caminho do SQRC: um QR com o conteÃºdo cifrado.
 *
 * ## A ordem Ã© o que interessa aqui, e nÃ£o Ã© a Ã³bvia
 *
 * O conteÃºdo Ã© lido, a chave Ã© lida, o conteÃºdo Ã© **cifrado**, e sÃ³ entÃ£o Ã© que
 * hÃ¡ payload. O payload do SQRC **nÃ£o Ã© o que a pessoa escreveu** â€” Ã© a base64
 * do contentor. E Ã© isso que vai para o campo de texto, para o PNG, para o SVG e
 * para o botÃ£o de copiar, que Ã© o que uma pessoa precisa de levar para outro
 * sÃ­tio.
 *
 * Se o payload fosse o texto original, o botÃ£o de cÃ³pia entregaria o segredo em
 * claro, e o QR desenhado seria uma coisa e o copiado outra. **Um SQRC cuja
 * exportaÃ§Ã£o nÃ£o Ã© o SQRC Ã© o pior dos dois.**
 *
 * ## Por que a chave vai para uma `CryptoKey` e nÃ£o para os bytes
 *
 * `crypto.subtle.importKey` nÃ£o aceita uma `CryptoKey` de outro sÃ­tio, e nÃ£o
 * guarda a chave em lado nenhum do nosso lado: a `CryptoKey` que este mÃ³dulo
 * tem Ã© a Ãºnica cÃ³pia, e vai para o lixo quando a funÃ§Ã£o acaba. O texto da
 * chave continua no campo â€” quem o escreve Ã© quem o tem.
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
   * **Uma chave vazia Ã© o estado inicial, nÃ£o um erro**, e pela mesma razÃ£o que
   * um campo de cÃ³digo de barras vazio nÃ£o Ã©: o aviso a vermelho em cima de um
   * formulÃ¡rio em branco Ã© ruÃ­do. A pessoa ainda nÃ£o fez nada de errado.
   *
   * Mas o aviso do painel â€” "sem a chave perdeste isto para sempre" â€” estÃ¡ lÃ¡
   * sempre, porque esse Ã© sobre o que vai acontecer, e nÃ£o sobre o que
   * aconteceu.
   */
  const textoChave = dom.sqrcChave.value;
  if (textoChave === '') {
    mostrarErro(null, 'Preenche a chave para o SQRC aparecer aqui.');
    return;
  }

  try {
    /*
     * **A chave sai de uma frase com PBKDF2, e nÃ£o de ser usada como bytes.**
     *
     * A DENSO especifica uma derivaÃ§Ã£o, e ela nÃ£o Ã© opcional: uma frase de 12
     * caracteres sÃ£o 12 bytes, e o AES-128 quer 16 ou 32. Usar os bytes da frase
     * directamente daria menos entropia do que parece e, pior, daria chaves
     * diferentes para frases com o mesmo comprimento â€” o que faria duas pessoas
     * com a mesma frase terem cÃ³digos que nÃ£o abrem um no outro.
     *
     * O sal Ã© fixo e o custo Ã© alto de propÃ³sito: o sal fixo Ã© porque quem tem
     * a frase e o cÃ³digo tem de dar a mesma chave, e o custo Ã© para que
     * adivinhar a frase a partir do cÃ³digo seja caro. **Aqui nÃ£o hÃ¡
     * armazenamento de senhas a proteger**, e por isso o custo Ã© o mesmo para
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
     * **O payload Ã© a base64 do contentor, e Ã© o que vai para tudo** â€” o canvas,
     * o SVG, a cÃ³pia e a partilha. Um Ãºnico valor, e Ã© o que a nota acima do
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
 * O caminho dos cÃ³digos de barras.
 *
 * NÃ£o Ã© o do QR com outros valores: um cÃ³digo de barras nÃ£o tem payload, nÃ£o
 * tem versÃ£o, nÃ£o tem correÃ§Ã£o de erros e nÃ£o tem limite de bytes. Tem um valor
 * e uma simbologia, e a validaÃ§Ã£o Ã© da prÃ³pria simbologia â€” estÃ¡ no registo em
 * `symbologies/index.js`, e Ã© lÃ¡ que vive a regra do nÃºmero de dÃ­gitos.
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
    // Um campo vazio nÃ£o Ã© um erro: Ã© o estado inicial. O aviso a vermelho de
    // "escreve alguma coisa" em cima de um formulÃ¡rio em branco Ã© apenas ruÃ­do.
    mostrarErro(null, 'Preenche o cÃ³digo para o ver aqui.');
    return;
  }

  try {
    const codigo = codificarLinear(dom.formato.value, valor);

    const targetPx = Math.max(64, Number(dom.tamanho.value) || 512);
    const margem = Math.min(20, Math.max(0, Number(dom.margem.value) || 10));

    /*
     * A escala Ã© calculada a partir do tamanho pedido e da largura que a
     * simbologia vai ter. `ceil` garante que nunca fica abaixo do pedido â€”
     * arredondar para baixo dava 508 px quando se pediu 512, e o utilizador
     * fica com uma imagem que nÃ£o pediu.
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
      `${simbologia.rotulo} Â· ${codigo.modules.length} mÃ³dulos Â· ` +
      `${d.pxLargura}Ã—${d.pxAltura} px Â· escala ${escala} px/mÃ³dulo`;
    dom.ajudaTamanho.textContent =
      'A altura segue a proporÃ§Ã£o que o leitor aguenta, e Ã© por isso que a ' +
      'imagem nÃ£o fica quadrada.';
  } catch (exception) {
    mostrarErro(exception.message || 'NÃ£o foi possÃ­vel gerar o cÃ³digo de barras.');
  }
}

/**
 * Mostra o estado de erro, ou o estado inicial quando nÃ£o hÃ¡ erro nenhum.
 *
 * `mensagem === null` nÃ£o Ã© um erro: Ã© o formulÃ¡rio ainda vazio. A diferenÃ§a
 * importa, porque pintar de vermelho um campo em branco que o utilizador ainda
 * nÃ£o preencheu Ã© ruÃ­do â€” e obriga a leitura de ecrÃ£ a anunciar um erro que
 * nÃ£o existe.
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
  dom.vazio.textContent = textoVazio ?? 'Preenche o conteÃºdo para o QR code aparecer aqui.';
  dom.vazio.hidden = false;
}

// --- Guardar, copiar, partilhar -------------------------------------------

function nomeFicheiro(extensao) {
  // O nome do ficheiro diz o que foi gerado. Um `qrcode-pix.png` que Ã© na
  // verdade um EAN-13 obriga a abrir o ficheiro para saber o que Ã©.
  const nome = ehQr() ? `qrcode-${dom.categoria.value}` : `codigo-${dom.formato.value}`;
  return `${nome}.${extensao}`;
}

/**
 * O PDF417 em SVG, com a mesma grelha que estÃ¡ no canvas.
 *
 * Sai da **mesma matriz**, e nÃ£o de codificar o texto outra vez. Ã‰ a mesma
 * razÃ£o do QR com o logÃ³tipo: se os dois ficheiros saÃ­ssem de codificaÃ§Ãµes
 * diferentes, o PNG e o SVG seriam cÃ³digos diferentes com o mesmo nome, e
 * ninguÃ©m saberia qual dos dois estÃ¡ certo.
 *
 * `shape-rendering="crispEdges"` Ã© o que impede o browser de pÃ´r mÃ³dulos
 * cinzentos nas margens entre eles. Num cÃ³digo de barras 2D isso Ã© a diferenÃ§a
 * entre se ler e nÃ£o se ler.
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
  // Espera antes de libertar: no Safari, revogar jÃ¡ durante o click
  // cancela a transferÃªncia.
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
   * A mesma matriz que estÃ¡ no canvas, e nÃ£o o payload outra vez.
   *
   * Sem isto, o PNG saÃ­a com o logÃ³tipo e o SVG saÃ­a sem ele â€” dois ficheiros
   * diferentes com o mesmo nome, e nenhum aviso. Guardar o `qr` em `state` Ã© o
   * que garante que os dois sÃ£o o mesmo cÃ³digo.
   *
   * E o logotipo vai embutido no SVG como uma imagem, senÃ£o o mesmo problema
   * numa forma diferente: o PNG com o logotipo e o SVG com o buraco.
   */
  const svg = toSvg(state.payload, {
    ecl: dom.ecc.value,
    border: opcoes().border,
    qr: state.qr,
    logotipo: state.logotipo,
    escala: state.escalaQr,
    zona: state.zonaFrame,
    /*
     * **O ângulo vai para o SVG, senão os dois ficheiros divergem.**
     *
     * O PNG sai do canvas, que roda com `translate` + `rotate`; o SVG sai de um
     * `transform`. **Um dos dois a rodar e o outro não dá dois ficheiros com o
     * mesmo nome e conteúdos diferentes** — que é o que o comentário logo acima
     * descreve, e que já aconteceu com o logotipo a desaparecer do SVG.
     */
    angulo: Number(dom.frameAngulo.value) || 0,
  });
  guardar(new Blob([svg], { type: 'image/svg+xml' }), nomeFicheiro('svg'));
}

/** `navigator.clipboard` sÃ³ existe em contexto seguro. */
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
    botao.textContent = 'NÃ£o foi possÃ­vel copiar';
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
    console.warn('Partilha indisponÃ­vel:', exception);
    guardarPng();
  }
}

// --- Arranque --------------------------------------------------------------

function registarServiceWorker() {
  // Em `file://` nÃ£o hÃ¡ service worker; registar dÃ¡ erro e polui a consola.
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;

  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.warn('Service worker nÃ£o registado:', error);
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
   * O `input` e nao o `change`: o cursor do logÃ³tipo arrasta-se, e com o
   * `change` o cÃ³digo sÃ³ se redesenhava no fim. Para um utilizador a arrastar
   * um cursor isso Ã© o cÃ³digo a ficar congelado enquanto se mexe, e a largura
   * das barras de tools nÃ£o justifica o custo â€” apagar mÃ³dulos Ã© barato, e
   * `aplicarFrame` sÃ³ percorre a zona.
   */
  dom.frame.addEventListener('change', atualizar);
  dom.frameTamanho.addEventListener('input', atualizar);
  dom.frameAngulo.addEventListener('input', atualizar);
  dom.framePosicao.addEventListener('input', atualizar);
  dom.frameForma.addEventListener('change', atualizar);

  /*
   * **As formas do selector sao as do modulo**, e nao uma lista escrita aqui.
   *
   * Sao dois conjuntos que precisam de estar de acordo â€” o que o selector
   * mostra e o que `frameqr.js` sabe desenhar â€” e a `AGENTS.md` chama a isso
   * "duas listas do mesmo conjunto a divergir em silencio", com o exemplo do
   * GS1-128: entrou no registo com o encoder, a validacao e os casos lidos pelo
   * ZXing, e nao aparecia no selector. **Sem sintoma e sem erro; a aplicacao
   * esta certa e a pessoa e' que nao consegue escolher.**
   */
  for (const [id, nome] of FORMAS) {
    const opcao = document.createElement('option');
    opcao.value = id;
    opcao.textContent = nome;
    dom.frameForma.append(opcao);
  }
  dom.frameFicheiro.addEventListener('change', () => {
    carregarLogotipo(dom.frameFicheiro.files[0]);
  });

  /*
   * Os campos do SQRC.
   *
   * **`input` e nao `change`**, como nos campos de conteÃºdo: quem escreve a
   * chave quer ver o cÃ³digo aparecer enquanto escreve. O custo Ã© uma cifra por
   * tecla, e o PBKDF2 a 210000 iteraÃ§Ãµes **nÃ£o Ã© barato** â€” mas Ã© a mesma cifra
   * que se faria ao carregar num botÃ£o, e aqui a pessoa vÃª o resultado em vez de
   * carregar em nada.
   *
   * O que muda Ã© a **espera**: sem um atraso, escrever uma frase de 20
   * caracteres dispara vinte cifras em fila, e as vinte desenham fora de ordem
   * â€” a que acaba primeiro desenha, e a que foi pedida primeiro fica por cima.
   * O sintoma Ã© o cÃ³digo piscar e o resultado final ser o de uma tecla atrÃ¡s.
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
   * **O botÃ£o escreve no campo, e nÃ£o aplica a chave.** Escrever no campo Ã© o
   * que deixa a pessoa ver o que tem, confirmar que o guardou, e mudar um
   * carÃ¡cter se discoversse um erro. Aplicar a chave direto deixava-a sem
   * maneira de a confirmar, e quem nÃ£o sabe qual Ã© a sua chave tem um problema
   * que nÃ£o tem soluÃ§Ã£o.
   *
   * E por isso que **nÃ£o vai para o histÃ³rico**: um botÃ£o de "nÃ£o te esqueÃ§as"
   * que pÃµe a chave no histÃ³rico do browser estÃ¡ a fazer o contrÃ¡rio do que
   * promete.
   */
  dom.sqrcGerarChave.addEventListener('click', () => {
    /*
     * **16 bytes de entropia, em base32 sem ambiguidade.**
     *
     * O alfabeto base32 sem `I`, `L`, `O` e `U` â€” os que se confundem com o
     * `1` e o `0`. Uma chave que a pessoa vai ler num ecrÃ£ e escrever num papel
     * nÃ£o pode ter caracteres que se confundem, porque o erro de transcriÃ§Ã£o Ã©
     * indetectÃ¡vel: dÃ¡ "chave errada", e ninguÃ©m sabe que foi um `1` por um `I`.
     *
     * E sÃ£o 16 bytes, nÃ£o 32: Ã© o tamanho que a DENSO especifica, e uma chave
     * de 256 bits numa frase que a pessoa tem de escrever Ã  mÃ£o nÃ£o Ã© mais
     * segura â€” Ã© mais difÃ­cil de acertar.
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

  // SÃ³ faz sentido oferecer "partilhar" onde a API existe.
  if (navigator.share) dom.btnPartilhar.hidden = false;

  window.addEventListener('resize', atualizar, { passive: true });
  atualizar();

  // O empacotador do ficheiro Ãºnico define __FICHEIRO_UNICO__: nesse caso nÃ£o
  // hÃ¡ sw.js ao lado e registÃ¡-lo sÃ³ provocaria um 404.
  if (typeof __FICHEIRO_UNICO__ === 'undefined') registarServiceWorker();
}

/** Copiar a imagem: a Clipboard API sÃ³ aceita texto em muitos browsers. */
async function copiarImagem(botao) {
  const original = botao.textContent;

  try {
    if (!navigator.clipboard || !window.ClipboardItem || !window.isSecureContext) {
      throw new Error('Clipboard de imagens indisponÃ­vel');
    }
    const blob = await new Promise((resolve) => dom.canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    botao.textContent = 'Copiado!';
  } catch {
    // Alternativa honesta: copiar o payload em texto, que Ã© o que a maioria
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
