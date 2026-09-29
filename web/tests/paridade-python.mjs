/**
 * A paridade entre o Python e o web, tipo a tipo.
 *
 *     node web/tests/paridade-python.mjs
 *
 * ## O que este teste e' e o que nao e'
 *
 * **E' a verificacao de que a implementacao de referencia e a web produzem o
 * mesmo payload byte a byte.** Sem ele, "as duas stacks estao certainas" e' uma
 * esperanca, e a `AGENTS.md` diz que a paridade **nao e' negociavel**: um payload
 * que sai diferente num cliente e' um bug, mesmo que o teste desse cliente
 * passe.
 *
 * E nao e' um teste de estrutura, nem de limites, nem de mensagem de erro. **E'
 * so a igualdade do resultado**, e e' a que apanha o que nenhum outro apanha:
 * um `,` em vez de `;` num vCard, um `+` em vez de `%20` num assunto, uma hora
 * convertida para UTC num evento.
 *
 * ## Por que Node e nao o outro caminho
 *
 * **Porque a implementacao de referencia e' o Python, e o Python nao tem um
 * motor de JavaScript.** O caminho seria: gerar os payloads em Node com o
 * `types.js` do web, e em Python com `qrcode_core`, e comparar os dois. A
 * ordem importa: **o Python escreve o ficheiro e o Node le-o**, porque quem
 * manda na spec e' o Python — e `spec/gerar-vectors.py` importa `qrcode_core`.
 *
 * Se o Python e' que da o payload errado, o Node concorda com o erro e o
 * ficheiro fica vazio. Por isso o script **falha se o Python nao produzir
 * nada**, e nao prossegue com um ficheiro de metade.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES, CATEGORY_IDS, build } from '../payloads/types.js';
import { createHash } from 'node:crypto';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');

/*
 * Os casos, com os campos de cada tipo.
 *
 * **Cada um tem de ter um caso que dê Difference**, e nao so o caso feliz. E a
 * razao de o `texto` ter um caso com acentos e emoji, o `evento` ter um com
 * `;` e `,` no titulo, e o `vcard` ter um com caracteres que precisam de escape.
 *
 * Um caso feliz apanha o encoder partido. **Um caso com um `;` apanha o
 * encoder partido de uma maneira que da um payload que parece certo** — que e' o
 * que interessa.
 */
