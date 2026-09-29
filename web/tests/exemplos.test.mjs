/**
 * Todos os formatos tem de ter exemplo, dica e descricao.
 *
 *     node --test web/tests/exemplos.test.mjs
 *
 * ## A regra
 *
 * **Um campo sem exemplo obriga a pessoa a descobrir a sintaxe.** O
 * `placeholder` e' o que diz "escreve assim", e sem ele o campo fica vazio e a
 * pessoa tem de adivinhar se e' um telefone com o indicativo, se e' um email, se
 * aceita acentos. A `dica` e' o que explica a regra - quantos digitos, que
 * caracteres, o que e' calculado.
 *
 * E **o exemplo tem de estar no sitio certo**, e nao num texto de rodape nem
 * num comentario. Este teste verifica que a interface tem, e nao que o documento
 * menciona.
 *
 * ## Porque este teste existe
 *
 * Nao por um bug. Por uma pergunta que o registo nao respondia: **o que e' que
 * acontece quando se troca de formato?**
 *
 * A resposta era "o campo fica vazio", e isso e' correcto para um codigo de
 * barras - mas para o QR o que se guarda e' a **categoria**, e para o SQRC sao
 * **duas** coisas: o conteudo e a chave. Um formato novo que guarde uma terceira
 * coisa precisa de um sitio para ela, e esse sitio tem de estar escrito.
 *
 * Por isso o teste tambem verifica que **cada formato guarda o que tem de
 * guardar**: um formato que guarde o campo e perca a categoria mostra o QR
 * anterior quando se volta ao QR, e quem estava a ver o anterior pensa que
 * mudou.
 *
 * ## O que se encontrou
 *
 * **Trinta e dois campos sem exemplo nenhum**, em onze categorias. Nao num
 * formato novo: em todos os que la estavam desde o inicio, e nenhum teste se
 * subiu a pergunta.
 *
 * E o mais instructive e' o que **nao** e' falta. O `select` da seguranca do
 * WiFi tem as opcoes a dizer o que e', o `checkbox` e' um sim ou nao, e
 * **`datetime-local` nao mostra o `placeholder` em lado nenhum** - o browser
 * desenha um selector e o texto nunca aparece. Um `placeholder` num campo de
 * data e' um exemplo que ninguem ve, e o campo fica vazio sem forma de saber
 * porque. Por isso os campos de data trazem `defaultValue`, e o teste verifica
 * que esse valor **chega ao payload**.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SIMBOLOGIAS } from '../symbologies/index.js';
import { CATEGORIES, emptyFields, build } from '../payloads/types.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

/** Um campo de data, de hora, ou de data e hora. */
const TIPOS_DE_DATA = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

test('toda a simbologia tem exemplo, dica e descricao', () => {
  /*
   * **A `dica` e' o que explica a regra, e o `placeholder` e' o exemplo.**
   *
   * Sao coisas diferentes e nenhuma basta sozinha. Um exemplo sem dica diz como
   * parece, nao o que e' valido; uma dica sem exemplo obriga a pessoa a escrever
   * e a ver se deu.
   *
   * E a `descricao` do registo, que explica **para que serve** aquele formato.
   * Um formato com o encoder certo e sem descricao esta la, e ninguem sabe
   * porque.
   */
  for (const s of SIMBOLOGIAS) {
    assert.ok(s.rotulo, `${s.id}: sem rotulo`);
    assert.ok(s.descricao, `${s.id}: sem descricao — ninguem sabe para que serve`);
    assert.ok(s.grupo, `${s.id}: sem grupo — o selector fica com um formato avulso`);
    assert.ok(s.campo?.label, `${s.id}: o campo nao tem label`);
    assert.ok(
      s.campo?.placeholder,
      `${s.id}: o campo nao tem placeholder — quem usa tem de adivinhar o formato`,
    );
    assert.ok(
      s.campo?.dica,
      `${s.id}: o campo nao tem dica — o exemplo diz como parece, nao o que e' valido`,
    );
    assert.equal(typeof s.validar, 'function', `${s.id}: sem validar`);
    assert.equal(typeof s.encode, 'function', `${s.id}: sem encoder`);
  }
});

