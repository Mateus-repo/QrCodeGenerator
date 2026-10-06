// Desenha cada forma, com angulo e posicao, e manda o ZXing ler.
//
//     node spec/verificar-formas.mjs
//     python spec/verificar-formas.py
//
// **Esta e' a pergunta que decide.** A `AGENTS.md` e' explicita: a
// percentagem de correccao de erros do QR nao e' o que limita o logotipo, e a
// razao e' que ela conta *codewords errados* e so vale com os erros espalhados
// por varios blocos. **Uma mancha apagada e' contigua, e uma mancha e' o pior
// caso** — por isso que um logotipo maior pode ler-se a um nivel de correccao
// que um menor nao le.
//
// **E a forma mexe na mancha.** O quadrado apaga mais area que a estrela na
// mesma caixa, e por isso que o limite tem de ser por forma. Esta script
// verifica o que a conta diz, com o leitor.
//
// **O que esta script NAO responde**, e o que responde o `descodificar-frameqr.py`:
// se o ficheiro exportado pelo browser se le. Aqui a matriz e' desenhada em Node.

import { writeFileSync, mkdirSync } from 'node:fs';
import { encode } from '../web/qrcode.js';
import { aplicarFrame, FORMAS, modulosMaximos } from '../web/frameqr.js';

mkdirSync('spec/_formas', { recursive: true });

const PAYLOAD = 'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';

const casos = [];

for (const ecl of ['M', 'Q', 'H']) {
  const info = encode(PAYLOAD, { ecl });

  for (const [forma] of FORMAS) {
    const maximo = modulosMaximos(info.size, ecl, 2, forma);
    if (maximo === 0) {
      casos.push({ ecl, forma, modulos: 0, matriz: null });
      continue;
    }

    // **O maior, a metade e um terço.** O maior é o caso limite e dá o pior
    // erro; um tamanho a meio pode ler-se ou não, e essa é a informação que
    // interessa — é onde está o limite real.
    for (const modulos of [...new Set([maximo, Math.floor(maximo * 0.6), Math.floor(maximo * 0.3)])].filter((v) => v > 0)) {
      const codigo = aplicarFrame(info, { modulos, forma });
      casos.push({
        ecl,
        forma,
        modulos,
        apagados: codigo.apagados,
        percentagem: Number(codigo.percentagem.toFixed(2)),
        tamanho: info.size,
        matriz: Array.from({ length: info.size }, (_, y) =>
          Array.from({ length: info.size }, (_, x) => (codigo.modules[y][x] ? 1 : 0)),
        ),
      });
    }
  }
}

// --- tambem com angulo e posicao, que sao as outras duas opcoes da DENSO ---
//
// **O angulo e a posicao nao mudam quantos modulos se apagam** — mudam quais.
// Por isso que a leitura e' a unica forma de saber, e por isso que estes casos
// entram com o mesmo peso. **Um logotipo rodado que tapa um padrao de
// localizacao le-se pior do que um logotipo grande**, e a unica diferenca e que
// o rodado parece mais com um logotipo.
const infoH = encode(PAYLOAD, { ecl: 'H' });
for (const [forma] of FORMAS) {
  const modulos = Math.max(1, Math.floor(modulosMaximos(infoH.size, 'H', 2, forma) * 0.6));

  for (const angulo of [0, 15, 30, 45]) {
    for (const [deslocX, deslocY] of [[0, 0], [3, 0], [0, -3]]) {
      const codigo = aplicarFrame(infoH, { modulos, forma, deslocX, deslocY });
      casos.push({
        ecl: `H/${angulo}deg`,
        forma,
        modulos,
        angulo,
        deslocX,
        deslocY,
        apagados: codigo.apagados,
        percentagem: Number(codigo.percentagem.toFixed(2)),
        tamanho: infoH.size,
        matriz: Array.from({ length: infoH.size }, (_, y) =>
          Array.from({ length: infoH.size }, (_, x) => (codigo.modules[y][x] ? 1 : 0)),
        ),
      });
    }
  }
}

writeFileSync('spec/_formas/casos.json', JSON.stringify(casos), 'utf8');
writeFileSync(
  'spec/_formas/payload.txt',
  PAYLOAD,
  'utf8',
);

console.log(`${casos.length} casos escritos em spec/_formas/casos.json`);
const comMatriz = casos.filter((c) => c.matriz);
console.log(`${comMatriz.length} com matriz`);