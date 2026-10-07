// Compara as matrizes do Data Matrix do Java com as do Python.
//
//     node spec/paridade-java-datamatrix.mjs
//
// **E' uma script a parte do `paridade-java.mjs`, e nao mais um tipo no
// `STACKS`.** Um Data Matrix devolve uma matriz e nao uma lista de modulos: nao
// tem `guardas` - as guias em L ja estao na grelha - nem `legenda`, porque nao ha
// texto impresso por baixo.
//
// **Encaixar os dois no mesmo formato teria duas consequencias, e as duas ruins.**
// Com `guardas` e `legenda` a vazio, o script passava a comparar campos que nao
// medem nada. Com a matriz achatada numa lista, perdia-se a informacao de onde
// muda a linha, e uma divergencia dizia "o modulo 137" em vez de dizer
// "(linha 8, modulo 9)". **Um formato que nao descreve a coisa faz o teste medir
// outra coisa** - que e' o que a AGENTS.md regista com o ComboBox do C#.
//
// **Os casos vem do gerador do web, e nao de uma lista aqui.** Duas listas do
// mesmo conjunto divergem em silencio, e a `AGENTS.md` ja avisa do que acontece
// quando isso acontece: o Code 93 entrou com o encoder e nao com os casos.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Onde o gerador do web deixa os casos.
 *
 * **O nome **nao** pode ser `JSON`**: tapa o `JSON` global do modulo, e o
 * `JSON.parse` passa a ser a cadeia - o que da `TypeError: JSON.parse is not a
 * function` numa linha que parece correcta. O sintoma aponta para a biblioteca e
 * o problema e' uma constante.
 */
const FICHEIRO = join(AQUI, '..', 'web', 'tests', '.datamatrix.json');

/**
 * O Python, que e' a implementacao de referencia e por isso o arbrito.
 *
 * **O `sys.stdin` e' lido em UTF-8, e nao na codificacao da consola.** O
 * `sys.stdin` do Python usa a codificacao da locale, que no Windows e' cp1252, e
 * o Node escreve os casos em UTF-8. Um payload com acentos chegava partido, o
 * Python media um numero de codewords diferente, e a divergencia apontava para
 * o Java - **que estava certo**.
 *
 * **E' por isso que o sintoma e' uma divergencia, e nao um erro.** O script
 * funciona, os dois lados correm, e o unico sintoma e' que discordam em dois dos
 * doze casos: os dois com acentos. `sys.stdin.buffer` e' o que se deve ler
 * quando a outra ponta escreve em UTF-8.
 */
const PYTHON = `
import json, sys
sys.path.insert(0, "python")
from qrcode_core.simbologias.datamatrix import data_matrix

casos = json.loads(sys.stdin.buffer.read().decode("utf-8"))
saida = []

for texto in casos:
    c = data_matrix(texto)
    saida.append({
        "modulos": [[1 if m else 0 for m in linha] for linha in c["modulos"]],
        "colunas": c["colunas"],
        "linhas": c["linhas"],
        "dados": c["dados"],
        "correccao": c["correccao"],
        "usado": c["usado"],
    })

print(json.dumps(saida))
`;

/**
 * Corre o Java e le as matrizes em JSON.
 *
 * **Os casos vao por stdin, nunca por argumento.** Passar JSON num `argv` e'
 * fragil e ja falhou: o Git Bash faz expansao de chaves em `{"inicio":"B"}` e
 * parte o array ao meio. Por stdin nao ha shell a mexer no meio.
 */