const CASOS = [
  {
    tipo: 'link',
    nome: 'sem esquema',
    campos: { url: 'exemplo.pt' },
  },
  {
    tipo: 'link',
    nome: 'com esquema',
    campos: { url: 'https://exemplo.pt/caminho?a=1&b=2' },
  },
  {
    tipo: 'texto',
    nome: 'simples',
    campos: { texto: 'Peca 4471, lote A1' },
  },
  {
    tipo: 'texto',
    nome: 'com acentos e emoji',
    campos: { texto: 'Peça-francesa — cœur — 30 € 🔐' },
  },
  {
    tipo: 'texto',
    nome: 'com quebras de linha',
    campos: { texto: 'linha um\nlinha dois' },
  },
  {
    /*
     * **O caso que apanhou um bug nas DUAS stacks.** O `œ` e' um caracter
     * unico, e nao um `o` com um acento por cima: o NFD nao o decompoe, a
     * remocao dos nao-ASCII apaga-o, e `cœur` dava `cur` — tanto no Python
     * como no JavaScript.
     *
     * A razao de estar aqui e nao num teste de estrutura e' que **as duas
     * stacks davam o mesmo resultado errado**, e por isso que um teste de
     * paridade nao o apanharia. A falha so aparece a quem le o nome numa
     * etiqueta, e um nome com ligadura e' courant em frances e esta em Portugal.
     */
    tipo: 'texto',
    nome: 'com ligaduras',
    campos: { texto: 'cœur · œuvre · manœuvre' },
  },
  {
    tipo: 'email',
    nome: 'so o destinatario',
    campos: { mailTo: 'ana@exemplo.pt' },
  },
  {
    tipo: 'email',
    nome: 'com assunto e corpo',
    campos: {
      mailTo: 'ana@exemplo.pt',
      mailSubject: 'Reunião de sexta & balanço',
      mailBody: 'Confirmo a presença. Traz a documentação.',
    },
  },
  {
    tipo: 'telefone',
    nome: 'com indicativo',
    campos: { phonePrefix: '+351', phoneNumber: '912 345 678' },
  },
  {
    tipo: 'telefone',
    nome: 'indicativo em 00',
    campos: { phonePrefix: '00351', phoneNumber: '912345678' },
  },
  {
    tipo: 'sms',
    nome: 'com mensagem',
    campos: { phonePrefix: '+351', phoneNumber: '912345678', smsMessage: 'Chego às 18h' },
  },
  {
    tipo: 'sms',
    nome: 'sem mensagem',
    campos: { phonePrefix: '+351', phoneNumber: '912345678' },
  },
  {
    tipo: 'whatsapp',
    nome: 'so o numero',
    campos: { phonePrefix: '+351', phoneNumber: '912345678' },
  },
  {
    tipo: 'whatsapp',
    nome: 'com mensagem',
    campos: { phonePrefix: '+351', phoneNumber: '912345678', waMessage: 'Olá & bom dia' },
  },
  {
    /*
     * O caso que mais importa de todos. **O titulo tem um `;` e uma `,`**, que
     * sao os separadores do iCalendar, e sem escape o `SUMMARY` acaba no sitio
     * errado e o evento fica sem titulo no calendario.
     */
    tipo: 'evento',
    nome: 'com separadores no titulo',
    campos: {
      eventTitle: 'Aula: guionização, nível 2',
      eventStart: '2026-09-29T18:30',
      eventEnd: '2026-09-29T20:30',
      eventLocation: 'Biblioteca municipal, sala 3',
      eventDescription: 'Trazer caderno. Duas horas; com pausa.',
    },
  },
  {
    tipo: 'evento',
    nome: 'com barras invertidas',
    campos: {
      eventTitle: '路径 \\ e barra',
      eventStart: '2026-01-01T09:00',
      eventEnd: '2026-01-01T10:00',
    },
  },
  {
    tipo: 'localizacao',
    nome: 'coordenada simples',
    campos: { geoLat: '38.7223', geoLng: '-9.1393' },
  },
  {
    tipo: 'localizacao',
    nome: 'com virgula decimal',
    campos: { geoLat: '38,7223', geoLng: '-9,1393' },
  },
  {
    tipo: 'localizacao',
    nome: 'com muitas casas',
    campos: { geoLat: '38.722312345678', geoLng: '-9.139312345678' },
  },
  {
    tipo: 'wifi',
    nome: 'com password',
    campos: { wifiSsid: 'Rede Casa', wifiSec: 'WPA/WPA2', wifiPass: 'segredo123' },
  },
  {
    tipo: 'wifi',
    nome: 'aberta e oculta',
    campos: { wifiSsid: 'Rede Aberta', wifiSec: 'Aberto', wifiHidden: true },
  },
  {
    /*
     * O SSID tem `;` e `,`, que sao os separadores do formato WiFi. Sem escape
     * o `P:` seguinte e' lido como parte do SSID, e o telefone liga a uma rede
     * que nao existe.
     */
    tipo: 'wifi',
    nome: 'ssid com separadores',
    campos: { wifiSsid: 'Rede; Com, Separadores', wifiSec: 'WPA/WPA2', wifiPass: 'p;ass' },
  },
  {
    tipo: 'vcard',
    nome: 'completo',
    campos: {
      vcFirstName: 'Ana',
      vcLastName: 'Silva',
      vcOrg: 'Oficina de Reparação, Lda.',
      vcRole: 'Técnica',
      vcPhone: '+351 912 345 678',
      vcPhone2: '+351 213 456 789',
      vcEmail: 'ana@exemplo.pt',
      vcStreet: 'Rua da Bica 12, 3.º Esq',
      vcCity: 'Lisboa',
      vcZip: '1200-401',
      vcCountry: 'Portugal',
    },
  },
  {
    tipo: 'vcard',
    nome: 'so o nome',
    campos: { vcFirstName: 'Ana', vcLastName: 'Silva' },
  },
  {
    tipo: 'vcard',
    nome: 'com aspas e barras',
    fields: {},
    campos: {
      vcFirstName: 'Ana "A"',
      vcLastName: 'Silva\\Costa',
      vcOrg: 'Empresa; Com, Separadores',
    },
  },
];

