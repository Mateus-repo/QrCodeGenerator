// Verifica a zona apagada do FieldQR contra a mascara de funcao, e le o
// resultado com o ZXing.
//
//     node spec/verificar-zona-frameqr.mjs
//     python spec/verificar-zona-frameqr.py
//
// **O que se verifica, e porquê que cada uma das coisas e' uma pergunta
// diferente:**
//
//  1. **A zona toca nos padrões de função?** Os três padrões de localização, os
//     de temporização, o de formato e os de alinhamento. Tocar num deles
//     estraga o código e o leitor recusa-o — e o sintoma é visível, o que é
//     raro.
//
//  2. **A zona é simétrica?** `Math.floor((tamanho - modulos) / 2)` num
//     tamanho ímpar deixa a zona mais para a esquerda de meio módulo. Num
//     tamanho par é exacta. **O `modulosMaximos` já obriga a que a zona caiba
//     entre os padrões**, mas isso é uma conta; o que interessa é a grelha.
//
//  3. **O código continua a ler?** A pergunta que decide. Tudo o resto é
//     estrutura, e a estrutura passa com erros que a leitura apanha — é o que
//     a `AGENTS.md` repete até cansar.

import { writeFileSync } from 'node:fs';
import { encode } from '../web/qrcode.js';
import { aplicarFrame, modulosMaximos } from '../web/frameqr.js';

/**
 * A máscara de função, **importada do próprio `frameqr.js`**.
 *
 * ## Porque este script não a reimplementa
 *
 * A primeira versão tinha uma cópia de `mascaraDeFuncao` escrita aqui, e
 * deu **13 "problemas" em 30 zonas** — todos falsos. A cópia protectava os
 * padrões de localização mas não os separadores, nem a informação de versão, e
 * por isso contava como apagáveis 17 módulos que o `aplicarFrame` protegia.
 *
 * **É a mesma armadilha que a `AGENTS.md` descreve com o Code 39:** duas
 * listas do mesmo conjunto, escritas duas vezes, que divergem em silêncio. A
 * cópia aqui não era uma lista, era uma *implementação*, e divergiu da mesma
 * maneira — e o sintoma foi um verificador que dá 13 alarme falsos, que é
 * pior do que não ter verificador nenhum porque se aprende a ignorá-lo.
 *
 * E `mascaraDeFuncao` não é exportada. **A exportação é o que este script
 * precisa**, e é a razão de o ficheiro acabar num commit.
 */
import { mascaraDeFuncao } from '../web/frameqr.js';

const PAYLOADS = [
  'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande',
  'A',
  'https://exemplo.pt',
  'x'.repeat(300),
];

const saida = [];
let problemas = 0;

