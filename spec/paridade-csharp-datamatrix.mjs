// Compara as matrizes do Data Matrix do C# com as do Python.
//
//     node spec/paridade-csharp-datamatrix.mjs
//
// **E' um script a parte do `paridade-csharp.mjs`, e nao mais um tipo na lista
// partilhada.** Um Data Matrix devolve uma matriz e nao uma lista de modulos: nao
// tem `guardas` — as guias em L ja estao na grelha — nem `legenda`, porque nao ha
// texto impresso por baixo.
//
// **Encaixar os dois no mesmo formato teria duas consequencias, e as duas ruins.**
// Com `guardas` e `legenda` a vazio, o script passava a comparar campos que nao
// medem nada. Com a matriz achatada numa lista, perdia-se a informacao de onde
// muda a linha, e uma divergencia dizia "o modulo 137" em vez de dizer
// "(linha 8, modulo 9)". **Um formato que nao descreve a coisa faz o teste medir
// outra coisa** — que e' o que a AGENTS.md regista com o ComboBox do C#.
//
// **Os casos vem do gerador do web, e nao de uma lista aqui.** Duas listas do
// mesmo conjunto divergem em silencio, e a AGENTS.md ja avisa do que acontece
// quando isso acontece.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Onde o gerador do web deixa os casos.
 *
 * **O nome nao pode ser `JSON`**: tapa o `JSON` global do modulo, e o `JSON.parse`
 * passa a ser a cadeia — o que da `TypeError: JSON.parse is not a function` numa
 * linha que parece correcta.
 */
const FICHEIRO = join(AQUI, '..', 'web', 'tests', '.datamatrix.json');

/**
 * O Python, que e' a implementacao de referencia e por isso o arbrito.
 *
 * **O `sys.stdin.buffer` e' lido em UTF-8, e nao na codificacao da consola.** O
 * `sys.stdin` do Python usa a codificacao da locale, que no Windows e' cp1252, e o
 * Node escreve os casos em UTF-8. Um payload com acentos chegaria partido, o
 * Python mediria um numero de codewords diferente, e a divergencia apontava para o
 * C# — **que estava certo**.
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
 * Corre o C# e le as matrizes em JSON.
 *
 * **O `--datamatrix` e' um argumento do programa e nao um `tipo` nos casos**,
 * porque um Data Matrix devolve uma matriz e a forma da saida e' outra.
 *
 * **O `-v q --nologo` nao e' cosmetica.** Sem ele o `dotnet run` escreve o
 * `Build succeeded` no mesmo stdout onde a ferramenta escreve o JSON, e o
 * `JSON.parse` falha numa linha que comeca por `B` — a falha aparece no Node e a
 * causa e' o `dotnet run`.
 *
 * **E a linha que parece JSON e' procurada, e nao a ultima linha.** O `dotnet`
 * pode acrescentar um aviso em qualquer versao futura, e assumir a forma da
 * resposta e' assumir que nunca muda.
 */
function modulosDoCsharp(textos) {
  const resultado = spawnSync(
    'dotnet',
    [
      'run', '--project', 'csharp/tools/QrCodeGenerator.Tools.csproj',
      // **Sem `--nologo`, e nao por esquecimento.** Nao e' uma opcao do `dotnet
      // run` - e' uma do `dotnet build` - e por isso que o `dotnet run` a repassa
      // ao programa como se fosse argumento dele. Com a guarda do `Program`
      // estrita, um `--nologo` a mais dava um erro de uso em vez de um codigo.
      // O `-v q` e' a opcao que existe, e o `JSON.parse` abaixo ja procura a
      // linha que parece JSON em vez de assumir a forma da saida.
      '-v', 'q', '--', '--datamatrix',
    ],
    {
      input: JSON.stringify(textos.map((t) => ['datamatrix', t, {}])),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (resultado.status !== 0) {
    console.error(resultado.stderr || resultado.stdout);
    throw new Error('o C# nao correu');
  }

  const linha = resultado.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('['))
    .pop();

  if (!linha) {
    console.error(resultado.stdout);
    throw new Error('o C# nao devolveu JSON nenhum');
  }

  return JSON.parse(linha);
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
 * Os payloads vem do gerador do web, e sao **executados de novo** em vez de lidos
 * do JSON de uma execucao anterior. O JSON e' um artefacto, e um artefacto pode
 * ser de uma versao do encoder que ja nao existe.
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
 * modulo.** Um numero de linhas diferente e' uma tabela de simbolos diferente — um
 * erro de estrutura. Um modulo diferente e' a mesma estrutura com outro conteudo
 * — um erro de dado. Confundir os dois faz com que um erro de dado se leia como
 * um erro de estrutura, e a busca pelo culpado vai ao sitio errado.
 */
function divergencia(a, b) {
  for (const chave of ['colunas', 'linhas', 'dados', 'correccao', 'usado']) {
    if (a[chave] !== b[chave]) {
      return `DIVERGE (${chave}: python ${a[chave]}, csharp ${b[chave]})`;
    }
  }

  if (a.modulos.length !== b.modulos.length) {
    return `DIVERGE (${a.modulos.length} linhas no Python e ${b.modulos.length} no C#)`;
  }

  for (let y = 0; y < a.modulos.length; y++) {
    const pa = a.modulos[y];
    const pb = b.modulos[y];

    if (pa.length !== pb.length) {
      return `DIVERGE (a linha ${y} tem ${pa.length} colunas no Python e ${pb.length} no C#)`;
    }
    for (let x = 0; x < pa.length; x++) {
      if (pa[x] !== pb[x]) {
        return `DIVERGE (modulo (${y}, ${x}): python ${pa[x]}, csharp ${pb[x]})`;
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

  const doCsharp = modulosDoCsharp(textos);
  const doPython = modulosDoPython(textos);

  let falhas = 0;

  for (let i = 0; i < textos.length; i++) {
    const razao = divergencia(doPython[i], doCsharp[i]);

    if (razao === null) {
      console.log(
        `  ok    ${mostrar(textos[i])} ${doCsharp[i].linhas}x${doCsharp[i].colunas} ` +
          `dados ${doCsharp[i].usado}/${doCsharp[i].dados}`,
      );
      continue;
    }

    console.log(`  ERRO  ${mostrar(textos[i])} ${razao}`);
    falhas += 1;
  }

  console.log(`\n${textos.length - falhas}/${textos.length} iguais ao Python.`);
  return falhas === 0 ? 0 : 1;
}

process.exitCode = principal();