/** O payload de cada caso, pelo web. */
function calcularNoWeb() {
  return CASOS.map((caso) => {
    let payload = null;
    let erro = null;
    try {
      payload = build(caso.tipo, caso.campos);
    } catch (e) {
      erro = e.message || String(e);
    }
    return { ...caso, payload, erro };
  });
}

/** O payload de cada caso, pelo Python. */
function calcularNoPython() {
  const ficheiro = join(AQUI, 'calcular-paridade.py');
  const saida = execFileSync('python', [ficheiro], { encoding: 'utf8' });

  /*
   * **A saida vem em base64**, e a razao esta no script do Python: um payload
   * tem emojis, e o `execFileSync` descodifica a saida com a codificacao da
   * consola — que no Windows e' cp1252. Sem o base64, o teste falha com um
   * `UnicodeEncodeError` na posicao 29, que e' uma falha de codificacao e nao
   * de paridade.
   */
  return JSON.parse(Buffer.from(saida, 'base64').toString('utf8'));
}

test('o Python e o web produzem o mesmo payload, byte a byte', () => {
  const noWeb = calcularNoWeb();
  const { casos: noPython } = calcularNoPython();

  /*
   * **O Python tem de ter produzido o mesmo numero de casos.** E' a verificacao
   * que impede a comparacao de passar a vazio: se o script do Python falhar e
   * devolver `[]`, o `map` nao encontra nada e o teste passa sem comparar nada.
   *
   * E a razao de o Python ser quem escreve: e' ele que manda na spec, e um
   * ficheiro de metade leria-se como "o Python concorda" quando o Python nao
   * disse nada.
   */
  assert.equal(
    noPython.length,
    noWeb.length,
    `o Python produziu ${noPython.length} casos e o web ${noWeb.length}. ` +
      'Um ficheiro de metade faz a comparacao passar sem comparar nada.',
  );

  const problemas = [];

  for (let i = 0; i < noWeb.length; i++) {
    const w = noWeb[i];
    const p = noPython[i];

    if (p.nome !== w.nome || p.tipo !== w.tipo) {
      problemas.push(
        `caso ${i}: o Python tem ${p.tipo}/${p.nome} e o web tem ${w.tipo}/${w.nome} — ` +
          'a ordem dos casos tem de ser a mesma, ou a comparação compara coisas diferentes',
      );
      continue;
    }

    const etiqueta = `${w.tipo}/${w.nome}`;

    if (p.erro) {
      problemas.push(`${etiqueta}: o Python deu erro — ${p.erro}`);
      continue;
    }

    if (!igual(p.payload, w.payload)) {
      // **A primeira diferenca, em pontos, e nao as duas strings inteiras.**
      //
      // Mostrar o payload na falha parte contra o `UnicodeEncodeError` do
      // console do Windows sempre que o texto tem um emoji ou um caractere CJK -
      // e o teste falha com um erro do console em vez de dizer o que difere.
      // Os pontos de codigo aparecem todos, e a comparacao e' a mesma.
      const i1 = primeiraDiferenca(p.payload, w.payload);
      problemas.push(
        `${etiqueta}: os payloads diferem na posicao ${i1}\n` +
          `      python: ${contexto(p.payload, i1)}\n` +
          `      web:    ${contexto(w.payload, i1)}`,
      );
    }
  }

  assert.deepEqual(
    problemas,
    [],
    `${problemas.length} de ${noWeb.length} casos diferem. A paridade nao e' negociavel: ` +
      'um payload diferente num cliente e um bug, mesmo que o teste desse cliente passe.',
  );
});

/** Duas cadeias iguais, em pontos de codigo e nao em unidades UTF-16. */
function igual(a, b) {
  if (a === null || b === null) return a === b;
  return a === b || [...a].join('\u0000') === [...b].join('\u0000');
}

