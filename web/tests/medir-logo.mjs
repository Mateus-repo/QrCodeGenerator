/**
 * O logo do projecto cabe num QR, e ate que tamanho?
 *
 *     node web/tests/medir-logo.mjs
 *
 * Gera, para cada nivel de correccao e cada tamanho de logo, um QR **com o logo do
 * projecto desenhado na zona apagada** — e nao so com a zona apagada, que e' o que o
 * `varredura-frameqr.mjs` faz.
 *
 * ## Porque isto e' uma medicao e nao uma conta
 *
 * **A percentagem de correccao de erros do QR (4% a L, 24% a H) nao e' uma
 * percentagem de area.** E' de *codewords* errados, e so vale com os erros espalhados
 * por varios blocos. Num QR pequeno ha poucos codewords — a versao 2 a nivel M tem um
 * so bloco — e uma mancha de logotipo e' contigua, pelo que toca muitos codewords de
 * uma vez. **Medido com o ZXing, a teorica e' 4 a 6 vezes o que um QR pequeno
 * aguenta.** E' o que o `AGENTS.md` avisa, e a razao de os valores em `frameqr.js`
 * serem medidos e nao da norma.
 *
 * ## E este logo e' o pior dos dois casos
 *
 *  - **fundo gradiente escuro** (`#1e3a8a` -> `#0b1220`): e' escuro contra o preto do
 *    QR, e nao claro — o contraste na zona apagada e' o *menor* possivel;
 *  - **cantos arredondados** (`rx=112` em 512): a forma nao enche a caixa, e o leitor
 *    ve uma borda de fundo escuro entre o logo e o branco;
 *  - **leva o padrao de localizacao desenhado dentro de si**: o logo tem tres
 *    quadradinhos de QR dentro, e a 6 modulos juntam-se com os do QR a volta.
 *
 * Qualquer um destes, por si, empurra o limite para baixo. A medicao e' que diz ate
 * onde.
 *
 * ## O que este script NAO faz
 *
 * **Nao decide o que meter nas apps.** Mede. A decisao — se o logo do projecto entra
 * como omissao ou se cada pessoa carrega o seu — e' outra, e e' do dono do projecto.
 * O que este script responde e' "o logo do projecto cabe num QR, e ate que tamanho",
 * que e' a premissa de que a decisao depende.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encode } from '../qrcode.js';
import { aplicarFrame } from '../frameqr.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const SAIDA = join(AQUI, '.logo.json');

const PAYLOAD = 'https://qrcodegenerator.example/pt/ferramenta-local-aberta';

/**
 * O logo, em PNG, como o `frameqr.js` o quer.
 *
 * **O `drawImage` do canvas nao sabe ler SVG** — precisa de um bitmap com
 * `naturalWidth`. E' por isso que o ficheiro do logo tem duas versoes, e a que entra
 * no QR e' o PNG.
 *
 * O PNG vai embutido em base64 no JSON, e nao em disco: o script Python le este
 * ficheiro e precisa da imagem **no mesmo sitio**, e um ficheiro a meio caminho
 * entre os dois e' uma coisa que pode faltar sem ninguem dar por isso.
 */
const LOGO_PNG = readFileSync(join(RAIZ, 'logo', 'qrcodegenerator-logo-512x512.png'));
const LOGO_BASE64 = LOGO_PNG.toString('base64');

const NIVEIS = ['L', 'M', 'Q', 'H'];

const casos = [];

for (const ecl of NIVEIS) {
  const qr = encode(PAYLOAD, { ecl });

  // De 3 (o minimo util) a 9 modulos, de um em um. **Ate 9 e' acima do tecto
  // teorico** de proposito: a medicao tem de encontrar onde se perde, e um tecto
  // que ja sabe o sitio nao e' uma medicao.
  for (let modulos = 3; modulos <= 9; modulos += 1) {
    const codigo = aplicarFrame(qr, { modulos, margemMinima: 2 });

    casos.push({
      payload: PAYLOAD,
      ecl,
      modulosPedidos: modulos,
      size: qr.size,
      version: qr.version,
      modulosApagados: codigo.apagados,
      percentagem: Number(codigo.percentagem.toFixed(2)),
      // `Array.from` e' obrigatorio: a matriz e' um array de `Uint8Array`, e o
      // `JSON.stringify` serializa uma `Uint8Array` como objecto. No Python isso
      // chega como dicionario, onde `'0'` e' verdadeiro e o QR sai todo preto.
      modules: codigo.modules.map((linha) => Array.from(linha, (m) => (m ? 1 : 0))),
      // **O logo vai com cada caso**, porque e' o mesmo para todos e assim o Python
      // nao depende de ler um ficheiro de imagem.
      logo: LOGO_BASE64,
    });
  }
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(
  `  ${casos.length} casos com o logo do projecto (${NIVEIS.join(', ')})\n`,
);