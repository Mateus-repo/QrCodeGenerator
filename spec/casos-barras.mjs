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
];
