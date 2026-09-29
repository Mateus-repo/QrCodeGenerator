/**
 * Gera `web/assets/icon.svg` a partir de um QR **que este repositorio produz**.
 *
 *     node web/tools/gerar-icone.mjs
 *
 * ## Porque e' que o icone se gerava
 *
 * O `icon.svg` que estava no repositorio **nao era um QR valido**. Tinha os
 * tres cantos com um quadrado 7x7 cheio e o padrao de baixo-direito inexistente
 * — parecia um QR e **nenhuma camera o lia**. Num icone de um gerador de QR, e'
 * o pior resultado possivel: parece correcto e falha so quando alguem aponta
 * uma camera para ele.
 *
 * E o `descodificar-icones.py` e' que o apanhou, com o ZXing, a dizer que nao le.
 * A conta de modulos nao apanhava: **o icone tinha 302 modulos escuros**, e
 * qualquer verificacao que contam modulos passa.
 *
 * ## Porque o icone tem de ser um QR e nao um desenho
 *
 * **Porque o icone e' o unico sitio onde o produto se mostra a si proprio.** Um
 * gerador de QR com um icone que nao e' um QR esta a dizer que sabe fazer uma
 * coisa que nao sabe.
 *
 * E ha uma razao pratica: **este gerador tem um encoder de QR verificado pelo
 * ZXing**, e nao ha razao para o icone ser outra coisa. O `toSvg` daqui e' a
 * mesma matriz que vai para o canvas e para o PNG, e por isso que o icone **e' o
 * que o site produz** — e nao uma aproximacao feita a mao que pode divergir
 * num modulo e dar um icone que nao le.
 *
 * ## O que o icone codifica
 *
 * O endereco do proprio site, porque e' o que faz sentido num icone: quem
 * aponta uma camera para ele num telefone chega ao gerador. E o `descodificar-
 * icones.py` tem a mesma constante, para comparar com o que o leitor devolve.
 *
 * **O texto codificado e' uma decisao e nao um detalhe.** Um icone que codifica
 * `https://exemplo.pt/qrcode-generator` e' um QR que **faz alguma coisa**; um
 * icone que codifica texto solto e' um QR que nao serve para nada, e ensobrar
 * o telefone a ler e' a pior forma de o descobrir.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toSvg } from '../qrcode.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = join(AQUI, '..');
const DESTINO = join(WEB, 'assets', 'icon.svg');

/** O que o icone codifica. Tem de bater com a constante do `descodificar-icones.py`. */
const TEXTO = 'https://exemplo.pt/qrcode-generator';

/** O nivel de correccao. H porque o icone e' pequeno e lido a pouca distancia. */
const ECC = 'H';

/*
 * A zona calma do QR, em modulos.
 *
 * **Sao 4, a pedir da ISO/IEC 18004, e o `toSvg` ja os põe.** E a razao de o
 * icone gerado pelo encoder ler e o desenhado a mao nao ler: o desenho antigo
 * tinha 1 modulo de margem, e o ZXing precisa de 4 para encontrar o codigo.
 *
 * A margem do `maskable` e' outra coisa, e e' do PNG — ver o `gerar-icones.py`.
 */
const svg = toSvg(TEXTO, { ecLevel: ECC, border: 4 });

writeFileSync(DESTINO, svg, 'utf8');
const kb = round(svg.length / 1024, 1);
console.log(`${DESTINO} (${kb} KB)`);
console.log(`  codifica: ${TEXTO}`);
console.log('  o ZXing tem de o ler — corre: python web/tests/descodificar-icones.py');

function round(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}