/*
 * As listas de campos: a do navegador e a do CLI do Python.
 *
 * **E' a terceira vez que o mesmo conjunto aparece escrito, e a `AGENTS.md` avisa
 * exactamente disto:** "duas listas do mesmo conjunto divergem em silencio".
 *
 * O sintoma de uma chave errada aqui e' o pior dos dois. Um `--ssid` que
 * escrevesse `ssid` em vez de `wifiSsid` daria `WIFI:S:;P:segredo123;;` — o
 * comando responde com codigo 0, o ficheiro PNG escreve-se, o comando `tipos`
 * lista o campo, e **o telefone nao se liga a nada**. Nao ha erro, nao ha
 * sintoma visivel, e so quem tentar ligar e descobre.
 */
test('o CLI do Python conhece as mesmas categorias e os mesmos campos que o web', () => {
  const { catalogo } = calcularNoPython();

  assert.ok(catalogo, 'o script do Python nao mandou o catalogo');

  /*
   * **Nos dois sentidos**, e de proposito: uma categoria que o Python nao
   * conhece e' uma lacuna (o CLI nao a sabe fazer), e uma que ele conhece e o
   * web nao e' uma invencao (o CLI faz uma coisa que ninguem pediu).
   */
  assert.deepEqual(
    catalogo.categorias.slice().sort(),
    CATEGORY_IDS.slice().sort(),
    'as categorias do CLI do Python e as do navegador tem de ser as mesmas: ' +
      'o que falta e uma lacuna e o que sobra e uma invencao',
  );

  const problemas = [];

  for (const categoria of CATEGORIES) {
    // O PIX nao e' um `payload --tipo`, e tem comandos proprios com validacao.
    const noCli = catalogo.campos_cli[categoria.id];
    if (!noCli) continue;

    const doNavegador = categoria.fields.map((f) => f.key);
    const desconhecidos = noCli.filter((k) => !doNavegador.includes(k));

    if (desconhecidos.length > 0) {
      problemas.push(
        categoria.id + ': o CLI escreve ' + desconhecidos.join(', ') +
          ' e o navegador nao tem nenhum desses campos — a opcao sai vazia sem erro',
      );
    }
  }

  assert.deepEqual(
    problemas,
    [],
    problemas.length + ' divergencias entre a tabela do CLI e a do navegador. ' +
      'Duas listas do mesmo conjunto divergem em silencio.',
  );
});

/**
 * A primeira posicao onde as duas cadeias divergem, **em pontos de codigo**.
 *
 * Comparar por indice de UTF-16 daria uma posicao a mais quando o texto tem um
 * caractere fora do plano basico antes da diferenca, e o `contexto` mostraria a
 * linha errada. Que e' o caso do `texto` com emoji.
 */
function primeiraDiferenca(a, b) {
  const ca = [...a];
  const cb = [...b];
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    if (ca[i] !== cb[i]) return i;
  }
  return n;
}

/**
 * Uma janela em volta da diferenca, com o resto da linha visivel.
 *
 * **Mostra a linha inteira e nao uma janela de caracteres**, porque um payload
 * de vCard tem varias linhas e a diferenca num `;` e' invisivel num recorte de
 * 30 caracteres que apanha o inicio de outra propriedade. E a primeira versao
 * tinha um bug aqui — uma funcao que lia `texto` de fora do sitio — que
 * apanhava o `node --check` e nao a execucao.
 */
function contexto(texto, pos) {
  if (texto === null || texto === undefined) return '(null)';
  if (pos >= texto.length) return `(fim, ${texto.length} caracteres)`;

  const inicioLinha = texto.lastIndexOf('\n', pos) + 1;
  const fimLinha = texto.indexOf('\n', pos);
  const fim = fimLinha === -1 ? texto.length : fimLinha;

  /*
   * **Em pontos de codigo, e nao em caracteres crus.**
   *
   * Uma janela com um emoji tem dois caracteres UTF-16 e tres pontos de codigo,
   * e mostrar o caractere cru parte o console do Windows — que nao tem
   * codificacao para ele. A comparacao continua a ser exacta: o `pos` vem de
   * `primeiraDiferenca`, que tambem trabalha em pontos, e nao em unidades de
   * codigo.
   */
  return [...texto.slice(inicioLinha, fim)]
    .map((c) => (c.codePointAt(0) < 128 ? c : `\\u{${c.codePointAt(0).toString(16)}}`))
    .join('');
}
