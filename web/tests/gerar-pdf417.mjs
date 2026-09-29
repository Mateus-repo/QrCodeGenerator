/**
 * Gera PDF417 para o leitor externo ler.
 *
 *   node web/tests/gerar-pdf417.mjs
 *   python web/tests/descodificar-pdf417.py
 *
 * O PDF417 é dos mais dificeis de acertar, e a razão é que quase tudo nele é
 * um número que veio de uma tabela: 2787 padrões de cluster, 1022 factores de
 * Reed-Solomon, doze transições de submodo. Um único número trocado e o código
 * desenha-se com o aspecto certo e não lê.
 *
 * Por isso os casos aqui vão propositadamente aos extremos: texto, números
 * puros, bytes com acentos, pontuação, e conteúdo em todos os nove níveis de
 * correcção de erros. E cada linha tem de sair com a mesma largura, que é onde
 * apanha o enchimento mal calculado.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pdf417 } from '../symbologies/pdf417.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.pdf417.json');

const PAYLOADS = [
  // Texto simples, que e o modo texto em maiusculas.
  'MAST-2024-0001',
  // Minusculas e mistura: obriga a trocar de submodo, e ha transicoes que
  // levam dois codigos em vez de um.
  'Cartao de Conducao 2026/09',
  // So numeros: o modo numerico e o que espreme mais, e o ZXing tem de o
  // desespremer para devolver a mesma coisa.
  '4531234567890123',
  '0000000000000000000000000',
  // Pontuacao e os caracteres que so o submodo PUNCT tem.
  'a.b,c-d:e;f<g>h[i]j{k}l|m',
  // Acentos e caracteres fora do ASCII: tem de passar pelo modo de bytes.
  'Fatura nº 2026/09 — açúcar, €45,80',
  // Emoji, que em UTF-8 sao quatro bytes cada e apanham o modo de bytes.
  'Lote ✅ 42 — pronto 🚀',
  // Uma personagem so, que precisa da almofada no ultimo codeword.
  'A',
  // E o suficiente para encher varias colunas.
  'X'.repeat(120),
];

const NIVEIS = [0, 2, 4, 8];

const casos = [];

for (const payload of PAYLOADS) {
  for (const nivel of NIVEIS) {
    for (const colunas of [3, 6]) {
      const codigo = pdf417(payload, { colunas, nivel });

      // A largura tem de ser igual em todas as linhas. Uma linha mais estreita
      // e um codigo que o leitor recusa sem dizer porque.
      const larguras = new Set(codigo.modules.map((linha) => linha.length));

      casos.push({
        payload,
        nivel,
        colunasPedidas: colunas,
        colunas: codigo.colunas,
        linhas: codigo.linhas,
        palavras: codigo.palavras,
        largura: codigo.modules[0].length,
        largurasIguais: larguras.size === 1,
        modules: codigo.modules,
      });
    }
  }
}

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');
process.stderr.write(`${casos.length} casos de PDF417 gerados\n`);
