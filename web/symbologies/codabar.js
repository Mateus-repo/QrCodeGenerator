/**
 * Codabar.
 *
 * Um codigo de 1972 que sobreviveu em sitios muito especificos: bancos de
 * sangue, arquivos de slide, algumas bibliotecas e etiquetas de identificacao
 * em laboratorio. Nao esta no supermercado nem em caixas de encomenda, e ha uma
 * razao: nao tem digito de controlo e nao detecta erros.
 *
 * Tres coisas o caracterizam:
 *
 *  - **A, B, C e D sao os caracteres de inicio e de paragem, e dizem quem leu.**
 *    Uma etiqueta de banco de sangue com inicio A e paragem B significa uma
 *    coisa diferente de C e D. Nenhum outro codigo deste conjunto usa os
 *    caracteres de paragem para dizer alguma coisa.
 *  - **Nao ha digito de controlo.** Um erro de leitura devolve um numero
 *    diferente e silenciosamente.
 *  - Ha duas larguras (normal e largo) e duas razoes de espaco.
 *
 * A notacao das tabelas: letra maiuscula e barra, minuscula e espaco. `W` e
 * uma barra larga, `w` um espaco largo. Tabela de
 * `python-barcode`, `barcode/charsets/codabar.py`.
 */

const PADROES = {
  0: 'NnNnNwW', 1: 'NnNnWwN', 2: 'NnNwNnW', 3: 'WwNnNnN', 4: 'NnWnNwN',
  5: 'WnNnNwN', 6: 'NwNnNnW', 7: 'NwNnWnN', 8: 'NwWnNnN', 9: 'WnNwNnN',
  '-': 'NnNwWnN', $: 'NnWwNnN', ':': 'WnNnWnW', '/': 'WnWnNnW',
  '.': 'WnWnWnN', '+': 'NnWnWnW',
};

const INICIO_PARAGEM = {
  A: 'NnWwNwN', B: 'NwNwNnW', C: 'NnNwNwW', D: 'NnNwWwN',
};

/** Os quatro caracteres que so podem ser inicio ou paragem. */
export const PARAGENS = ['A', 'B', 'C', 'D'];

/**
 * As larguras, por variante, em modulos.
 *
 * A razao larga/estreita e de **5:2**, e nao 2:1 nem 3:1. Nao e arbitrario: e
 * a que a implementacao de referencia usa, e o leitor mede-a na moldura de
 * paragem e aplica-a a todo o resto. Um Codabar desenhado a 2:1 tem o aspecto
 * certo e nao le, porque a barra larga e curta demais para o leitor a
 * distinguir de duas estreitas.
 */
const NORMAL = { estreito: 2, largo: 5, espaco: 2 };
const LARGO = { estreito: 2, largo: 5, espaco: 3 };

/**
 * A largura de um elemento.
 *
 * Depende de `W`/`w` contra `N`/`n`, e **nao** de maiuscula contra minuscula.
 * A maiuscula diz se e barra ou espaco; a letraWide diz a largura. Confundir
 * as duas coisas e o que fazia este codigo sair sem um unico espaco e nao ler.
 */
const eLargo = (elemento) => elemento === 'W' || elemento === 'w';

function modulosDe(elementos, medidas) {
  const modulos = [];
  for (let i = 0; i < elementos.length; i++) {
    // Os sete elementos alternam barra, espaco, barra, espaco... comecando em
    // barra. A posicao no ciclo e que diz a cor; a letra diz a largura.
    const escuro = i % 2 === 0;
    const largura = eLargo(elementos[i]) ? medidas.largo : medidas.estreito;
    for (let k = 0; k < largura; k++) modulos.push(escuro);
  }
  return modulos;
}

export { PADROES as PADROES_CODABAR, INICIO_PARAGEM as INICIO_PARAGEM_CODABAR };

export function codabar(valor, opcoes = {}) {
  const { inicio = 'A', paragem = 'A', largo = false } = opcoes;
  const texto = String(valor).toUpperCase();

  if (!PARAGENS.includes(inicio) || !PARAGENS.includes(paragem)) {
    throw new Error(
      `Codabar: inicio e paragem tem de ser A, B, C ou D (recebeu "${inicio}" e "${paragem}")`,
    );
  }
  if (texto.length === 0) {
    throw new Error('Codabar: o texto esta vazio');
  }

  for (const c of texto) {
    if (PARAGENS.includes(c)) {
      throw new Error(
        `Codabar: "${c}" e um caractere de inicio ou de paragem e nao pode estar ` +
          'nos dados. A, B, C e D so existem nas pontas.',
      );
    }
    if (PADROES[c] === undefined) {
      throw new Error(
        `Codabar: "${c}" nao existe neste codigo. Sao 0-9, - $ / : + .`,
      );
    }
  }

  const medidas = largo ? LARGO : NORMAL;

  /*
   * O espaco entre caracteres tem de estar em **todos** os intervalos, e o
   * intervalo que mais se esquece e o primeiro, entre o caractere de inicio e
   * o primeiro dado. O inicio acaba numa barra e o primeiro dado comeca noutra,
   * e coladas somam-se numa barra larga a mais — o codigo tem o aspecto certo
   * e nao le.
   */
  const modulos = [...modulosDe(INICIO_PARAGEM[inicio], medidas)];
  for (let k = 0; k < medidas.espaco; k++) modulos.push(false);

  for (const c of texto) {
    modulos.push(...modulosDe(PADROES[c], medidas));
    for (let k = 0; k < medidas.espaco; k++) modulos.push(false);
  }

  modulos.push(...modulosDe(INICIO_PARAGEM[paragem], medidas));

  return {
    symbology: 'Codabar',
    modules: modulos,
    guards: [0, modulos.length - 1],
    caption: texto,
    inicio,
    paragem,
    largo,
  };
}