for (const ecl of ['L', 'M', 'Q', 'H']) {
  for (const payload of PAYLOADS) {
    const info = encode(payload, { ecl });
    const maximo = modulosMaximos(info.size, ecl);

    if (maximo === 0) {
      saida.push({ ecl, tamanho: info.size, maximo, nota: 'sem logotipo' });
      continue;
    }

    // **Todos os tamanhos de logo possíveis, não só o maior.** O maior é o
    // caso limite, e é o que dá o pior erro de margem — mas um tamanho a meio
    // pode estar mal centrado num tamanho ímpar e o maior não.
    for (const modulos of [1, Math.floor(maximo / 2), maximo].filter((v, i, a) => v > 0 && a.indexOf(v) === i)) {
      const codigo = aplicarFrame(info, { modulos });
      const z = codigo.zona;
      const reservado = mascaraDeFuncao(info.size, info.version);

      // --- a zona toca na máscara? ---
      let tocaFuncao = 0;
      for (let y = z.inicio - 2; y < z.fim + 2; y++) {
        for (let x = z.inicio - 2; x < z.fim + 2; x++) {
          if (x < 0 || y < 0 || x >= info.size || y >= info.size) continue;
          if (reservado[y][x] && !codigo.modules[y][x] && info.modules[y][x]) {
            // Só conta se apagou o que era escuro **e** era de função.
            tocaFuncao++;
          }
        }
      }

      // --- a zona é simétrica? ---
      const esquerda = z.inicio;
      const direita = info.size - z.fim;
      const simetrica = esquerda === direita;

      // --- o que se apaga é mesmo o que se conta? ---
      let apagadosEsperados = 0;
      for (let y = z.inicio - 2; y < z.fim + 2; y++) {
        for (let x = z.inicio - 2; x < z.fim + 2; x++) {
          if (x < 0 || y < 0 || x >= info.size || y >= info.size) continue;
          if (reservado[y][x]) continue;
          if (info.modules[y][x]) apagadosEsperados++;
        }
      }

      const linha = {
        ecl,
        tamanho: info.size,
        versao: info.version,
        modulos,
        maximo,
        zona: { inicio: z.inicio, fim: z.fim },
        margens: { esquerda, direita, topo: z.inicio, base: info.size - z.fim },
        simetrica,
        tocaFuncao,
        apagados: codigo.apagados,
        apagadosEsperados,
        percentagem: Number(codigo.percentagem.toFixed(2)),
      };

      if (!simetrica || tocaFuncao > 0 || codigo.apagados !== apagadosEsperados) {
        problemas++;
        linha.PROBLEMA = true;
      }

      saida.push(linha);

      // A matriz, para o Python mandar ao ZXing.
      //
      // **Cada linha da matriz e' um objecto com as chaves "0", "1", ... e nao
      // um array**, porque e' assim que o `encode()` do web a devolve.
      //
      // Um `linha.map(...)` sobre um objecto da o que o `Array.prototype.map`
      // faz com um objecto, que e' um array de `[chave, valor]`. O
      // `JSON.stringify` escrevia `{"0":1,"1":1,...}` e o Python lia um
      // dicionario — vinte e dois "NAO LEU" e uma percentagem de 0,0%.
      //
      // **`Array.from({ length: n }, ...)` e' a conversao explicita**, e e' o
      // que separa um array de um objecto. O sintoma apontava para o sitio
      // certo: uma percentagem de apagamento a zero, com uma zona apagada,
      // significa que a leitura e' que falhou — nao que nao se apagou nada.
      const n = info.size;
      const matriz = Array.from({ length: n }, (_, y) =>
        Array.from({ length: n }, (_, x) => (codigo.modules[y][x] ? 1 : 0)),
      );

      writeFileSync(
        `spec/_frameqr-${ecl}-${info.size}-${modulos}.json`,
        JSON.stringify({
          modulos: info.size,
          escala: 4,
          borda: 4,
          matriz,
          // **A percentagem de apagados e' a que o `aplicarFrame` calculou**,
          // e nao a contagem de zeros da matriz: metade dos modulos de um QR
          // ja e' clara, e um zero nao e' um modulo apagado. Voltar a contar
          // aqui, sem a mascara de funcao em maos, seria refazer a conta a
          // pior.
          apagados: codigo.apagados,
          percentagem: Number(codigo.percentagem.toFixed(2)),
          payload,
          ecl,
        }),
        'utf8',
      );
    }
  }
}

writeFileSync('spec/_zona-frameqr.json', JSON.stringify(saida, null, 1), 'utf8');

console.log(`${saida.length} zonas verificadas, ${problemas} com problema`);
for (const l of saida.filter((x) => x.PROBLEMA).slice(0, 12)) {
  console.log(`  ${l.ecl} ${l.tamanho}x${l.tamanho} mod=${l.modulos} ` +
    `margens=${JSON.stringify(l.margens)} tocaFuncao=${l.tocaFuncao} ` +
    `apagados=${l.apagados}/${l.apagadosEsperados}`);
}
if (problemas === 0) console.log('nenhuma zona toca nos padrões de função, e todas são simétricas');