// Compara os modulos do Java com os do Python, para cada codigo de barras.
//
//     node spec/paridade-java.mjs
//
// **Esta e' a comparacao que decide, e nao uma conta de modulos.** Duas
// implementacoes podem ter o comprimento certo e a silhueta errada, e so a
// comparacao dos modulos as distingue — que e' o que a AGENTS.md diz quando
// fala do logotipo do FieldQR: "o QR continuava a ler e nenhum teste falhou,
// porque o codigo estava certo".
//
// **E nao ha um "quase".** Ou os modulos sao iguais, ou um dos dois esta errado
// e nao se sabe qual — e e' por isso que a lista de casos vem de uma fonte so:
// o `spec/verificar-lineares.py`, que ja tem os casos do ZXing.
//
// **O que este script nao faz:** mandar o ZXing ler o resultado do Java. O ZXing
// le a matriz, e a matriz e' o que se compara aqui; acrescentar a leitura seria
// verificar duas vezes a mesma coisa e dar a ilusao de mais cobertura.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// --- os casos, que sao os mesmos do verificador de leitura -----------------

/** O nome, o texto, e as opcoes que o Python e o Java tem de receber iguais. */
const CASOS = [
  ['code39', 'CODE-39', {}],
  ['code39', 'ABC123', {}],
  ['code39', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%', {}],
  ['code39', 'A$-/+%', {}],
  ['itf14', '1234567890128', {}],
  ['itf14', '0001234567890', {}],
  ['codabar', '123456', {}],
  ['codabar', '123456', { inicio: 'B', paragem: 'B' }],
  ['codabar', '12345', { inicio: 'D', paragem: 'D' }],
  ['codabar', '123456', { largo: true }],
  ['codabar', '12-34$56/78:+9.0', {}],
];

/*
 * **Os casos do Code 128 vao a parte, e nao por esquecimento.**
 *
 * Cada um e' uma string que **da o mesmo codigo no Java e no Python**, e a
 * lista esta escrita a mao para isso ser visivel: um caso acrescentado a uma
 * stack e' um bug de paridade a espera de acontecer.
 *
 * E o `ABC123` e' o caso que mostra a troca de conjunto. Sem os caracteres de
 * troca, o Code 128 desenha-se perfeito e devolve `ABC,3` em vez de `ABC123` —
 * foi assim que o bug apareceu da primeira vez, e nenhum teste estrutural o
 * apanha.
 */
const CASOS_128 = [
  'Hi',
  'ABC123',
  '12345678',
  'abc-123',
  'Code 128',
];

/** Tudo o que corre de uma ponta a outra, e a ordem em que corre. */
const TODOS = [
  ...CASOS.map(([tipo, texto, opcoes]) => ({ tipo, texto, opcoes })),
  ...CASOS_128.map((texto) => ({ tipo: 'code128', texto, opcoes: {} })),
];

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
 * Corre o Java e le os modulos em JSON.
 *
 * **Os casos vao por stdin, nunca por argumento.** Passar JSON num `argv` e'
 * fragil e ja falhou: o Git Bash faz expansao de chaves em `{"inicio":"B"}` e
 * parte o array ao meio, porque a virgula dentro das chaves parece uma lista.
 * Por stdin nao ha shell a mexer no meio. O `build.sh run-linear` compila o
 * core e as ferramentas e passa o stdin tal e qual ao `java`.
 */
function modulosDoJava(casos) {
  // O Git Bash e' o caminho no Windows; nos outros Sistemas o `bash` esta no
  // PATH. Tentar os dois evita a mensagem "o Java nao correu" num sitio em que
  // o Java esta bem instalado.
  const bash = process.platform === 'win32' &&
    existsSync('C:\\Program Files\\Git\\bin\\bash.exe')
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';

  const resultado = spawnSync(bash, ['build.sh', 'run-linear'], {
    cwd: 'java',
    input: JSON.stringify(casos),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (resultado.status !== 0) {
    console.error(resultado.stderr || resultado.stdout);
    throw new Error('o Java nao correu');
  }

  return JSON.parse(resultado.stdout);
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
 * **A comprimento vem primeiro, e o motivo nao e' o mesmo que o motivo do
 * modulo.** Um comprimento diferente e' uma tabela ou uma moldura diferente — um
 * erro de estrutura. Um modulo diferente e' a mesma estrutura com outro conteudo
 * — um erro de dado. Confundir os dois faz com que um erro de dado se leia
 * como um erro de estrutura, e a busca pelo culpado vai ao sitio errado.
 */
function divergencia(a, b) {
  if (a.modulos.length !== b.modulos.length) {
    return `DIVERGE (comprimento ${a.modulos.length} vs ${b.modulos.length})`;
  }

  for (let i = 0; i < a.modulos.length; i++) {
    if (a.modulos[i] !== b.modulos[i]) {
      return `DIVERGE (modulo ${i}: python ${a.modulos[i]}, java ${b.modulos[i]})`;
    }
  }

  if (a.legenda !== b.legenda) {
    return `DIVERGE (legenda: python "${a.legenda}", java "${b.legenda}")`;
  }

  if (JSON.stringify(a.guardas) !== JSON.stringify(b.guardas)) {
    return `DIVERGE (guardas: python ${JSON.stringify(a.guardas)}, `
      + `java ${JSON.stringify(b.guardas)})`;
  }

  return null;
}

const casos = TODOS.map((c) => [c.tipo, c.texto, c.opcoes]);

console.log(`${'caso'.padEnd(36)}${'modulos'.padStart(9)}  estado`);
console.log('-'.repeat(72));

const doPython = modulosDoPython(casos);
const doJava = modulosDoJava(casos);

if (doPython.length !== doJava.length || doPython.length !== casos.length) {
  console.error(`numero de resultados diferente: `
    + `${casos.length} casos, ${doPython.length} do Python, ${doJava.length} do Java`);
  process.exit(1);
}

let problemas = 0;

for (let i = 0; i < casos.length; i++) {
  const [tipo, texto] = casos[i];
  const rotulo = `${tipo} ${texto}`.slice(0, 35);

  const problema = divergencia(doPython[i], doJava[i]);
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

console.log('Java e Python dao os mesmos modulos.');
