// Compara os modulos do C# com os do Python, para cada codigo de barras.
//
//     node spec/paridade-csharp.mjs
//
// **Esta e' a comparacao que decide, e nao uma conta de modulos.** Duas
// implementacoes podem ter o comprimento certo e a silhueta errada, e so a
// comparacao dos modulos as distingue.
//
// **E nao ha um "quase".** Ou os modulos sao iguais, ou um dos dois esta errado
// e nao se sabe qual.
//
// **Os casos vem de `casos-barras.mjs**, o mesmo modulo que usam o
// `paridade-java.mjs` e o `paridade-kotlin.mjs`. **Uma lista so, e nao uma por
// script:** duas listas divergem em silencio, e cada uma fica com os casos que a
// sua stack passou — que e' como o Code 128 do Java ficou sem os casos de troca
// de conjunto.
//
// **O que este script nao faz:** mandar o ZXing ler o resultado do C#. O ZXing le
// a matriz, e a matriz e' o que se compara aqui; a leitura esta nos testes do C#,
// onde e' o encoder que desenha.

import { spawnSync } from 'node:child_process';
import { casosDe } from './casos-barras.mjs';

// --- as pontas --------------------------------------------------------------

/** O Python, que e' a implementacao de referencia e por isso o arbrito. */
const PYTHON = `
import json, sys
sys.path.insert(0, "python")
from qrcode_core.simbologias.code93 import code93
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
    elif tipo == "code93":
        c = code93(texto)
    else:
        raise SystemExit("tipo desconhecido: " + tipo)
    saida.append({"modulos": [1 if m else 0 for m in c["modulos"]],
                  "legenda": c["legenda"],
                  "guardas": list(c["guardas"])})

print(json.dumps(saida))
`;

/**
 * Corre o C# e le os modulos em JSON.
 *
 * **Os casos vao por stdin, nunca por argumento:** o Git Bash faz expansao de
 * chaves em `{"inicio":"B"}` e parte o array ao meio.
 *
 * **O `-v q --nologo` nao e' cosmetica.** Sem ele o `dotnet run` escreve o
 * "Compilação com êxito" e o aviso de telemetria no mesmo stdout onde a
 * ferramenta escreve o JSON, e o `JSON.parse` falha numa linha que comeca por
 * uma letra. A falha aparece no Node e a causa e' o `dotnet run` — o mesmo
 * desvio que na stack Java, onde o `==>` do core entrava na resposta.
 *
 * E, como nos outros scripts, **procura-se a ultima linha que parece JSON** em
 * vez de assumir: o `dotnet` pode acrescentar um aviso em qualquer versao
 * futura, e um `JSON.parse` a falhar com um aviso do `dotnet` em cima e' a falha
 * mais cara de diagnosticar que ha.
 */
function modulosDoCsharp(casos) {
  const resultado = spawnSync(
    'dotnet',
    ['run', '--project', 'csharp/tools/QrCodeGenerator.Tools.csproj', '-v', 'q', '--nologo'],
    {
      input: JSON.stringify(casos),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
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
 * leia como um erro de estrutura, e a busca pelo culpado vai ao sitio errado.
 */
function divergencia(a, b) {
  if (a.modulos.length !== b.modulos.length) {
    return `DIVERGE (comprimento ${a.modulos.length} vs ${b.modulos.length})`;
  }

  for (let i = 0; i < a.modulos.length; i++) {
    if (a.modulos[i] !== b.modulos[i]) {
      return `DIVERGE (modulo ${i}: python ${a.modulos[i]}, csharp ${b.modulos[i]})`;
    }
  }

  if (a.legenda !== b.legenda) {
    return `DIVERGE (legenda: python "${a.legenda}", csharp "${b.legenda}")`;
  }

  if (JSON.stringify(a.guardas) !== JSON.stringify(b.guardas)) {
    return `DIVERGE (guardas: python ${JSON.stringify(a.guardas)}, `
      + `csharp ${JSON.stringify(b.guardas)})`;
  }

  return null;
}

const casos = casosDe("csharp");

console.log(`${'caso'.padEnd(36)}${'modulos'.padStart(9)}  estado`);
console.log('-'.repeat(72));

const doPython = modulosDoPython(casos);
const doCsharp = modulosDoCsharp(casos);

if (doPython.length !== doCsharp.length || doPython.length !== casos.length) {
  console.error(`numero de resultados diferente: `
    + `${casos.length} casos, ${doPython.length} do Python, ${doCsharp.length} do C#`);
  process.exit(1);
}

let problemas = 0;

for (let i = 0; i < casos.length; i++) {
  const [tipo, texto] = casos[i];
  const rotulo = `${tipo} ${texto}`.slice(0, 35);

  const problema = divergencia(doPython[i], doCsharp[i]);
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

console.log('C# e Python dao os mesmos modulos.');
