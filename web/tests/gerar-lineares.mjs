/**
 * Gera as matrizes dos codigos de barras lineares para o ZXing as ler.
 *
 * Este e o teste de nivel 2 dos lineares: em vez de comparar o que o encoder
 * produz com o que ele proprio diz, desenha-se a imagem e passa-se a um leitor
 * independente. O ZXing e a verdade; o encoder e aHipotese.
 *
 * Porquê importa: um codigo de barras pode ter a estrutura toda correcta e
 * nenhum digito na mesma posicao, e so aparece quando alguem o le. O
 * codigo do EAN-13 com a tabela de paridade trocada produz uma imagem com o
 * aspecto certo e um numero diferente.
 *
 * Este script escreve o ficheiro e nao escreve para a saida standard, por uma
 * razao pouco obvia: o `>` do Windows PowerShell 5.1 produz UTF-16 e nao UTF-8,
 * e o Python depois falha a ler o JSON. Sem o redireccionamento no caminho, o
 * problema nao existe.
 *
 *   node web/tests/gerar-lineares.mjs
 *   python web/tests/descodificar-lineares.py
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ean13, ean8, upcA, digitoDeControlo } from '../symbologies/upcean.js';
import { code128 } from '../symbologies/code128.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.lineares.json');

/**
 * Casos de teste.
 *
 * `esperado` e o que o LEITOR devolve, que nem sempre e o que esta escrito no
 * codigo: o Code 39 acrescenta um digito de controlo mod 43 e o leitor
 * descarta-o, e o UPC-A lido como EAN-13 volta com um zero a esquerda. E por
 * isso que a verificacao interna (que olha para o que foi codificado) e a
 * leitura (que olha para o que o ZXing devolve) sao coisas separadas.
 */
const CASOS = [
  // EAN-13. O primeiro e o exemplo classico de referencia; o digito de
  // controlo (1) esta calculado, nao escrito.
  { fn: ean13, entrada: '400638133393', esperado: '4006381333931', formato: 'EAN13', modulos: 95 },
  { fn: ean13, entrada: '590123412345', esperado: '5901234123457', formato: 'EAN13', modulos: 95 },
  { fn: ean13, entrada: '123456789012', esperado: '1234567890128', formato: 'EAN13', modulos: 95 },
  { fn: ean13, entrada: '000000000000', esperado: '0000000000000', formato: 'EAN13', modulos: 95 },
  { fn: ean13, entrada: '978030640615', esperado: '9780306406157', formato: 'EAN13', modulos: 95 },

  // EAN-8, o exemplo de referencia da Wikipedia.
  { fn: ean8, entrada: '9638507', esperado: '96385074', formato: 'EAN8', modulos: 67 },
  { fn: ean8, entrada: '2401234', esperado: '24012348', formato: 'EAN8', modulos: 67 },
  { fn: ean8, entrada: '0000000', esperado: '00000000', formato: 'EAN8', modulos: 67 },

  // UPC-A. Lido como EAN-13 devolve um 0 a esquerda; lido como UPC-A devolve os
  // 12 digitos. O teste aceita um dos dois conforme o que o leitor decidir,
  // porque os dois estao correctos.
  { fn: upcA, entrada: '03600029145', esperado: '036000291452', formato: 'UPCA', modulos: 95 },
  { fn: upcA, entrada: '01234567890', esperado: '012345678905', formato: 'UPCA', modulos: 95 },

  // Code 128. O unico que codifica os 128 caracteres ASCII, e o das etiquetas
  // de encomenda. Os casos cobrem os tres conjuntos: letras (B), digitos em
  // numero par (C), a virada dos dois, e texto com pontuacao.
  { fn: code128, entrada: 'ABC123', esperado: 'ABC123', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: '1234567890', esperado: '1234567890', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: 'MAST-2024-0001', esperado: 'MAST-2024-0001', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: 'ABC1234567890DEF', esperado: 'ABC1234567890DEF', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: 'a', esperado: 'a', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: '9', esperado: '9', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: '!@#$%^&*()', esperado: '!@#$%^&*()', formato: 'Code128', modulos: 0 },
  { fn: code128, entrada: 'PT-1500-2745-9871', esperado: 'PT-1500-2745-9871', formato: 'Code128', modulos: 0 },

  // Code 39. O ZXing devolve o texto sem o digito de controlo, por isso o
  // esperado e o que foi escrito e nao o que foi codificado.


];

const casos = CASOS.map((caso, i) => {
  const codigo = caso.fn(caso.entrada);
  return {
    indice: i,
    entrada: caso.entrada,
    /** O que o leitor devolve. */
    esperado: caso.esperado,
    /** O que esta realmente codificado no codigo, digitos de controlo incluidos. */
    codificado: caso.codificado ?? caso.esperado,
    formato: caso.formato,
    modulosEsperados: caso.modulos,
    symbology: codigo.symbology,
    caption: codigo.caption,
    modules: codigo.modules,
    guards: codigo.guards,
  };
});

writeFileSync(SAIDA, JSON.stringify(casos), 'utf8');

/**
 * Verificacao interna, antes de sair para o ZXing.
 *
 * Se o encoder errar aqui, nem vale a pena gerar a imagem. E mais rapido de
 * diagnosticar do que andar a caçar um erro de leitura.
 */
const problemas = [];
for (const caso of casos) {
  if (caso.caption !== caso.codificado) {
    problemas.push(
      `${caso.symbology} ${caso.entrada}: caption "${caso.caption}" != "${caso.codificado}"`,
    );
  }

  // O numero de modulos so se compara quando o caso o declara. O Code 128
  // fica de fora porque o comprimento depende do texto e do conjunto escolhido,
  // e nao ha um numero unico para confirmar.
  if (caso.modulosEsperados > 0 && caso.modules.length !== caso.modulosEsperados) {
    problemas.push(
      `${caso.symbology} ${caso.entrada}: ${caso.modules.length} modulos, ` +
        `esperados ${caso.modulosEsperados}`,
    );
  }

  /*
   * A guarda de inicio tem de ser uma barra escura, ou nenhum leitor
   * encontra o codigo.
   *
   * So a familia UPC/EAN fecha com barra, porque a guarda final e 101. Os
   * outros codigos fecham com o espaco do ultimo elemento do caractere de
   * paragem, e isso e correcto — e por isso que esta regra nao se generaliza
   * sem-checking: cada familia tem a sua regra de fecho.
   */
  if (caso.modules[0] !== true) {
    problemas.push(`${caso.symbology} ${caso.entrada}: nao comeca com barra`);
  }

  const fechaComBarra = caso.symbology.startsWith('EAN') || caso.symbology.startsWith('UPC');
  if (fechaComBarra && caso.modules[caso.modules.length - 1] !== true) {
    problemas.push(`${caso.symbology} ${caso.entrada}: a guarda final devia ser uma barra`);
  }
}

if (problemas.length > 0) {
  for (const p of problemas) process.stderr.write(`FALHA ${p}\n`);
  process.exit(1);
}

process.stderr.write(`${casos.length} casos de codigos de barras gerados\n`);
