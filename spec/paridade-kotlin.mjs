// Compara os modulos do Kotlin com os do Python, para cada codigo de barras.
//
//     node spec/paridade-kotlin.mjs
//
// **Esta e' a comparacao que decide, e nao uma conta de modulos.** Duas
// implementacoes podem ter o comprimento certo e a silhueta errada, e so a
// comparacao dos modulos as distingue.
//
// **E nao ha um "quase".** Ou os modulos sao iguais, ou um dos dois esta errado
// e nao se sabe qual — e e' por isso que a lista de casos vem de uma fonte so:
// o `spec/verificar-lineares.py`, que ja tem os casos do ZXing.
//
// **Os casos sao os mesmos que o `spec/paridade-java.mjs` usa, e nao uma copia
// escrita a mao.** Duas listas de casos divergem em silencio, e cada uma fica
// com os casos que a sua stack passou — que e' o mecanismo exacto que deixou o
// Code 128 do Java sem os casos de troca de conjunto. Por isso que vem de um
// modulo com a lista, e nao de um array repetido.
//
// **O que este script nao faz:** mandar o ZXing ler o resultado do Kotlin. O
// ZXing le a matriz, e a matriz e' o que se compara aqui; a leitura esta nos
// testes do Kotlin, onde e' o encoder que desenha.

import { spawnSync } from 'node:child_process';
import { CASOS_BARRAS } from './casos-barras.mjs';

// --- as pontas --------------------------------------------------------------

/** O Python, que e' a implementacao de referencia e por isso o arbrito. */
const PYTHON = `
import json, sys
sys.path.insert(0, "python")
from qrcode_core.simbologias.lineares import codabar, code39, code128, itf, itf14

casos = json.load(sys.stdin)
saida = []

for tipo, texto, opcoes in casos:
    if tipo == "code39":
        c = code39(texto)
    elif tipo == "itf":
        c = itf(texto)
    elif tipo == "itf14":
        c = itf14(texto)
    elif tipo == "codabar":
        c = codabar(texto,
                    inicio=opcoes.get("inicio", "A"),
                    paragem=opcoes.get("paragem", "A"),
                    largo=opcoes.get("largo", False))
    elif tipo == "code128":
        c = code128(texto)
    else:
        raise SystemExit("tipo desconhecido: " + tipo)
    saida.append({"modulos": [1 if m else 0 for m in c["modulos"]],
                  "legenda": c["legenda"],
                  "guardas": list(c["guardas"])})

print(json.dumps(saida))
`;

/**
 * Corre o Kotlin e le os modulos em JSON.
 *
 * **Os casos vao por stdin, nunca por argumento.** Passar JSON num `argv` e'
 * fragil e ja falhou: o Git Bash faz expansao de chaves em `{"inicio":"B"}` e
 * parte o array ao meio, porque a virgula dentro das chaves parece uma lista.
 *
 * **E o `--quiet` nao e' cosmetica.** Sem ele o Gradle escreve o
 * `BUILD SUCCESSFUL` no mesmo stdout onde a ferramenta escreve o JSON, e o
 * `JSON.parse` falha numa linha que comeca por `B`. A falha aparece em Node e
 * a causa e' um `echo` do Gradle — o mesmo desvio que na stack Java, onde o
 * `==>` do core entrava na resposta.
 */