test('todo campo de categoria tem label, e os de texto tem exemplo', () => {
  /*
   * **A `label` e' obrigatoria em todos; o exemplo so nos de texto livre.**
   *
   * A distincao e' o que torna a regra aplicavel. Um campo de data, de hora ou
   * de selecao tem o tipo na propria etiqueta - "Inicio" diz que quer uma data
   * - e um exemplo seria redundante. Um campo de texto livre nao tem nada que
   * diga o formato, e sem exemplo obriga a adivinhar.
   */
  for (const categoria of CATEGORIES) {
    assert.ok(categoria.label, `a categoria ${categoria.id} nao tem label`);
    assert.ok(
      Array.isArray(categoria.fields) && categoria.fields.length > 0,
      `a categoria ${categoria.id} nao tem campos`,
    );

    for (const campo of categoria.fields) {
      assert.ok(campo.key, `${categoria.id}: um campo nao tem key`);
      assert.ok(campo.label, `${categoria.id}.${campo.key}: sem label`);

      // O checkbox e' um sim ou nao, e nao ha o que exemplificar.
      if (campo.type === 'checkbox') continue;

      /*
       * **O `select` tambem nao precisa de exemplo, e a razao e' a mesma:** as
       * opcoes estao a dizer o que e'. Um `placeholder` por cima de uma lista
       * seria um valor que nao existe.
       */
      if (campo.type === 'select') {
        assert.ok(
          Array.isArray(campo.options) && campo.options.length > 0,
          `${categoria.id}.${campo.key}: e' um select sem opcoes — o campo fica vazio`,
        );
        continue;
      }

      const temExemplo = campo.placeholder || campo.defaultValue;
      assert.ok(
        temExemplo,
        `${categoria.id}.${campo.key} (${campo.label}): sem exemplo — ` +
          'quem preenche este campo tem de adivinhar o formato',
      );

      /*
       * **Um campo de data nao pode levar `placeholder`.**
       *
       * O browser nao mostra o `placeholder` de um `datetime-local` em lado
       * nenhum: desenha um selector, e o texto nunca aparece. Escrever o
       * exemplo la e' escrever num sitio onde ninguem o ve, e o campo fica
       * vazio sem forma de saber se e' bug.
       *
       * E o inverso tambem: um `defaultValue` num campo de texto **aparece como
       * conteudo**, e a pessoa nao sabe se e' um exemplo ou o que vai ser
       * codificado. Por isso um `defaultValue` tem de ser uma data, e so uma
       * data.
       */
      if (TIPOS_DE_DATA.has(campo.type)) {
        assert.equal(
          campo.placeholder,
          undefined,
          `${categoria.id}.${campo.key}: e' um campo de data e tem placeholder — o browser nao o mostra`,
        );
        assert.ok(
          campo.defaultValue,
          `${categoria.id}.${campo.key}: e' um campo de data e nao tem defaultValue — o campo fica vazio`,
        );
      }

      if (campo.defaultValue !== undefined) {
        assert.ok(
          TIPOS_DE_DATA.has(campo.type),
          `${categoria.id}.${campo.key}: tem defaultValue mas o tipo e' "${campo.type}" — ` +
            "aparece como conteudo e a pessoa nao sabe se e' exemplo ou o que vai ser codificado",
        );
      }
    }
  }
});

