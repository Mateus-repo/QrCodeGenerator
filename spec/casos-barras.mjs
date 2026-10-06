// Os casos de codigos de barras que a comparacao de modulos usa.
//
//     import { CASOS_BARRAS } from './casos-barras.mjs';
//
// **Esta lista e' a unica, e e' partilhada pelo `paridade-java.mjs` e pelo
// `paridade-kotlin.mjs`.** Duas listas de casos divergem em silencio, e cada uma
// fica com os casos que a sua stack passou — que e' o mecanismo exacto que
// deixou o Code 128 do Java sem os casos de troca de conjunto: os casos estavam
// escritos a mao em cada script, e o de Java nao tinha os de troca.
//
// **E cada caso e' uma string que da o mesmo codigo nas tres stacks.** A lista
// esta escrita a mao para isso ser visivel: um caso acrescentado a uma stack e'
// um bug de paridade a espera de acontecer.
//
// ## De onde vem a lista
//
// Do `spec/verificar-lineares.py`, que ja tem os casos que o ZXing le. Nao ha
// uma quarta copia: este modulo e' a ponte para essa lista, e nao uma lista
// nova que cresce com o tempo.
//
// ## O que NAO esta aqui, e porquê
//
// **Os casos que so uma stack tem.** Um ITF de um so par de digitos tem vinte e
// dois modulos e nenhum leitor de laboratorio o descodifica: nao e' bug de
// ninguem, e soserve para fazer o script falhar sem razao. Vao no
// `verificar-lineares.py`, onde se sabe porque lao estao.
//
// **Os casos de Code 128 estao a parte** dos outros, e nao por esquecimento.
// Sao os que mostram a troca de conjunto, e sem eles o Code 128 passa nos testes
// estruturais e falha na leitura — que e' como o bug apareceu da primeira vez.

/** `[tipo, texto, opcoes]`, e as opcoes sao as que ambas as stacks recebem. */
/**
 * Que stacks implementam cada formato, e que stacks tem casos para ele.
 *
 * **E' a segunda lista do mesmo conjunto, e por isso vive aqui e nao em cada
 * script.** A primeira e' a de casos: que valores se comparam. A segunda e'
 * esta: que stacks sabem codificar o formato. **Com as duas na mesma pagina,
 * um guarda e' uma comparacao de conjuntos** — e um tipo na lista sem stack
 * que o implemente diz isso no arranque, em vez de desaparecer das tres
 * comparacoes em silencio.
 *
 * **E' este o sitio onde a divergencia aparecia.** Com `TIPOS` em cada um dos
 * tres scripts, acrescentar o Code 93 obrigou a editar os tres ao mesmo tempo
 * e nao havia nada que dissesse se os tres ficaram iguais. Aqui acrescenta-se
 * uma linha e as tres paridades seguem.
 *
 * **Uma entrada que e' verdade e nao e' verdade ao mesmo tempo:** o Kotlin e
 * o C# tem a tabela do Code 93 gerada e **nao tem o encoder**, e e' por isso
 * que nao estao na lista. **A tabela gerada sem encoder e' um ficheiro morto,
 * e nao uma capacidade** — o que o gerador escreve e' a spec do que vai ser
 * implementado, e a lista e' o que ja e'.
 */
export const STACKS = {
  java: ["code39", "itf14", "codabar", "code128", "code93"],
  kotlin: ["code39", "itf14", "codabar", "code128", "code93"],
  csharp: ["code39", "itf14", "codabar", "code128", "code93"],
};