function modulosDoKotlin(casos) {
  const ehWindows = process.platform === 'win32';

  // **O `gradlew.bat` passa por `cmd.exe` em vez de `shell: true`.** Com
  // `shell: true` o Node concatena os argumentos sem os escapar e avisa com
  // `DEP0190` — e o aviso esta certo em principio, ainda que aqui os argumentos
  // sejam constantes. Passar pelo `cmd.exe` explicitamente faz o mesmo sem o
  // aviso e sem a concatenacao.
  const [comando, argumentos] = ehWindows
    ? [process.env.ComSpec || 'cmd.exe',
       ['/c', 'gradlew.bat', ':core:runLinear', '--console=plain', '--quiet']]
    : ['./gradlew', [':core:runLinear', '--console=plain', '--quiet']];

  const resultado = spawnSync(comando, argumentos, {
    cwd: 'kotlin',
    input: JSON.stringify(casos),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (resultado.status !== 0) {
    console.error(resultado.stderr || resultado.stdout);
    throw new Error('o Kotlin nao correu');
  }

  // O `--quiet` reduz a saida a uma linha, mas o Gradle pode acrescentar um
  // aviso em qualquer versao futura. Em vez de asumir, procura a ultima linha
  // que parece JSON — e se nao houver nenhuma, o erro diz o que veio.
  const linha = resultado.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('['))
    .pop();

  if (!linha) {
    console.error(resultado.stdout);
    throw new Error('o Kotlin nao devolveu JSON nenhum');
  }

  return JSON.parse(linha);
}

function modulosDoPython(casos) {
  const py = spawnSync('python', ['-c', PYTHON], {
    input: JSON.stringify(casos),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (py.status !== 0) {
    console.error(py.stderr);
    throw new Error('o Python nao correu');
  }

  return JSON.parse(py.stdout);
}

// --- a comparacao ----------------------------------------------------------

/**
 * Diz onde dois casos divergem, e porque.
 *
 * **O comprimento vem primeiro, e o motivo nao e' o mesmo que o motivo do
 * modulo.** Um comprimento diferente e' uma tabela ou uma moldura diferente — um
 * erro de estrutura. Um modulo diferente e' a mesma estrutura com outro
 * conteudo — um erro de dado. Confundir os dois faz com que um erro de dado se
 * leia como um erro de estrutura.
 */
function divergencia(a, b) {
  if (a.modulos.length !== b.modulos.length) {
    return `DIVERGE (comprimento ${a.modulos.length} vs ${b.modulos.length})`;
  }

  for (let i = 0; i < a.modulos.length; i++) {
    if (a.modulos[i] !== b.modulos[i]) {
      return `DIVERGE (modulo ${i}: python ${a.modulos[i]}, kotlin ${b.modulos[i]})`;
    }
  }

  if (a.legenda !== b.legenda) {
    return `DIVERGE (legenda: python "${a.legenda}", kotlin "${b.legenda}")`;
  }

  if (JSON.stringify(a.guardas) !== JSON.stringify(b.guardas)) {
    return `DIVERGE (guardas: python ${JSON.stringify(a.guardas)}, `
      + `kotlin ${JSON.stringify(b.guardas)})`;
  }

  return null;
}

const casos = CASOS_BARRAS.map(([tipo, texto, opcoes]) => [tipo, texto, opcoes]);

console.log(`${'caso'.padEnd(36)}${'modulos'.padStart(9)}  estado`);
console.log('-'.repeat(72));

const doPython = modulosDoPython(casos);
const doKotlin = modulosDoKotlin(casos);

if (doPython.length !== doKotlin.length || doPython.length !== casos.length) {
  console.error(`numero de resultados diferente: `
    + `${casos.length} casos, ${doPython.length} do Python, ${doKotlin.length} do Kotlin`);
  process.exit(1);
}

let problemas = 0;

for (let i = 0; i < casos.length; i++) {
  const [tipo, texto] = casos[i];
  const rotulo = `${tipo} ${texto}`.slice(0, 35);

  const problema = divergencia(doPython[i], doKotlin[i]);
  const modulos = String(doPython[i].modulos.length).padStart(9);

  if (problema) {
    problemas++;
    console.log(`${rotulo.padEnd(36)}${modulos}  ${problema}`);
  } else {
    console.log(`${rotulo.padEnd(36)}${modulos}  identicos`);
  }
}

console.log('-'.repeat(72));

const porTipo = {};
for (const [tipo] of casos) {
  porTipo[tipo] = (porTipo[tipo] || 0) + 1;
}
console.log(`${casos.length} casos: `
  + Object.entries(porTipo).map(([t, n]) => `${n} ${t}`).join(', '));

if (problemas) {
  console.error(`\n${problemas} caso(s) divergem. Um payload diferente num cliente `
    + 'e um bug, mesmo que o teste desse cliente passe.');
  process.exit(1);
}

console.log('Kotlin e Python dao os mesmos modulos.');