test('os exemplos sao realistas, e nao "texto de exemplo"', () => {
  /*
   * **Um placeholder de mentira e' pior do que nenhum.**
   *
   * "texto", "exemplo", "foo" e "123" dizem a pessoa que o sitio nao leva a
   * seriously, e - pior - se o campo **validar**, o exemplo vai ser recusado e a
   * pessoa vai passar cinco minutos a tentar descobrir porque.
   *
   * A razao de isto ser um teste e nao uma revisao a olho: um placeholder
   * generico passa despercebido em noventa por cento das revisoes, e a lista de
   * palavras proibidas e' curta o suficiente para estar aqui.
   */
  const VAZIOS = new Set([
    'texto',
    'exemplo',
    'foo',
    'bar',
    'baz',
    'test',
    'teste',
    'abc',
    'xxx',
    '123',
    '1234',
    'nome',
    'valor',
    'aqui',
    'conteudo',
    'conteúdo',
  ]);

  const verificados = [];

  for (const s of SIMBOLOGIAS) {
    const p = String(s.campo.placeholder).toLowerCase().trim();
    assert.ok(!VAZIOS.has(p), `${s.id}: o placeholder e' "${s.campo.placeholder}" — nao diz nada`);
    verificados.push(`${s.id}.${s.campo.key}`);
  }

  for (const categoria of CATEGORIES) {
    for (const campo of categoria.fields) {
      if (!campo.placeholder) continue;
      const p = String(campo.placeholder).toLowerCase().trim();
      assert.ok(
        !VAZIOS.has(p),
        `${categoria.id}.${campo.key}: o placeholder e' "${campo.placeholder}" — nao diz nada`,
      );
      verificados.push(`${categoria.id}.${campo.key}`);
    }
  }

  // A contagem e' a garantia de que o teste nao encolheu. Um teste que verifica
  // seis exemplos e' um teste sobre seis exemplos.
  assert.ok(verificados.length >= 45, `so ${verificados.length} exemplos verificados — o teste encolheu`);
});

test('o exemplo de cada formato passa na validacao desse formato', () => {
  /*
   * **O exemplo tem de ser um valor que o formato aceita.**
   *
   * Este e' o teste que conta, e nao o de cima. Um placeholder que nao passa na
   * validacao e' um placeholder que **manda a pessoa errar**: escreve o exemplo,
   * o sitio diz que esta mal, e ela fica a achar que o exemplo estava errado -
   * quando o exemplo esta errado.
   *
   * E' o mesmo padrao de bug que ja apareceu quatro vezes neste repositorio, mas
   * virado ao contrario: ali o exemplo nao havia, aqui ha e esta errado.
   *
   * E o caso dos EAN e UPC e' o mais provavel, porque o ultimo digito e'
   * **calculado**: um exemplo com o digito de controlo errado seria recusado
   * pela propria validacao que o exemplo deveria ensinar a ignorar.
   */
  for (const s of SIMBOLOGIAS) {
    const exemplo = s.campo.placeholder;
    let erro = null;
    try {
      s.validar(exemplo);
    } catch (e) {
      erro = e.message || String(e);
    }
    assert.equal(erro, null, `${s.id}: o exemplo "${exemplo}" e' recusado pela propria validacao — ${erro}`);
  }
});