export const CASOS_BARRAS = [
  // --- Code 39 ---
  ['code39', 'CODE-39', {}],
  ['code39', 'ABC123', {}],
  ['code39', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%', {}],
  ['code39', 'A$-/+%', {}],

  // --- ITF ---
  ['itf14', '1234567890128', {}],
  ['itf14', '0001234567890', {}],

  // --- Codabar ---
  ['codabar', '123456', {}],
  ['codabar', '123456', { inicio: 'B', paragem: 'B' }],
  ['codabar', '12345', { inicio: 'D', paragem: 'D' }],
  ['codabar', '123456', { largo: true }],
  ['codabar', '12-34$56/78:+9.0', {}],

  // --- Code 128 ---
  // **O `ABC123` e' o caso que mostra a troca de conjunto.** Sem os caracteres
  // de comuta, o Code 128 desenha-se perfeito e devolve `ABC,3` em vez de
  // `ABC123` — foi assim que o bug apareceu da primeira vez, e nenhum teste
  // estrutural o apanhou.
  ['code128', 'Hi', {}],
  ['code128', 'ABC123', {}],
  ['code128', '12345678', {}],
  ['code128', 'abc-123', {}],
  ['code128', 'Code 128', {}],
  ['code128', 'ABC12345678901234567890', {}],

  // --- Code 93 ---
  // **Os mesmos casos do `web/tests/gerar-code93.mjs`, sem os de caracteres de
  // controlo.** Estes ultimos continuam verificados pelo
  // `descodificar-code93-python.py`, que os manda ao ZXing; aqui o que se
  // compara e' a geometria, e um `\x00` no meio da lista nao ajuda ninguem a
  // le-la.
  //
  // **O `minusculas` e' o caso que prova a codificacao estendida**: `teste-93`
  // vai no codigo como `dTdEdSdTdE-93`, e sao quinze modulos a mais do que
  //-chain de sete caracteres. Um encoder que mande as minusculas tal e qual
  // falha aqui, e falha bem — com um comprimento diferente, que e' o erro de
  // estrutura e nao o de dado.
  ['code93', 'ABC-1234', {}],
  ['code93', 'teste-93', {}],
  ['code93', 'Teste93Minusculas', {}],
  ['code93', 'ABC $/%+-.', {}],
  ['code93', 'A', {}],
  ['code93', 'MAST-2024-0001-LOTE-A', {}],
  ['code93', '999999999999999999999999999999', {}],
  ['code93', 'MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20', {}],

];
/**
 * Os formatos que esta lista contem, derivados dela.
 *
 * **Existe para se poder perguntar "esta lista tem algum caso que ninguem
 * verifica".** Uma lista partilhada que cada stack filtra pelo que sabe faz
 * tem um buraco silencioso: um tipo novo entra, nenhuma stack o implementa
 * ainda, e o caso desaparece das tres comparacoes sem deixar rasto.
 *
 * Por isso que este e' derivativo e nao escrito a mao. **Escrito a mao, o
 * proximo tipo acrescentado nao entra aqui e o buraco abre outra vez** — que
 * e' a razao de ser, nao a lista de casos a ser escrita a mao duas vezes.
 *
 * @returns {Set<string>} os identificadores de formato
 */
export function tipos() {
  return new Set(CASOS_BARRAS.map(([tipo]) => tipo));
}

/**
 * Os casos de uma stack: os da lista que ela implementa.
 *
 * **E' o filtro, e o filtro esconde o caso.** Por isso que `tipos()` existe e
 * o guarda de baixo existe: um formato que entre na lista e ninguem
 * implemente desaparece das comparacoes sem deixar rasto, e sem guarda
 * ninguem descobre que essa entrada nao e' verificada por ninguem.
 *
 * @param {string} stack a chave de {@link STACKS}
 * @returns {Array} os casos, no formato de {@link CASOS_BARRAS}
 */
export function casosDe(stack) {
  const suportados = STACKS[stack];

  if (!suportados) {
    throw new Error(
      `"${stack}" nao esta em STACKS. As stacks sao: `
      + Object.keys(STACKS).join(", ")
    );
  }

  return CASOS_BARRAS.filter(([tipo]) => suportados.includes(tipo));
}

/**
 * Nao ha nenhum formato na lista sem stack que o implemente.
 *
 * **Corre-se no arranque, e nao num teste.** Um guarda que so corre com um
 * comando e' um guarda que ninguem corre quando acrescenta uma entrada, que e'
 * exactamente quando faz falta. Um invariant que se verifica ao carregar o
 * modulo falha sempre, e nao falha so quando alguem se lembra.
 */
function conferirQueTodosOsTiposSaoVerificados() {
  const implementados = new Set(Object.values(STACKS).flat());
  const orfaos = [...tipos()].filter((tipo) => !implementados.has(tipo));

  if (orfaos.length > 0) {
    throw new Error(
      `estes formatos estao em CASOS_BARRAS e nenhuma stack os implementa: `
      + `${orfaos.join(", ")}. Ou acrescenta a stack a STACKS, ou o caso nao `
      + 'e verificado por ninguem — e uma entrada que ninguem verifica e pior '
      + 'do que nao estar, porque parece estar.'
    );
  }

  // O outro sentido: **um formato declarado que nao tem caso nenhum.** E' um
  // `case` que nunca corre, e nao se nota.
  for (const [stack, formatos] of Object.entries(STACKS)) {
    const semCaso = formatos.filter((tipo) => !tipos().has(tipo));

    if (semCaso.length > 0) {
      throw new Error(
        `${stack} declara estes formatos e nao tem nenhum caso na lista: `
        + `${semCaso.join(", ")}. Uma comparacao sem casos passa sem comparar nada.`
      );
    }
  }
}

conferirQueTodosOsTiposSaoVerificados();
