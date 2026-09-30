// Deita fora os modulos que o web produz, para o Python os desenhar e o ZXing
// os ler, e para comparar os dois cliente byte a byte.
//
//   node spec/modulos-web.mjs > spec/_modulos-web.json
//
// **Este ficheiro existe por causa de um bug real.** A primeira versao do
// encoder de Codabar em Python pegava na cadeia toda e tirava as pontas —
// `codabar("A123456A")` — e o web pegava nos dados e na moldura separada,
// `codabar("123456", {inicio: "A", paragem: "A"})`.
//
// **As duas leituras passavam os testes das suas proprias stacks**, que e'
// exactamente o que a `AGENTS.md` diz que um bug de paridade e': nenhuma
// acusa a outra, porque cada uma le a que espera. O sintoma real, para quem
// usasse os dois clientes, era o mesmo campo a dar codigos diferentes.
//
// A correccao foi seguir o web, porque o web e' a implementacao mais antiga e a
// que esta verificada. Este script e' o que impede que a divergencia volte, e a
// razao de ele passar a `spec/` e nao ficar num comando de uma vez.

import { codabar, code39, code128, itf } from '../web/symbologies/index.js';

const casos = {
  'code39|A': code39('A'),
  'code39|AB': code39('AB'),
  'code39|CODIGO': code39('CODIGO'),
  'code39|0123456789': code39('0123456789'),
  'code39|ESPACO': code39('ESPACO'),
  'code39 sem controlo|CODIGO': code39('CODIGO', { comControlo: false }),
  'itf|12': itf('12'),
  'itf|1234': itf('1234'),
  'itf|123456': itf('123456'),
  'codabar|AA': codabar('123456'),
  'codabar|BB': codabar('123456', { inicio: 'B', paragem: 'B' }),
  'codabar|DD': codabar('12345', { inicio: 'D', paragem: 'D' }),
  'codabar largo': codabar('123456', { largo: true }),
  'codabar simbolos|12-34$56/78:+9.0': codabar('12-34$56/78:+9.0'),

  // --- Code 128 ---
  //
  // **Estes casos existem quase todos pela troca de conjuntos.** Um Code 128
  // que nunca muda de conjunto e' o caso facil e o que um teste estrutural
  // passaria; o que apanha o bug da troca ausente e' o `ABC123`, que volta do
  // leitor como `ABC,3`.
  'code128|Hi': code128('Hi'),
  'code128|ABC123': code128('ABC123'),
  'code128|12345678': code128('12345678'),
  'code128|abc-123': code128('abc-123'),
  // **A chave tem de ser o texto exacto que o web recebeu.** A primeira
  // versao escrevia `Code128 texto` e o web recebia `Code 128`, e o verificador
  // comparava 200 modulos com 134 sem explicar porquê — o nome do caso e' a
  // entrada do encoder, e um nome que nao seja a entrada e' um caso diferente
  // com o mesmo nome.
  'code128 com espaco|Code 128': code128('Code 128'),
  'code128 conjunto C|1234': code128('1234', { forcarConjunto: 'C' }),
  'code128 conjunto A|AB': code128('AB', { forcarConjunto: 'A' }),
  'code128 conjunto B|AB': code128('AB', { forcarConjunto: 'B' }),
};

const saida = {};
for (const [nome, codigo] of Object.entries(casos)) {
  saida[nome] = codigo.modules;
  console.error(`${nome.padEnd(24)} ${String(codigo.modules.length).padStart(5)} modulos`);
}

process.stdout.write(JSON.stringify(saida));