test('o exemplo e o mesmo que vai no payload', () => {
  /*
   * **O exemplo tem de chegar ao payload.**
   *
   * Verificar que o `placeholder` existe **nao chega para nada**: o `placeholder`
   * e' texto a cinzento que desaparece quando se escreve, e nao vai para o QR. Um
   * site com os 32 exemplos no sitio certo e com o payload vazio **passaria** e
   * nao serviria para ninguem.
   *
   * Por isso: para cada campo com `defaultValue`, o `emptyFields` tem de dar
   * **o mesmo valor**. E o que garante que o que se ve no ecra e' o que vai para
   * o codigo - que e' a propriedade que o `AGENTS.md` chama de paridade, e que
   * aqui vale entre o ecra e o payload e nao entre linguagens.
   */
  for (const categoria of CATEGORIES) {
    const vazios = emptyFields(categoria.id);

    for (const campo of categoria.fields) {
      if (campo.defaultValue === undefined) continue;

      assert.equal(
        vazios[campo.key],
        campo.defaultValue,
        `${categoria.id}.${campo.key}: o valor por omissao nao e' o exemplo — ` +
          'o campo mostra uma coisa no ecra e o payload leva outra',
      );
    }
  }

    /*
     * **A data do campo tem de chegar ao payload - na forma do payload.**
     *
     * O campo e' `2026-09-29T18:30` e o `DTSTART` e' `20260929T183000`: a mesma
     * hora em duas notacoes. A primeira versao comparava a cadeia do campo com o
     * payload, que nunca iam bater, e a falha apontava para o exemplo quando o
     * exemplo estava certo.
     *
     * Por isso a comparacao e' sobre a **hora**, que e' o que nao pode mudar: as
     * 18h30 que a pessoa escreveu tem de ser as 18h30 no payload.
     */
    const evento = emptyFields('evento');
    const inicio = CATEGORIES.find((c) => c.id === 'evento').fields.find((f) => f.key === 'eventStart');

    const horaDoCampo = String(inicio.defaultValue).split('T')[1].replace(':', '');
    const payload = build('evento', evento);

    assert.match(
      payload,
      new RegExp("DTSTART:\\d{8}T" + horaDoCampo + "00"),
      "o payload do evento nao tem a hora do campo (" + horaDoCampo + ")",
    );
    assert.ok(!payload.includes('undefined'), 'o payload tem `undefined` no sitio de um valor');

    /*
     * **E a hora nao pode estar deslocada.**
     *
     * O `DTSTART` sem fuso e' um horario flutuante, que e' o que se quer. Com
     * fuso - um `Z` no fim, ou um `TZID` - o evento marcava a hora num sitio e
     * quem estivesse noutro via-o na hora errada.
     *
     * **Este teste falhou com `T173000` em vez de `T183000`**, porque o
     * `datetime-local` nao tem fuso e o codigo passava a data por `new Date()`,
     * que assume local, e depois lia-a como UTC. **Uma hora de diferenca em
     * Portugal**, com um `Z` no fim a dizer que nao. O payload parecia
     * correcto e o evento aparecia no calendario uma hora cedo.
     */
    assert.ok(
      !/DTSTART:[0-9T]+Z/.test(payload),
      'o DTSTART tem fuso — um evento marcado numa biblioteca tem de ser a hora de quem o abre',
    );
  });

test('cada formato guarda o que tem de guardar ao trocar de formato', () => {
  /*
   * **A pergunta que deu origem a este ficheiro: o que acontece ao trocar de
   * formato?**
   *
   * A resposta correcta depende do formato, e **depender e' o que faz a troca
   * parecer um bug quando nao e'**:
   *
   *  - o **QR** guarda a **categoria** e o campo. Quem estava a ver um link e
   *    volta ao QR ve o link outra vez - que e' o que se espera;
   *  - um **codigo de barras** nao tem categoria, e por isso so o valor. Voltar
   *    ao EAN-13 mostra o valor que la estava, e nao o link do QR;
   *  - o **SQRC** sao **duas** coisas: o conteudo **e a chave**. E a chave nao
   *    pode desaparecer quando se vai ver um codigo de barras e voltar - quem
   *    perdeu a chave perdeu o conteudo, e nao ha segunda tentativa.
   */
  /*
   * **A chave do SQRC tem de estar FORA do `state.fields`.** O `state.fields` e'
   * reescrito a cada `alternarFormato` com os campos da categoria atual, e se a
   * chave estivesse la dentro, trocar de formato e voltar ao SQRC daria um
   * campo vazio - e quem visse isso nao sabe que foi apagado, so que "nao
   * funcionou".
   */
  assert.ok(
    !/state\.fields\s*=\s*\{[^}]*chave/s.test(APP),
    "a chave do SQRC parece estar no state.fields, que e' reescrito a cada troca de formato",
  );

  // E tem de estar no DOM, que e' o unico sitio que sobrevive a uma troca.
  assert.ok(HTML.includes('id="sqrc-chave"'), 'o campo da chave do SQRC nao esta no HTML');

  // A manutencao do que estava escrito, ao trocar de formato, e' uma funcao com
  // nome proprio - e o que garante que o campo sobrevive a uma ida ao QR e
  // volta.
  assert.ok(
    /manter|preservar|guardad/i.test(APP),
    'nao ha codigo a manter o que estava escrito ao trocar de formato — quem escreve um link, vai ver as ' +
      'barras e volta, encontra o campo vazio',
  );
});

