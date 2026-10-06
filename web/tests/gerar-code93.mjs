/**
 * Gera os casos de Code 93 para o leitor independente.
 *
 *     node web/tests/gerar-code93.mjs
 *     python web/tests/descodificar-code93.py
 *
 * Os casos cobrem o que o Code 93 tem e o Code 39 nao: **minusculas, simbolos
 * e caracteres de controle**. E' essa a razao de o existir - e um caso so com
 * maiusculas, que e' o que o Code 39 trata, nao provaria nada.
 */

import { writeFileSync } from 'node:fs';
import { code93 } from '../symbologies/code93.js';

const CASOS = [
  { entrada: 'ABC-1234', nome: 'maiusculas' },
  { entrada: 'teste-93', nome: 'minusculas' },
  { entrada: 'Teste93Minusculas', nome: 'misto' },
  { entrada: 'ABC $/%+-.', nome: 'simbolos' },
  { entrada: 'A', nome: 'um caracter so' },
  { entrada: 'MAST-2024-0001-LOTE-A', nome: 'numero de serie' },
  { entrada: '9'.repeat(30), nome: 'trinta digitos' },
  { entrada: 'MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20', nome: 'texto longo' },

  /*
   * Os caracteres de controlo, que faltavam todos.
   *
   * **Estes casos sao os que apanharam a tabela de escapes errada.** Vinte e
   * quatro dos trinta e dois estavam errados no encoder, e nenhum dos dez casos
   * anteriores tinha um — a tabela estava errada e verificada ao mesmo tempo,
   * porque a verificacao nao a tocava.
   *
   * Cada um destes vai do caracter ao ZXing e volta, e um par de escape errado
   * mostra-se logo: o leitor devolve o caracter errado. O CR e' o caso mais
   * claro — saia como o algarismo `0`, e o ZXing devolvia `0` onde estava
   * supposed estar um CR.
   *
   * **Um caso por controlo critico, e nao os 32 em fila.** Um codigo com os 32
   * em fila nao tem texto visivel para comparar, e a falha seria "nao leu nada"
   * em vez de "leu `0` em vez de CR" — que e' a mensagem que diz onde esta o
   * problema.
   */
  { entrada: 'A\rB', nome: 'carriage return' },
  { entrada: 'A\x1bB', nome: 'escape' },
  { entrada: 'A\x07B', nome: 'bell' },
  { entrada: 'A\x00B', nome: 'nulo' },
  { entrada: 'A\x1fB', nome: 'fim de unidade' },
  { entrada: 'A\x7fB', nome: 'apaga' },

  /*
   * Os trinta e dois de uma vez, para a cobertura ser total.
   *
   * **Este caso so verifica que o ZXing le**, e nao o que leu: o `descodificar`
   * compara-o com o `entrada`, e uma cadeia de trinta e dois caracteres de
   * controlo nao se escreve no terminal. Serve para apanhar um par que o ZXing
   * recuse, que e' o outro modo de a tabela estar errada.
   */
  { entrada: Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join(''), nome: 'os 32 de controlo' },

  // O asterisco e' a marca de inicio e de fim, e nao pode estar nos dados. Um
  // asterisco nos dados faz o leitor parar ali, e o que vem a seguir e' lido
  // como lixo - o codigo desenha-se e le-se a metade, que e' pior do que nao
  // ler nada, porque parece que leu.
  { entrada: 'ABC*123', nome: 'asterisco nos dados', erro: true },

  // O Code 93 e' ASCII, e um acento nao tem codigo.
  { entrada: 'LOTAÇÃO', nome: 'acento', erro: true },
];

const casos = CASOS.map((caso) => {
  if (caso.erro) {
    let lancou = false;
    try {
      code93(caso.entrada);
    } catch {
      lancou = true;
    }
    if (!lancou) {
      throw new Error(`o encoder ACEITOU "${caso.entrada}", que devia recusar`);
    }
    return { ...caso, modules: null, guards: [], caption: null };
  }

  const c = code93(caso.entrada);
  return {
    ...caso,
    modules: c.modules,
    guards: c.guards,
    caption: c.caption,
    /*
     * A forma estendida, que e' o que o ZXing devolve.
     *
     * O Code 93 nao tem minusculas na tabela: uma minuscula vai como o par
     * `d` mais a maiuscula. Por isso `teste-93` vai no codigo como
     * `dTdEdSdTdE-93`, e o leitor devolve isso - **e nao o texto original**.
     *
     * E' a primeira versao deste teste que falhou, e nao por o encoder estar
     * errado: comparava com `teste-93` e o leitor devolve a forma dele. Duas
     * representacoes do mesmo texto, e so uma delas vai no codigo.
     *
     * E a legenda impressa leva a forma estendida e nao a original, que e'
     * exactamente o que o ZXing codigo de barras do sector faz: a pessoa lê
     * `dTdEdSdTdE-93`, e o software desfaz o par. Nao ha forma de imprimir
     * `teste-93` e ainda assim o codigo ser valido.
     */
    estendido: c.caption.slice(0, -2),
  };
});

writeFileSync(new URL('./.code93.json', import.meta.url), JSON.stringify(casos), 'utf8');
console.log(`${casos.length} casos de Code 93`);
