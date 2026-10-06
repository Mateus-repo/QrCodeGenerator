/**
 * A lista de ficheiros do README tem de bater com a pasta.
 *
 *     node --test "web/tests/*.test.mjs"
 *
 * ## Porque este teste existe
 *
 * **Porque uma lista escrita à mão diverge em silêncio, e não há nada que a
 * faça falhar.** O `web/README.md` listava `web/symbologies/` com **13 dos 19**
 * ficheiros: faltavam o `code93.js`, o `code93-tabelas.js`, o
 * `gs1-datamatrix.js`, o `datamatrix-modos-tabelas.js`, o `rmqr.js` e o
 * `rmqr-tabelas.js`.
 *
 * Nenhum sintoma, nenhum erro. **A pasta tem o que a lista não diz, e a lista
 * é o que se lê.** Alguém que apanhe o rMQR pelo README não descobre que ele
 * existe.
 *
 * **É o mesmo mecanismo do GS1-128**, que a `AGENTS.md` já registou: duas
 * listas do mesmo conjunto, escritas em sítios diferentes, sem nada que as
 * ligue. O `formatos.test.mjs` liga o `<select>` ao registo da aplicação — e a
 * lista do README ficou de fora, por ser o ficheiro mais recente e o único onde
 * não havia teste.
 *
 * ## Os caracteres da árvore, em escapes
 *
 * **Os caracteres de desenho de caixas entram como `\u251C` e `\u2502`, e não
 * como o caractere.** Escrevê-los à mão neste ficheiro deu um caractere
 * diferente do que o README tem, e o teste passou a dizer que o README não
 * tinha o bloco — que é uma mensagem que não ajuda ninguém.
 *
 * **Um `assert` sobre caracteres de desenho que não batem falha com uma
 * mensagem que mente**, e o procedimento natural — «olhar outra vez para o
 * ficheiro» — dá o mesmo resultado outra vez. O escape pelo menos falha logo se
 * o caractero não for o que se pensa.
 *
 * ## Nos dois sentidos, e porquê
 *
 * **Um ficheiro sem linha é o caso grave** — o ficheiro existe e ninguém o
 * sabe. **Uma linha sem ficheiro é o caso leve**, mas é o que denuncia que a
 * lista está a ser mantida à mão: alguém acrescenta um ficheiro e não atualiza
 * a linha, ou apaga um ficheiro e esquece a linha.
 *
 * Um `deepEqual` numa só direção não apanha nenhum dos dois.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * A pasta do web, e nao a raiz do repositorio.
 *
 * **Com `../..` lia-se o README da raiz**, que nao tem o bloco
 * `symbologies/`, e a falha dizia exactamente isso — o que e' o caso mais
 * irritante de todos: a mensagem e' verdadeira e nao ajuda. `import.meta.url`
 * esta em `web/tests/`, e `../` ja e' `web/`.
 */
const RAIZ = new URL('../', import.meta.url);
const PASTA = new URL('./symbologies/', RAIZ);
const README = new URL('./README.md', RAIZ);

/** O canto da árvore que abre um bloco. */
const RAMO = '\u251C';

/** A linha vertical que mantem o bloco aberto. */
const TRONCO = '\u2502';

/** O traço duplo onde vem o nome, depois do canto. */
const TRACO = '\u2500\u2500';

/**
 * Os ficheiros da pasta, sem os directórios.
 *
 * @returns {string[]} os nomes, ordenados
 */
function ficheirosDaPasta() {
  return readdirSync(fileURLToPath(PASTA))
    .filter((nome) => nome.endsWith('.js'))
    .sort();
}

/**
 * Os nomes que o README lista dentro do bloco `symbologies/`.
 *
 * **O bloco é lido pelos caracteres da árvore, e não por um qualquer `*.js` do
 * ficheiro** — o README lista também `payloads/` e a raiz, e procurar por
 * `.js` em todo o lado dava `types.js` e `pix.js` como ficheiros a mais em
 * `symbologies/`. Foi o que aconteceu na primeira versão deste teste, e
 * apanhou-se porque se comparou primeiro à pasta.
 *
 * @returns {string[]} os nomes, na ordem em que o README os põe
 */
function listadosNoReadme() {
  const linhas = readFileSync(fileURLToPath(README), 'utf8').split('\n');

  const inicio = linhas.findIndex(
    (linha) => linha.startsWith(RAMO) && linha.includes('symbologies/'),
  );
  assert.ok(inicio >= 0, 'o README nao tem o bloco `symbologies/`');

  // O bloco dura ate a proxima linha que nao desenha a mesma coluna: os
  // ficheiros comecam com o tronco, e o fim do bloco leva o canto de baixo.
  let fim = inicio + 1;
  while (fim < linhas.length && linhas[fim].startsWith(TRONCO)) {
    fim += 1;
  }

  return linhas
    .slice(inicio + 1, fim)
    .filter((linha) => linha.includes('.js'))
    .map((linha) => linha.split(TRACO).pop().trim().split(/\s+/)[0]);
}

test('o README lista todos os ficheiros de symbologies/', () => {
  const naPasta = ficheirosDaPasta();
  const noReadme = listadosNoReadme();

  const semLinha = naPasta.filter((nome) => !noReadme.includes(nome));
  assert.deepEqual(
    semLinha,
    [],
    `estes ficheiros existem e o README nao os lista: ${semLinha.join(', ')}. `
      + 'Ou acrescenta a linha, ou o ficheiro nao devia estar aqui.',
  );

  const semFicheiro = noReadme.filter((nome) => !naPasta.includes(nome));
  assert.deepEqual(
    semFicheiro,
    [],
    `o README lista estes ficheiros e eles nao existem: ${semFicheiro.join(', ')}`,
  );
});

test('os ficheiros gerados estao marcados como gerados no README', () => {
  /**
   * Os que o gerador escreve.
   *
   * **Estao escrita e nao tirada de um sitio** pelo mesmo motivo pelo qual as
   * tabelas dos codigos de barras sao geradas: **uma lista escrita a mao
   * diverge em silencio**, e acrescentar um ficheiro gerado sem o marcar e'
   * o caminho para alguem o editar e perder a mudanca na proxima corrida do
   * gerador.
   */
  const GERADOS = [
    'code93-tabelas.js',
    'gs1-tabelas.js',
    'pdf417-tabelas.js',
    'datamatrix-tabelas.js',
    'datamatrix-modos-tabelas.js',
    'rmqr-tabelas.js',
  ];

  const linhas = readFileSync(fileURLToPath(README), 'utf8').split('\n');

  for (const nome of GERADOS) {
    const linha = linhas.find((l) => l.includes(nome));
    assert.ok(linha, `o README nao lista ${nome}`);

    assert.ok(
      linha.includes('gerado'),
      `o README lista ${nome} sem a marca **gerado**, e sem ela alguem o `
        + 'vai editar e perder a mudanca na proxima corrida do gerador',
    );
  }
});

test('o README nao marca como gerado um ficheiro que nao e', () => {
  // **O outro sentido, e e' o que denuncia o `**gerado**` colado a mao.** Com
  // a marca em todos os lados o aviso deixa de servir para nada, e o que
  // devia proteger fica sem sinal.
  const linhas = readFileSync(fileURLToPath(README), 'utf8').split('\n');

  const marcados = linhas
    .filter((l) => l.includes('.js') && l.includes('gerado'))
    .map((l) => l.split(TRACO).pop().trim().split(/\s+/)[0]);

  for (const nome of marcados) {
    assert.ok(
      ficheirosDaPasta().includes(nome),
      `o README marca ${nome} como gerado e o ficheiro nao existe`,
    );
  }
});