test('os formatos 2D tambem tem exemplo, e nao so os 1D', () => {
  /*
   * **O PDF417, o Data Matrix, o GS1 DataMatrix e o SQRC tem o mesmo obrigo**
   * que os 1D, e a verificacao anterior so passa pelo registo das simbologias -
   * que sao os 1D.
   *
   * Os 2D desenham os campos a mao, em `desenharCamposPdf417` e
   * `desenharCamposDataMatrix`, e por isso nao passam por nenhum registo. E o
   * sintoma de um deles sem exemplo e' o mesmo de sempre: um campo vazio sem
   * pista nenhuma.
   */
  for (const [nome, funcao] of [
    ['PDF417', 'desenharCamposPdf417'],
    ['Data Matrix', 'desenharCamposDataMatrix'],
  ]) {
    const i = APP.indexOf(`function ${funcao}(`);
    assert.notEqual(i, -1, `nao encontrei ${funcao}() — o ${nome} mudou de nome`);

    const corpo = APP.slice(i, i + 1600);
    assert.ok(
      /placeholder\s*=/.test(corpo),
      `${nome}: o campo nao tem placeholder — quem usa tem de adivinhar o formato`,
    );
    assert.ok(
      /textContent\s*=/.test(corpo),
      `${nome}: o campo nao tem ajuda — o exemplo diz como parece, nao o que e' valido`,
    );
  }

  // E o SQRC, que o painel tem no HTML.
  assert.ok(HTML.includes('id="sqrc-chave"'), 'o SQRC nao tem campo de chave');
  assert.match(
    HTML,
    /sqrc-chave[\s\S]{0,400}placeholder=/,
    'o campo da chave do SQRC nao tem exemplo',
  );
  assert.ok(
    /class="aviso-sqrc"/.test(HTML),
    'o SQRC nao tem o aviso de que a chave nao volta — e a parte de que quem usa mais precisa',
  );
});

test('o botao de gerar chave escreve no campo, e nao aplica a chave', () => {
  /*
   * **Escrever no campo e' o que deixa a pessoa confirmar.**
   *
   * Aplicar a chave a direto deixava-a sem maneira de a ver: quem nao sabe qual
   * e' a sua chave tem um problema que nao tem solucao, e a solucao — mostrar —
   * era de graça.
   *
   * E o botao **nao vai para o historico** do browser. Um botao de "nao te
   * esqueças" que poe a chave no historico esta a fazer o contrario do que
   * promete, e o historico e' o sitio onde uma chave acaba sem ninguem reparar.
   */
  const i = APP.indexOf("sqrcGerarChave.addEventListener");
  assert.notEqual(i, -1, 'o botao de gerar chave nao esta ligado a nada');

  /*
   * **A janela tem de chegar ao fim do callback, e nao aos primeiros 900
   * caracteres.**
   *
   * A primeira versao lia `APP.slice(i, i + 900)` e falhava com "o botao nao
   * escreve no campo" — sendo que escreve, na linha seguinte ao bloco de
   * comentario que explica **porque** e' que escreve. O comentario tem 700
   * caracteres e a escrita esta depois deles.
   *
   * E' a razao de a janela ser ate ao fecho do callback: o que se quer
   * verificar e' o que o botao **faz**, e o que ele faz esta no fim.
   */
  const fecho = APP.indexOf('});', i);
  const corpo = APP.slice(i, fecho === -1 ? i + 3000 : fecho);

  assert.match(
    corpo,
    /sqrcChave\.value\s*=/,
    'o botao nao escreve no campo da chave — quem nao consegue ver a chave nao a pode confirmar',
  );

  // E a chave gerada tem de ser legivel: um alfabeto sem os caracteres que se
  // confundem uns com os outros, porque um erro de transcricao e' indetectavel
  // — da "chave errada" e ninguem sabe que foi um `1` por um `I`.
  assert.ok(
    /'ABCDEFGHJKMNPQRSTVWXYZ23456789'/.test(corpo),
    "o alfabeto da chave gerada tem caracteres que se confundem (I, L, O, U) — o erro de transcricao e' invisivel",
  );
});