function modulosDoJava(textos) {
  // O Git Bash e' o caminho no Windows; nos outros Sistemas o `bash` esta no
  // PATH. Tentar os dois evita a mensagem "o Java nao correu" num sitio em que
  // o Java esta bem instalado.
  const bash = process.platform === 'win32' &&
    existsSync('C:\\Program Files\\Git\\bin\\bash.exe')
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';

  const casos = textos.map((t) => ['datamatrix', t, {}]);

  const resultado = spawnSync(bash, ['build.sh', 'run-datamatrix'], {
    cwd: 'java',
    input: JSON.stringify(casos),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (resultado.status !== 0) {
    console.error(resultado.stderr || resultado.stdout);
    throw new Error('o Java nao correu');
  }

  return JSON.parse(resultado.stdout);
}

function modulosDoPython(textos) {
  const py = spawnSync('python', ['-c', PYTHON], {
    input: JSON.stringify(textos),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (py.status !== 0) {
    console.error(py.stderr);
    throw new Error('o Python nao correu');
  }

  return JSON.parse(py.stdout);
}

// --- os casos, que vem de uma fonte so ---------------------------------------

/**
 * Os payloads vem do gerador do web, e sao **executados de novo** em vez de
 * lidos do JSON de uma execucao anterior. O JSON e' um artefacto, e um artefacto
 * pode ser de uma versao do encoder que ja nao existe.
 */
function casosDoWeb() {
  if (!existsSync(FICHEIRO)) {
    const r = spawnSync(
      'node',
      [join(AQUI, '..', 'web', 'tests', 'gerar-datamatrix.mjs')],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      console.error(r.stderr);
      throw new Error('o gerador do web nao correu');
    }
  }

  return JSON.parse(readFileSync(FICHEIRO, 'utf8')).map((c) => c.payload);
}

// --- a comparacao ----------------------------------------------------------

/**
 * Diz onde dois casos divergem, e porque.
 *
 * **A comprimento vem primeiro, e o motivo nao e' o mesmo que o motivo do
 * modulo.** Um numero de linhas diferente e' uma tabela de simbolos diferente
 * - um erro de estrutura. Um modulo diferente e' a mesma estrutura com outro
 * conteudo - um erro de dado. Confundir os dois faz com que um erro de dado se
 * leia como um erro de estrutura, e a busca pelo culpado vai ao sitio errado.
 */
function divergencia(a, b) {
  for (const chave of ['colunas', 'linhas', 'dados', 'correccao', 'usado']) {
    if (a[chave] !== b[chave]) {
      return `DIVERGE (${chave}: python ${a[chave]}, java ${b[chave]})`;
    }
  }

  if (a.modulos.length !== b.modulos.length) {
    return `DIVERGE (${a.modulos.length} linhas no Python e ${b.modulos.length} no Java)`;
  }

  for (let y = 0; y < a.modulos.length; y++) {
    const pa = a.modulos[y];
    const pb = b.modulos[y];

    if (pa.length !== pb.length) {
      return `DIVERGE (a linha ${y} tem ${pa.length} colunas no Python e ${pb.length} no Java)`;
    }
    for (let x = 0; x < pa.length; x++) {
      if (pa[x] !== pb[x]) {
        return `DIVERGE (modulo (${y}, ${x}): python ${pa[x]}, java ${pb[x]})`;
      }
    }
  }

  return null;
}

function mostrar(texto, largura = 32) {
  return texto.slice(0, largura).padEnd(largura);
}

function principal() {
  const textos = casosDoWeb();
  console.log(`${textos.length} casos do encoder do web`);

  const doJava = modulosDoJava(textos);
  const doPython = modulosDoPython(textos);

  let falhas = 0;

  for (let i = 0; i < textos.length; i++) {
    const razao = divergencia(doPython[i], doJava[i]);

    if (razao === null) {
      console.log(
        `  ok    ${mostrar(textos[i])} ${doJava[i].linhas}x${doJava[i].colunas} ` +
          `dados ${doJava[i].usado}/${doJava[i].dados}`);
      continue;
    }

    console.log(`  ERRO  ${mostrar(textos[i])} ${razao}`);
    falhas += 1;
  }

  console.log(`\n${textos.length - falhas}/${textos.length} iguais ao Python.`);
  return falhas === 0 ? 0 : 1;
}

process.exitCode = principal();