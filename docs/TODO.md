# O que falta

> Checklist do que ainda não está feito. Os BLOQUEIOS 1–3 já estão resolvidos —
> ficaram os quatro que não dependem da spec.
>
> Ver `IDEIA.md` para o raciocínio e `COMO-USAR.md` para usar o que já existe.

**Estado:** 4 stacks completas (web, C#, Java, Python), 11 tipos de QR, e as
4 simbologias de códigos de barras em **cinco** stacks — web, Python, Java, C# e
o `:core` do Kotlin. **1056 testes** (292 site, 323 Python, 236 C#, 161 Java,
44 Kotlin). A
spec do PIX está validada contra o exemplo oficial do Banco Central e os 7
bugs do `QrService.cs` original estão corrigidos com teste de regressão.

**A app do C# tem agora testes de interface** — o `InterfaceTestes`, que abre o
`MainForm` de verdade. Foi ele que corrigiu três defeitos de desenho: os campos
9 a 11 do VCard estavam **por baixo do fundo de um painel de 280 px, sem barra e
sem atalho**, e quem preenchesse o nome, o telefone e o e-mail via o formulário
calado; a coluna dos campos estava num `90` escrito à mão, por onde o rótulo
"Nome do recebedor" do Pix entrava 25 px; e a etiqueta de uma caixa de
verificação era desenhada na mesma linha da caixa, com o texto duas vezes.
**Todos medidos, nenhum inventado.** Ver a skill `winforms-design`.

O que bloqueia: **o Go ainda não tem as simbologias de barras**, e o Go está
em branco — tem a pasta e o README, mas zero linhas de Go. É o último da
fila, por decisão e não por dificuldade. A ordem de propagação foi **Java →
mobile (Kotlin) → C# → Python → e Go no fim**, e **o Kotlin já está feito**:
as quatro simbologias com tabelas do mesmo gerador, e 37 casos lidos pelo
ZXing. Ver «Simbologias nas outras stacks» abaixo.

---

## BLOQUEIO 1 — Spec dos tipos (obrigatório)

Sem isto, cada stack nova inventa o seu payload e ninguém sabe qual está certo.

- [x] `docs/TIPOS-QR.md` — para os 22 tipos, escrever:
  - [x] o formato exato do payload (com exemplo preenchido)
  - [x] campos obrigatórios / opcionais / validações
  - [x] regras de **escaping** por tipo
  - [x] o limite de bytes de cada tipo
- [x] Fazer primeiro só dos **10 tipos que já existem**, escritos a partir do
      `QrService.cs`, para não haver surpresa
- [x] Marcar explicitamente onde o C# atual está **errado** (VCard sem morada,
      iCal sem escaping, etc.) — a spec fica com a versão correta, o C# passa a
      ter um bug a corrigir
- [ ] Rever o payload do BCB contra o PDF oficial do Banco Central (feito por
      via indireta: o CRC do exemplo publicado bate — `1D3D`)

**Saída:** alguém que nunca viu o código consegue gerar o payload correto a
partir da doc sozinha.

---

## BLOQUEIO 2 — Vetores de teste (obrigatório)

A spec em prosa não é verificável. Precisamos de input → output esperado.

- [x] `spec/vectors.json` com 10 casos de PIX, cada um verificado por CRC,
      round-trip e **descodificação do PNG**
- [x] Gerador `spec/gerar-vectors.py` — regera e revalida a spec
- [x] Testes Python a lerem a spec (não strings transcritas à mão)
- [x] Testes C# a lerem a mesma spec — **as duas stacks concordam byte a byte**
- [x] Casos de PIX cobrem: UUID, email, CPF com máscara, CNPJ, telefone sem
      `+55`, nome >25, acento, descrição, uso único + CEP, valor com milhar
- [ ] `spec/payloads.json` — metadados por tipo (nome PT/EN, ícone, ordem,
      campos, validação) — necessário para as UIs
- [x] **Vetores dos 10 tipos restantes.** A spec tem 34 vectores e 11 tipos:
      24 de transporte e 10 de PIX, todos lidos por um ZXing antes de
      entrar. `spec/casos.py` tem a lista, e `gerar-vectors.py` gera a
      partir da implementação de referência — que para isso é que ela tinha
      de ter os dez tipos.
      > **O que isto apanhou, e são três bugs que nenhum teste via.**
      >
      > - **O C# e o Java convertiam a hora do evento para UTC** e escreviam
      >   um `Z` que ninguém tinha escrito. O sintoma era uma hora de
      >   diferença — quem marcava uma reunião às 18h30 via-a às 17h30 — e
      >   o pior: **os dois testes que havia afirmavam o bug.** O de Java
      >   chamava-se `horaDoEventoConvertidaParaUtc` e tinha de fixar o fuso
      >   da máquina para o payload ser estável, com um comentário a dizer que
      >   passava no portátil e falhava noutro computador.
      > - **A app Windows escrevia o QR na codificação do sistema.** A
      >   sobrecarga de `string` do QRCoder usa a cp1252 em vez de UTF-8, e um
      >   vCard com «Reparação» ia com o `ã` num byte só. Lido como UTF-8 — ou
      >   pela adivinhação de Shift-JIS do ZXing — o nome aparecia trocado. Nenhum
      >   teste via: a spec só tinha PIX, e as chaves PIX são ASCII.
      > - **O ZXing adivinha a codificação** de um segmento em modo byte, e a
      >   adivinhação é um teste de Shift-JIS. Um iCalendar com acentos passa
      >   nele e sai com os caracteres trocados a partir da posição 190. A
      >   correção é dizer a codificação ao leitor.
      >
      > **Nenhum dos três era um bug de payload, e é por isso que escaparam
      > todos.** O payload estava certo nas quatro cópias; o que divergia era a
      > hora, a codificação da imagem e a do leitor. A spec só apanha
      > divergências de payload — e por isso que a leitura, que é outro nível,
      > teve de mudar também.
- [ ] `spec/verificar-paridade.*` — script que corre as stacks e imprime
      ✅/❌ por vetor (hoje corre-se `dotnet test` e `pytest` à parte)
- [ ] Casos de erro: payload vazio, campo em falta, limite excedido

---

## BLOQUEIO 3 — Corrigir os bugs do C# ANTES de propagar

Se propagarmos os bugs, os 5 clientes nascem com os mesmos 7 defeitos.
Corrigir agora custa 1 ficheiro; corrigir depois custa 6.

Ficheiro: `csharp/core/` (o `QrService.cs` foi substituído por ele)

- [x] **VCard**: morada completa (rua, cidade, CEP, país) — antes todos os
      parâmetros de endereço passavam `""`
- [x] **VCard**: dois telefones com tipo (`cell`, `work`), `N` com a família
      primeiro, `FN` e `N` consistentes
- [x] **iCal**: CRLF explícito em vez de `Environment.NewLine`
- [x] **iCal**: escaping de `,` `;` `\` e newlines
- [x] **Geo**: validação de intervalo (lat ±90, lng ±180)
- [x] **Geo**: `double?` em vez de `string`, com parsing invariante na UI
- [x] **Link**: recusa `javascript:`, `data:`, `file:` e afins
- [x] **Telefone**: normalização consistente (`00`, `+`, espaços)
- [x] Cada correção tem teste de regressão em `csharp/tests/BugFixTests.cs`

Bónus que saíram de casa: `mailto:` minúsculo com percent-encoding, escaping de
WiFi, limite de SSID/password, caracteres de SMS validados, e limite de bytes
com mensagem concreta.

---

## BLOQUEIO 4 — Decisões a tomar (preciso de resposta tua)

Estas não são técnicas, são de produto. Respondemos **antes** de escrever
qualquer código novo:

- [x] **Qual é a implementação de referência?** → Python (rec seguido)
- [ ] **A web leva framework?** (rec: não, HTML + ES modules, zero build)
- [ ] **A app Android exige conta/Play Store ou basta APK sideload?** (muda
      assinatura, keystore, e se vale a pena)
- [ ] **Java desktop: Windows só, ou também macOS/Linux?** (rec: Windows, igual
      ao C#; macOS só com `jpackage` a dar)
- [x] **PIX entra já?** → sim, implementado e validado
- [ ] **Estilo e logo nos QR: em todas as plataformas ou só web+Python?**
- [ ] **QR dinâmico (link curto + analytics)?** isso implica backend, muda o
      âmbito de "app local" para "serviço"

---

## BLOQUEIO 5 — Repos e ferramentas

- [x] `.gitignore` cobrir Java (`target/`, `*.class`), Gradle/Android
      (`.gradle/`, `build/`, `local.properties`), Python (`__pycache__/`,
      `.venv/`, `*.egg-info/`), Node (`node_modules/`)
- [ ] CI (GitHub Actions) com um job por stack, mesmo que vazio no início
- [x] `README.md` raíz reescrito como índice das 5 pastas
- [x] `python/README.md` escrito (os outros conforme forem implementados)
- [x] `requirements.txt` em `python/`
- [x] `docs/COMO-USAR.md` — como usar e como partilhar cada app
- [x] README próprio em cada pasta (web, csharp, python, java, kotlin)
- [ ] `spec/verificar-paridade.sh` — correr as stacks todas de uma vez

---

## BLOQUEIO 6 — Simbologias (começado no cliente web)

Mais do que QR code. Os 1D lineares e os 2D matriciais, cada um com o seu
encoder, e todos verificados pelo ZXing antes de entrarem.

**Feito e verificado.** Cada um com o ZXing a devolver a string certa. São
28 casos de teste, todos legíveis por leitor independente.

### O dígito de controlo do Code 39 é o resto da divisão, e está decidido

> **Isto está aqui para não ser re-investigado.** O comentário da classe Java
> afirmava que a regra do formato é «a letra que torna a soma múltipla de 43» —
> ou seja `(43 - soma % 43) % 43` — e que o repositório se desviava dela. Isso
> chegou a ponto de parecer um bug em três stacks, e **o que estava errado era o
> comentário**.
>
> **A regra é o resto.** Soma-se o índice de cada letra, divide-se por 43, e o
> dígito é a letra desse índice. Duas autoridades independentes:
>
> 1. **A Zebra**, na documentação do ZPL, dá o exemplo trabalhado: `12345ABCDE/`
>    soma 115, `115 / 43 = 2` com resto 29, e 29 é a letra `T`.
> 2. **O ZXing**, lido com o `Code39Reader(true)` — que valida o dígito — aceita
>    este e **rejeita** o complementar. Testado, não de memória.
>
> O `python-barcode`, de onde vêm as tabelas, faz o mesmo, e as três stacks e o
> `spec/verificar-lineares.py` concordam. O `SimbologiasTestes` afirma agora o
> exemplo da Zebra, e a regra complementar faz o teste falhar — verificado
> reintroduzindo-a.
>
> **A lição, e é a mesma das tabelas:** uma regra que se sabe de cor merece um
> exemplo publicado que a confirme. Um comentário que descreve a regra ao
> contrário convida a «corrigir» três stacks, e o custo de o não fazer é um
> bloco de trabalho inteiro à procura de um bug que não existe.

### 1D — 7 de 11

- [x] EAN-13 — `web/symbologies/upcean.js`
- [x] EAN-8
- [x] UPC-A
- [x] Code 128, com escolha automática de conjunto — `web/symbologies/code128.js`
- [x] Code 39, com dígito de controlo mod 43 — `web/symbologies/code39.js`
- [x] ITF-14, o das caixas — `web/symbologies/itf.js`
- [x] Codabar, com início e paragem à escolha — `web/symbologies/codabar.js`
- [ ] **UPC-E** — deixado de fora de propósito. A tabela de paridade depende do
      dígito de controlo do UPC-A expandido, e escrevê-la de memória é a forma
      rápida de entregar códigos que não passam em leitor nenhum. Entra com a
      ISO/IEC 6120 à mão. É a versão comprimida do UPC-A, e só codifica uma
      parte dos produtos.
- [x] **Code 93** — mais compacto e mais seguro que o Code 39. Não é um
      Code 39 melhorado: tem dois dígitos de controlo e uma tabela diferente.
      > **Feito e verificado pelo ZXing**, 17 de 17 casos lidos, **em duas
      > stacks** — web e Python, com paridade de 17/17 módulo a módulo.
      >
      > As duas tabelas não vêm do `python-barcode`, que não tem Code 93 — vêm do
      > próprio **ZXing**, o `Code93Reader.java`, e o
      > `spec/gerar-tabelas-code93.py` gera os cinco ficheiros a partir de lá.
      > **Uma tabela, cinco alvos:** web, Python, Java, Kotlin e C#, que é o que
      > a `AGENTS.md` pede em vez de cinco transcrições.
      >
      > **Duas tabelas, e a segunda estava errada.** Os 48 padrões são os nove
      > módulos de cada carácter. Os **pares de escape** dos caracteres de
      > controlo são outra coisa, e vêm do `decodeExtended` do mesmo ficheiro —
      > **invertido**, porque o ZXing sabe descodificar um par e o encoder
      > precisa do contrário.
      >
      > **O `controle()` que o web tinha estava errado em vinte e quatro dos
      > trinta e dois caracteres de controlo**, e ninguém reparou porque
      > **nenhum dos dez casos tinha um**. Entre os errados:
      >
      > | código | ZXing | o que o web fazia | o que isso codificava |
      > |---|---|---|---|
      > | 0, NUL | `bU` | `'0'` | o algarismo zero |
      > | 6, 7, 8 | `aF`–`aH` | `bC`–`bE` | 29, 30, 31 |
      > | 9, tab | `aI` | `bW` | 96 |
      > | 13, CR | `aM` | `'0'` | o algarismo zero |
      > | 27, ESC | `bA` | `bV` | 64 (`@`) |
      >
      > Um CR saía como um `0`, e o ZXing devolvia um `0` onde estava um CR.
      > **Todos os testes estruturais passavam**, porque o código se desenha
      > certo e o checksum bate — o checksum é sobre os índices, e `'0'` é um
      > índice válido.
      >
      > **A correcção não foi corrigir a escada: foi não haver escada.** Os
      > pares vêm da tabela gerada, e o encoder passou a ser uma busca. Uma
      > tabela que se resolve por busca não diverge entre linguagens, porque a
      > fonte é a tabela.
      >
      > **E os casos de leitura agora têm caracteres de controlo**, que é o que
      > teria apanhado isto da primeira vez: CR, ESC, BEL, NUL, US, DEL e os 32
      > em fila. O ficheiro `gerar-code93.mjs` dizia na primeira linha que os
      > casos cobriam "caracteres de controlo", e não havia um único.
      >
      > Três bugs anteriores, e **nenhum era de tabela**: os 9 bits lidos de três
      > maneiras diferentes, o asterisco ausente do código, e a barra de
      > terminação ausente. Todos se desenhavam e nenhum lia.
- [ ] **Code 11** — telecomunicações. Formato antigo, três dígitos de
      controlo.
      > **Decisão do utilizador: fica para mais tarde**, pela mesma razão do
      > Code 93.
- [x] **GS1-128** — Code 128 com o FNC1 no início e os separadores entre campos.
      **Feito e verificado: 8 casos lidos pelo ZXing, `]C1` reconhecido, e o PNG
      exportado pelo browser lido.** `web/symbologies/gs1-128.js`
      > **Não é "Code 128 com FNC1 no início", que foi o que se escrevia aqui.**
      > São três coisas, e as três são obrigatórias:
      >
      > 1. **O FNC1 do início**, logo a seguir ao caracter de início do conjunto.
      > 2. **Um FNC1 no fim de cada campo de comprimento variável** — *menos no
      >    último*, porque um separador no fim não separa de nada.
      > 3. **Ficar no conjunto B**, sem comutar. Uma comutação para o conjunto C
      >    partiria um campo ao meio sem o leitor dar por isso.
      >
      > **Os 541 AIs estão numa tabela gerada** do JSON-LD de `ref.gs1.org`, pela
      > ferramenta oficial da GS1. Cada AI traz o formato, o comprimento, se leva
      > separador e um regex. Não se escreve uma tabela assim de memória: o Code 39
      > deste repositório foi escrito de memória e saiu com doze elementos por
      > carácter em vez de nove, e nenhum teste estrutural a apanhou. Um AI com o
      > comprimento errado desenha-se perfeito e o leitor lê-o como inválido.
      >
      > A notação de formato tem **quatro** tipos de campo — `N`, `X`, `Y` e `Z` —
      > e um `grep` inicial que só procurava `N` e `X` perdeu os dois últimos. Os
      > `Y` e `Z` só aparecem uma vez cada, nos AIs 8010 e 8030.
      >
      > **O que o ZXing devolve foi medido, e é mais do que se esperava.** O
      > leitor dá três coisas, e só uma delas distingue um GS1-128 com separadores
      > de um sem eles:
      >
      >  - `text` — os AIs **entre parênteses**, sem separadores. É a forma
      >    humana, e não distingue nada sobre os separadores.
      >  - `bytes` — os campos **sem** parênteses, com `0x1D` onde está o
      >    separador. É aqui que os separadores se veem.
      >  - `symbology_identifier` — `]C1` quando há FNC1 no início, `]C0` quando
      >    não há. É a única prova de que é GS1 e não Code 128.
      >
      > Duas versões do teste falharam por esperar `<GS>` no texto, porque um
      > script escrito à mão mostrava isso. Um script à mão chega a conclusões
      > diferentes do leitor a sério.
      >
      > **O `python-barcode` não serve de referência.** O `Gs1_128` dele prefixa
      > FNC1 e não emite separadores nenhum, e o `get_fullcode()` devolve
      > `'(01)04012345678901(17)270630'` — com os parênteses **dentro do código de
      > barras**, porque ele codifica a string humana tal e qual e não faz parsing
      > de AIs. Serve para confirmar que o FNC1 do início é o codeword 102, e para
      > nada mais.
      >
      > **Três bugs que só apareceram com o leitor ligado**, e todos com o mesmo
      > sintoma — o ZXing recusa o código sem dizer porquê:
      >
      > 1. **A soma de verificação não tinha pesos.** Fiz `reduce((s, v) => s + v)`
      >    em vez de ponderar pela posição. O número de módulos é 11 por codeword,
      >    por isso o erro **não se via no desenho**; foi a contagem que denunciou:
      >    222 módulos onde a conta dava 200.
      > 2. **O número do AI não ia para o código de barras.** Emitia só o valor, e
      >    o AI ficava de fora — confusão entre a forma humana e a de máquina: os
      >    parênteses não vão, mas os dígitos **vão**.
      > 3. **O separador ia no fim de todo o campo variável**, mesmo no último.
      >    O ZXing devolvia o mesmo texto com um `0x1D` a mais, e o código de
      >    barras continuava a desenhar-se bem. Metade dos leitores aceitava.
      >
      > O primeiro e o mais instrutivo: **a soma ponderada e a soma simples dão o
      > mesmo número de módulos**, porque todos os padrões têm 11. O defeito é
      > invisível na imagem e só aparece na leitura.

### 2D matriciais — 1 de 5

- [x] QR Code, versões 1–40, com correção de erros — `web/qrcode.js`
- [ ] **Micro QR** (M1–M4) — estrutura completamente diferente do QR: um só
      padrão de localização no M1 e dois nos restantes, quatro máscaras em vez
      de oito, e máscaras de dados próprias. A ISO/IEC 18004 é a mesma do QR
      normal, o que é uma vantagem: a parte difícil, que é a colocação dos
      codewords, é partilhada.
- [x] **Data Matrix (ECC200)** — o padrão da indústria farmacêutica,
      aeroespacial e de defesa. Pequeno e quadrado, sem os quadrados grandes
      nos cantos. **Feito e verificado: 12 casos lidos pelo ZXing.**
      > **A referência não é um pacote de Python.** Não há, ao contrário dos
      > códigos de barras, e por isso a tabela dos factores de Reed-Solomon
      > veio da implementação de referência do ZXing — que é também o leitor
      > que vai verificar o que este encoder produz.
      >
      > **A verificação dessa tabela é funcional, e não por comparação.** Derivei
      > os polinómios geradores e não batem: a tabela põe o coeficiente de
      > `x^(n-1)` no primeiro lugar e o cálculo põe o termo de ordem zero, e são
      > convenções diferentes para o mesmo polinómio. Como não se podem deduzir,
      > a única verificação honesta é se a correcção de erros bate — e um factor
      > errado dá um símbolo que o leitor **rejeita por corrupção**, o que é
      > mais forte do que uma comparação entrada a entrada, não mais fraco.
      >
      > Três coisas que só apareceram na leitura:
      >
      > 1. **A guia de baixo não era reposta a zero.** Escrevia a partir da
      >    coluna onde a linha de dados tinha acabado, e a última linha do
      >    símbolo saía **vazia**. O sintoma é um código que se parece com um
      >    Data Matrix e não é lido por nada — e a última linha é a última
      >    coisa que se olha. A guia de baixo é a que o leitor usa para se
      >    orientar.
      > 2. **O valor do deslocamento para ASCII estendido é `b - 127`, não
      >    `b - 128`.** A norma descreve-o de maneira que se lê como `b - 128`; a
      >    implementação de referência emite `b - 128 + 1` e o leitor dela faz
      >    `valor + 128 - 1`, que é o mesmo número. Fazer "o que a norma diz"
      >    fazia o ZXing devolver **cada byte alto um abaixo**: um "ç" saía
      >    como "r", um "€" como "Ñ". Todos os payloads ASCII e todos os
      >    numéricos liam-se bem, e só os com acentos e emojis falhavam — a
      >    assinatura de um erro que só aparece no canto.
      > 3. **O 144x144 tem oito blocos de 156 e dois de 155, e não nove de 156 e
      >    um de 154.** Com 154 a conta dava 1556 em vez de 1558, e dois
      >    codewords a menos num código de 1558 é o que o leitor acusa como
      >    corrupção, não como tabela errada.
      >
      > **Em conjunto, isto destrava o GS1 DataMatrix**, que é Data Matrix com
      > um cabeçalho FNC1 e nada mais. Fica de fora de propósito por agora: só
      > faz sentido com o GS1-128 feito, e os dois são a mesma coisa com
      > finalidades diferentes.
- [ ] **C40, Text, X12 e EDIFACT no Data Matrix** — otimização, não
      conformidade. O encoder usa só ASCII e o deslocamento para ASCII
      estendido, e o código que sai é **perfeitamente válido e lê em qualquer
      leitor**. A diferença é o tamanho: "MAST-2024-0001" sai um símbolo maior
      do que sairia em C40, e num número de série comprido a diferença nota-se.
      > **As tabelas do C40 e do Text estão feitas**, geradas do Zint
      > (`dmatrix.h`, as Tabelas C.1 e C.2 da ISO/IEC 16022) e verificadas em
      > `web/tests/dm-modos.test.mjs` — 8 testes que verificam sobretudo que as
      > duas tabelas **não são iguais**, porque é aí que um encoder erra sem dar
      > erro.
      >
      > **O que os testes apanharam a mim, e vale a pena registar:** escrevi que
      > as minúsculas estavam no conjunto 1 do C40, e no conjunto 0 do Text, e
      > que os dígitos valiam 0 a 9. **As duas coisas estão erradas.** As
      > minúsculas são o **conjunto 3** do C40 (valores 1 a 26) e o **básico** do
      > Text (valores 14 a 39) — o oposto do que escrevi, e a confusão é de meio
      > de campo: o que eu escrevi é verdade para as *maiúsculas*, que o C40 põe
      > no básico. E os dígitos valem **4 a 13**, porque o 0 está reservado para
      > o indicador de modo do *extended* e para o *latch*.
      >
      > **Falta o encoder**, que é o algoritmo de *look-ahead*: a escolha de modo
      > é a parte mais longa do encoder do ZXing, e é a que decide se vale a pena
      > mudar de modo. Otimização sem a parte difícil de pensar por baixo é a
      > maneira de entregar códigos maiores do que o necessário sem dar conta.
      > **X12 e EDIFACT ficam de fora**: nao trazem nenhuma melhoria ao que se
      > usa (números de série e lotes são ASCII), e cada um traz a sua tabela.

- [x] **PDF417** — empilhado, e o que se vê no verso de cartas de condução e
      cartões de embarque. O mais usado dos 2D que faltam a seguir o Data
      Matrix, e o que a lista tinha esquecido.
      > **Decisão do utilizador: sim, entra.**
      >
      > **Feito e verificado**: 72 casos lidos pelo ZXing, mais o PNG e o SVG
      > que o browser exporta. A tabela são 3 × 929 padrões e não está escrita
      > à mão — vem do `pdf417gen` (Python puro, MIT), e o
      > `tabelas-pdf417.test.mjs` compara as 2787 entradas com a referência.
      >
      > Três coisas que só apareceram na leitura, e que estão escritas nos
      > comentários do encoder:
      >
      > 1. **A correcção de erros sai invertida.** Calcula-se de trás para a
      >    frente e tem de se devolver na ordem certa. A primeira linha do
      >    símbolo batia certo — é a única em que a diferença ainda não
      >    apareceu — e o código não lia.
      > 2. **O enchimento e as colunas decidem-se em conjunto.** O enchimento
      >    depende do número de colunas, e o número de linhas depende do
      >    enchimento. Calcular um e depois o outro dá uma grelha que não
      >    encaixa, e há dois casos em que os codewords eram **idênticos** aos
      >    da referência e liam-se com uma forma e não com a outra.
      > 3. **Os valores do modo texto não são as posições de uma lista.** No
      >    submodo MIXED o valor 25 não é usado por ninguém, e o espaço vale 26
      >    e não 25. Guardar a tabela como cadeia ordenada e tirar o valor da
      >    posição dá um código que se lê com um caractere trocado, sem erro
      >    nenhum — porque o espaço existe no MIXED, só com outro número.
      >
      > E uma armadilha do teste: o ZXing, na ausência de ECI, devolve o
      > `text` em ISO-8859-1. Comparar o `text` com o payload faz falhar todos
      > os casos com acentos e emojis e dá a impressão de que o modo de bytes
      > está partido. Não está — os `bytes` é que têm de se ler, em UTF-8.
- [x] **GS1 DataMatrix** — não é um encoder novo: é Data Matrix com o
      cabeçalho FNC1 em ASCII, para rastreabilidade na saúde e na logística.
      > **Feito, ligado à interface e verificado pelo ZXing**: 8 de 8, com
      > `]d2` e `ContentType.GS1` reconhecidos e os separadores no sítio.
      >
      > Não é só o FNC1: os campos de comprimento variável precisam de um
      > separador **no fim de cada um, menos o último**. Sem isso o leitor
      > descodifica com os campos trocados, e não há erro nenhum.
- [ ] **Aztec** — bilhetes de comboio e cartões de embarque. Tem um padrão de
      orientação central e usa Reed-Solomon sobre GF(16) e GF(256). Não é
      apenas mais difícil: é um algoritmo diferente do QR.
- [ ] **MaxiCode** — desenvolvido pela UPS para encomendas em movimento. Tem
      uma tabela de 866 codewords de correcção em anéis concêntricos. É dos
      mais difíceis da lista.

### 2D da família QR

- [x] **FrameQR** — `web/frameqr.js`, ligado à interface. Não é uma simbologia
      nova: é pós-processamento sobre o QR, apagar uma área no centro e pôr
      o logótipo lá dentro. A correcção de erros é que reconstrói os módulos
      apagados. Tem 23 testes de estrutura e os **oito logótipos que a aplicação
      recomenda foram lidos por leitor independente** — mais o PNG que o browser
      exportou.
      >
      > **Com forma, ângulo e posição, que é o que a DENSO promete.** O que o
      > site deles diz é que "the canvas area does not interfere with code
      > reading", e a verdade é mais estreita: **não é que a forma seja segura
      > em si, é que algumas formas apagam menos área com o mesmo logótipo.**
      > Medido numa caixa de onze módulos: o quadrado apaga 101 módulos e a
      > estrela 30. **Por isso que o limite é por forma, e o mesmo QR aguenta um
      > logótipo de 14 módulos em estrela contra 7 em quadrado** — verificado
      > com o ZXing, não deduzido.
      >
      > **O quociente de cada forma é medido, e não é `π/4`.** A área do círculo
      > é π/4 da caixa, mas o número de módulos **escuros** dentro dela é outra
      > coisa, porque cerca de metade dos módulos de um QR já é clara e apagá-la
      > não custa nada. `spec/medir-quocientes.mjs` mede a razão, e ela é
      > diferente.
      >
      > **O limite divide pela raiz quadrada do quociente, e não pelo
      > quociente.** O quociente é uma razão de áreas e o limite é um
      > comprimento. A primeira versão multiplicava pelo quociente, que é o
      > inverso: dava um limite *menor* a quem escolheu a forma que apaga menos,
      > e uma estrela que nunca passava de dois módulos.
      >
      > **O ângulo e a posição não mudam quantos módulos se apagam — mudam
      > quais.** Por isso que só a leitura diz se servem, e por isso que
      > mover o logótipo baixa o limite: um módulo apagado à mais junto de um
      > padrão de localização vale por mais do que um no meio.
      >
      > **Feito, e com a imagem.** O upload está ligado, a caixa é calculada a
      > partir da escala, e o ficheiro exportado pelo browser foi lido por um
      > leitor independente.
      >
      > **O número que se mostra ao utilizador tem duas faces, e a segunda é a
      > importante.** A caixa é N×N **módulos**, que é `N × escala` em
      > **píxeis** — e a escala muda com o tamanho pedido e com a versão do QR.
      > Com 512 px e um logótipo de 5 módulos, a caixa é 60×60; a 2048 px, é
      > 250×250. Um número fixo seria uma mentira em metade dos casos.
      >
      > E **acima** do ideal não há problema nenhum: o browser reduz bem, e um
      > módulo é o menor elemento do código, por isso ampliar mais só repete
      > pixels. Dizer que há um máximo seria inventar uma restrição que não
      > existe. O aviso é só para **baixo** — aí a imagem é esticada e o
      > logotipo fica a serrilhado, o que numa etiqueta pequena se vê a um
      > metro.
      >
      > **Um bug que só o ficheiro exportado apanhou:** o logotipo saiu 4
      > módulos à esquerda. A zona apagada é dada em coordenadas do *código* e o
      > canvas desenha a partir da *margem* — são a mesma grelha com origens
      > diferentes. O QR não mudou, por isso **continuava a ler**: o teste de
      > leitura passava, o SVG tinha o mesmo erro, e o único sintoma era um
      > logotipo torto. Nenhum teste estrutural o apanha, porque o código
      > estava certo.
- [x] **Afinar o limite do logótipo por versão.** Hoje a mesma percentagem vale
      para todas as versões, o que é conservador nos QR grandes. A conta certa é
      em codewords: quantos o bloco aguenta estragar, e não que percentagem de
      área. Deixa o logótipo maior no H sem perder a garantia.
      > **Feito, e medido com o ZXing em vez de deduzido da norma.** É o
      > `modulosMaximos` de `frameqr.js`, com os piores casos de uma varredura
      > real — não a percentagem teórica, que é 4 a 6 vezes o que um QR pequeno
      > aguenta.
      >
      > A razão de medir e não deduzir: **a teórica dá logotipos que às vezes
      > leem**, e o defeito só aparece no cartão impresso. Verificado em 8 de 8
      > pela leitura, e o aviso da interface diz até onde dá.
- [ ] **rMQR Code** — ISO/IEC 23941 (2022), o QR **rectangular**. A especificação
      é **paga** (CHF 204 na ISO), mas as tabelas não são, e a procura já está
      feita.

      > **As tabelas estão feitas e verificadas** — `web/symbologies/rmqr-tabelas.js`,
      > gerado por `web/tests/gerar-tabela-rmqr.py` a partir do **zxing-cpp 3.1.1**,
      > que é também quem escreve. Três tabelas: os **32 símbolos** com os centros
      > de alinhamento (que são **só colunas** — é a diferença para o QR) e os
      > blocos de correcção de M e H; os **bits do indicador de caracteres**, que
      > são 32 por modo e não três grupos como no QR; e os **tamanhos**, que são
      > só a soma e servem de nome (`R7x43` = 43 de lado por 7 de alto).
      >
      > O gerador verifica o que extrai contra o **ZXing**: para nove textos,
      > o leitor tem de escolher o símbolo que a tabela diz. Daí sai a
      > propriedade mais estranha do formato — o mesmo conteúdo pode dar um
      > símbolo estreito e alto ou largo e baixo, porque quem escolhe é a
      > **área mínima**, não a ordem.
      >
      > **Falta a colocação dos dados.** A geometria dos padrões de função
      > (`buildFunctionPattern`), a máscara (as 7 do QR) e a informação de
      > formato (6 bits + 12 de BCH, máscara `0x1FAB2`, com a tabela dos 64
      > padrões) estão todas localizadas. O que não encontrei em fonte acessível
      > é a **ordem de preenchimento da grelha num rectângulo** — a espiral em
      > zigue-zague do QR é quadrada, e num rectângulo muda. Sem isso não há
      > encoder, e sem encoder estas tabelas não servem para nada.
      >
      > **Duas armadilhas já encontradas, para quem voltar a isto:** a imagem que
      > o `zxingcpp` devolve já traz **2 módulos de zona calma** de cada lado —
      > medir o SVG sem tirar isso dá `31x15` onde o símbolo é `27x11`, e
      > `31x15` não está em tabela nenhuma. E o rMQR **recusa** o que não cabe,
      > com a razão; um código truncado leria sem o último carácter e não
      > avisaria.
- [x] **SQRC (Secret Function Equipped QR Code)** — o contentor é especificado
      pela DENSO (AES-128 em dois segmentos, com o ID da chave no primeiro
      byte), e o browser tem AES no Web Crypto sem dependências.
      > **Decisão do utilizador: a chave é gerida pelo próprio utilizador.**
      > Ele faz a sua chave secreta, faz o seu QR code, e a partir daí é com
      > ele. Isto resolve a objecção que eu tinha levantado — e tinha razão
      > em levantar, porque a alternativa (a chave no mesmo sítio) não é
      > segredo nenhum.
      >
      > **Feito por inteiro**: `web/sqrc.js` (a cifra, sem dependências),
      > ligado à interface com o aviso de "sem a chave perdeste isto para
      > sempre" e o botão de gerar chave aleatória, e verificado em três
      > níveis — a estrutura, a leitura pelo ZXing, e o ficheiro que o browser
      > exporta.
      >
      > **A propriedade que substitui a leitura de SQRC é mais forte do que
      > parecia.** Não se descifra — mas o ZXing tem de devolver **exactamente**
      > a base64 que lhe foi dada, e um byte a mais ou a menos **não dá erro
      > nenhum**: o QR desenha-se, lê-se, e parece estar tudo bem. A falha só
      > apareceria a quem tentasse descifrar, com o erro de "chave errada" — a
      > apontar para o software e não para o código. Por isso o nível 2 compara
      > a base64 caractere a caractere, e não texto: o atributo `text` do ZXing
      > **assume ISO-8859-1 sem ECI**, que num formato binário dá sempre o
      > resultado errado.
      >
      > **O que fica por verificar, e é melhor-prometer-agora:** a
      > interoperabilidade com um leitor DENSO. **Não há leitor de SQRC em lado
      > nenhum** — nem no ZXing, nem em outra ferramenta. O que se verifica é
      > que os bytes chegam intactos, que o descifrador devolve o original, e que
      > o QR com a zona do logotipo apagada ainda se lê. A leitura por um leitor
      > DENSO **não fica verificada**, e há que o dizer em vez de o deixar
      > parecer que sim.

### E uma que não é código

- [ ] **iQR Code** — propriedade da Denso Wave, e a especificação não é
      publicada. Não é implementável com rigor; dizer não é a resposta errada.

### As duas regras que regem esta secção

**Um encoder só entra no repositório depois de o ZXing devolver a string certa.**
Não há "quase".

**E as tabelas dos códigos de barras nunca mais se escrevem de memória.** Vêm de
um `python-barcode` — que é Python puro, com as tabelas no código-fonte em forma
legível — e o `tests/tabelas.test.mjs` compara-as com as minhas, entrada a
entrada. Sem isso aconteceu duas vezes: o Code 39 saiu com doze elementos por
carácter em vez de nove, e o ITF com dois elementos na moldura de paragem em vez
de três. Os dois desenhavam-se com o aspecto certo e não liam.

```bash
python -m pip install python-barcode   # só para os testes
python web/tests/extrair-tabelas.py     # extrai as tabelas de referência
node --test "web/tests/*.test.mjs"      # compara com as minhas
```

### Um padrão de bug que se repetiu três vezes

O **separador entre caracteres**. O Code 39, o ITF e o Codabar têm um caractere
de início — ou uma moldura — que **acaba numa barra**, e o primeiro carácter de
dados **começa noutra barra**. Sem um espaço entre eles, as duas somam-se numa
barra larga a mais. O código tem o aspecto certo, os testes estruturais passam, e
o leitor não lê nada.

Aconteceu três vezes em três formatos diferentes, e é a razão de o teste de
leitura não ser opcional: nenhum teste estrutural o apanha, porque o erro não é
uma tabela errada, é uma montagem errada com a tabela certa.

### A percentagem da correcção de erros não é uma percentagem de área

Isto valeu um dia de trabalho e é o que mais custou acertar no FrameQR.

A norma diz que a correcção de erros do QR desfaz 4% (L) a 24% (H) dos erros.
Lido à letra, é a resposta à pergunta "quanto logótipo cabe?" — e é a resposta
errada por um factor de **4 a 6**, nas piores medições.

A razão: essa percentagem é de **codewords errados**, e só é válida com os erros
espalhados por vários blocos. Um QR pequeno tem poucos. A versão 2 a nível M
tem **um** bloco, e nele a correcção desfaz 14 erros. Uma zona de logótipo de
6x6 módulos é uma mancha contígua, e toca uma dúzia de codewords diferentes —
cada um com um erro. Doze cabe, quinze não.

Medido com o ZXing, varrendo o tamanho do logótipo em cada nível:

```
nível   pior caso medido   QR          teórico
L       0.96%               v2  25x25    4%
M       0.96%               v2  25x25    8%
Q       3.52%               v2  25x25   14%
H       2.85%               v3  29x29   24%
```

E notem-se dois factos que só a medição mostra:

**Não sobem de forma regular de L para H.** O H tem mais correcção de erros, e
por isso o mesmo texto sai num QR **maior** — e num QR maior a mancha toca
menos codewords por módulo. O H aguanta uma percentagem menor e um logótipo
maior em módulos.

**Só contam os módulos escuros apagados.** Um módulo que já era claro não custa
nada à correcção de erros. Numa zona quadrada isso é cerca de metade, e a conta
tem de levar isso em conta. Dividir a área toda pela percentagem dava
logótipos pequenos demais sem que ninguém percebesse porquê.

Com os valores medidos, a consequência prática é que **um QR de 29x29 a nível M
não leva logótipo nenhum** — e a interface diz isso e manda subir para Q ou H, em
vez de fingir que o problema é da aplicação.

O que ficou por fazer está em cima, no BLOQUEIO 6: a conta certa é em
codewords, e daria logótipos maiores no H sem perder a garantia.

## Simbologias nas outras stacks

As 4 simbologias de barras (EAN-13, EAN-8, UPC-A, Code 39, ITF-14, Codabar e
Code 128) estão no Python e no web. As outras stacks recebem-nas **por esta
ordem**, e cada passo é o mesmo: as tabelas do `spec/gerar-tabelas-lineares.py`
— que escreve o Python **e** o Java a partir da mesma extracção —, o encoder, e
o ZXing a ler o resultado.

```
1. java/       → ✅ tabelas geradas, Code 39 / ITF-14 / Codabar / Code 128
2. kotlin/     → core JVM com as 4 simbologias, depois a app Android
3. csharp/     → core com as 4 simbologias, e depois a app WinForms
4. python/     → ✅ é a implementação de referência; falta a CLI
5. go/         ⬜ pasta e README prontos; código por fazer, e por último
```

> **A app em Go é a última por decisão, não por dificuldade.** O Go não é das
> linguagens mais adequadas a isto: não tem `char`, a aritmética de `String` é
> entre bytes, e cada cadeia é uma questão de UTF-8. Compensa pelo binário
> único, sem runtime — que é o que se quer de um programa para distribuir. E só
> vale a pena depois de haver spec madura, porque sem ela o `go/` seria a
> quinta implementação a adivinhar em vez de a quinta a cumprir.

## Ordem de implementação

```
1. python/qrcode_core   → ✅ 11 tipos prontos, e a spec que eles geram
2. web/                 → ✅ PWA + encoder próprio + ficheiro único
3. csharp/              → ✅ core + 4 simbologias de barras, 7 bugs corrigidos, PIX
4. java/                → ✅ core + app + CLI + jpackage, 120 testes
5. kotlin/android       → Compose + scan de câmara
6. extras               → ✅ 7 simbologias 1D (ver BLOQUEIO 6) · falta 2D e PDF
7. go/                  ⬜ pasta e README prontos; código a fazer, e por último
```

Cada passo só avança quando os vetores passam nessa stack.

**A ordem mudou duas vezes.** O site foi feito antes de o Python ter os 10
tipos, porque era o cliente com mais alcance; e depois o Python foi portado,
porque é a implementação de referência e sem ele a spec não podia crescer.
Hoje as quatro stacks têm os 11 tipos e a paridade verifica-se entre pares.

**E o que este bloco deixou ver é a lição.** Durante meses esteve escrito, duas
linhas acima, que o Python era a única stack incompleta — a implementação de
referência incompleta enquanto as outras três cópias estavam completas. **Uma
spec que se gera da implementação de referência obriga a que ela seja a mais
completa, e não a menos**, e a incoerência não se via nos testes: os testes do
Python passavam todos, com 108 verdes, a testar uma biblioteca que sabia fazer
uma coisa de onze.

---

## Como saber que está feito

- [x] `docs/TIPOS-QR.md` com o PIX completo e os 10 tipos descritos
- [x] `spec/vectors.json` com 10 casos de PIX, verdes e descodificados
- [x] `QrService.cs` sem os 7 bugs, com teste de regressão para cada um
- [x] `verificar-paridade` a correr em 4 stacks (C#, Java, Python e web) com ✅
- [x] Encoder de QR verificado por leitura com o ZXing (53 matrizes, todos os vectores da spec)
- [x] `docs/COMO-USAR.md` — como usar e como partilhar cada app
- [x] Java: 4.ª stack completa, com `jpackage` para os três sistemas
- [x] `spec/vectors.json` com ~30 casos — tem 34, e as quatro stacks batem
      com todos eles: 202 testes em Python, 188 em C#, 120 em Java e 271 no
      site. O nível 2 subiu de 29 para 53 matrizes lidas.
- [ ] Respostas ao BLOQUEIO 4 registadas em `IDEIA.md` secção 9

## Dívidas conhecidas

Coisas que ficaram por fazer e que se notam:

- [x] **Python tinha só o PIX.** Os 10 tipos antigos estavam no C#, no Java e
      no site, mas não na biblioteca Python — a maior lacuna de paridade, e
      apesar de ser a implementação de referência.
      > **Fechado.** `python/qrcode_core/tipos.py` (a construção) e
      > `validacao.py` (as mensagens), com `build(categoria, campos)` com a
      > mesma assinatura que o `types.js` do navegador, e ligado ao CLI com
      > `qrcli payload <tipo>`. 178 testes.
      >
      > **A paridade é verificada, não prometida.** O
      > `web/tests/paridade-python.mjs` corre 26 casos nos dois lados e compara
      > os payloads byte a byte. Não é uma transcrição: o Python é que escreve
      > e o JavaScript é que lê, e é o que impede que os dois concordem num erro.
      >
      > **E a tabela de campos é comparada nos dois sentidos**, porque
      > `--ssid` a escrever `ssid` em vez de `wifiSsid` dá um `WIFI:S:`
      > vazio, com código de saída 0 e o ficheiro escrito. Um registo sem
      > entrada é invisível — e a `AGENTS.md` já tinha o caso do GS1-128, que
      > entrou no registo com o encoder e não apareceu no selector.
      >
      > **Um bug nas duas stacks ao mesmo tempo**, e que por isso só a
      > leitura apanhava: `cœur` dava `cur`. O `œ` é um caractere único, e não
      > um `o` com um acento por cima, pelo que o NFD não o decompõe. As duas
      > cópias davam o mesmo resultado errado — **e é por isso que um teste de
      > paridade não o apanha**.
- [ ] **Kotlin/Android: o core existe e tem as simbologias, a app não.**
      É a última stack, e o que está feito é o `:core` — Kotlin/JVM puro,
      os onze tipos de payload, o PIX e **as quatro simbologias de barras**, a
      passar os vectores de `spec/vectors.json` byte a byte com
      `gradlew :core:test`.
      > **As simbologias do Kotlin foram o terceiro alvo do mesmo gerador.**
      > `spec/gerar-tabelas-lineares.py` escreve o Python, o Java e o Kotlin a
      > partir da **mesma extracção**, e não há uma terceira transcrição das
      > tabelas. O que muda entre os alvos é a sintaxe do ficheiro gerado: o
      > `mapOf` do Codabar em vez dos dois arrays paralelos que o Java precisa.
      >
      > **Os 17 casos do `spec/paridade-kotlin.mjs` batem com o Python**, e a
      > lista vive em `spec/casos-barras.mjs`, partilhada com o
      > `paridade-java.mjs`. **Duas listas de casos divergem em silêncio**, e cada
      > uma fica com os casos que a sua stack passou — foi assim que o Code 128
      > do Java ficou sem os casos de troca de conjunto.
      > **O core é um módulo à parte, e não `Payloads.kt` dentro de
      > `app/`.** Era o caminho curto para um ficheiro e o caminho longo para
      > não ter testes: dentro do módulo Android, um teste de payload só corre
      > com o SDK instalado e o AGP a resolver. O `README.md` da pasta é que
      > propunha a outra coisa, e está desatualizado.
      >
      > **O que ficou a fazer, por ordem:**
      >
      > - **O encoder de QR.** Sem ele não há nível 2, e o nível 2 é o que
      >   apanha o que nenhum teste estrutural vê. É a peça que falta.
      > - **A app Android** — o `README.md` da pasta tem o plano, e a
      >   decisão em BLOQUEIO 4 continua por responder: conta de Play Store ou
      >   APK sideload. Isso muda a assinatura e o keystore.
      > - **A leitura pela câmara**, que é a razão de ser desta plataforma.
      >
      > **A máquina não precisa de nada novo.** O Android Studio já lá está,
      > com a imagem de sistema e o AVD `Medium_Phone`; a aceleração do
      > emulador está disponível (`WHPX is installed and usable`). O único
      > que faltava era o Gradle, e resolvedo com o wrapper — versionado no
      > repositório, para o `AGENTS.md` ter uma linha na tabela de testes.
      >
      > **Os quatro bugs que a spec apanhou ao escrever o core**, e que
      > nenhum teste de estrutura apanharia, estão no `kotlin/README.md`. O
      > mais instructive é o `escapeWifi` a punir `$1` em vez de `\`: **é a
      > terceira vez que a mesma armadilha aparece neste repositório** — o
      > `re.sub` do Python e o `String.replace` do `bundle.mjs` tiveram o
      > mesmo, e a correcção em todos é a mesma.
- [ ] **Sem GUI em Python.** `python/gui/` está vazio.
- [ ] **Sem CI.** Os testes correm à mão, uma stack de cada vez. Um
      `verificar-paridade.sh` juntava tudo.
- [ ] **O teste de nível 2 do Java é mais fraco.** Gera e lê com o mesmo ZXing.
      O PNG foi verificado à mão com o `zxing-cpp` do Python, mas isso não
      está automatizado.
- [ ] **`jpackage` só corre no SO de destino.** O `.msi` faz-se no Windows, o
      `.dmg` no macOS. Documentado, mas é uma limitação real.
- [x] **`assets/icon-192.png` e `icon-512.png` não existiam** — estavam
      declarados no manifesto mas nunca gerados, e o sintoma é o mais discreto
      que há: o manifesto é JSON válido, o site instala, e o ícone que aparece
      no telemóvel é o do browser.
      > **Gerados, e gerados do encoder que o site usa** — `gerar-icone.mjs` faz
      > o SVG com o `toSvg` de `qrcode.js`, e `gerar-icones.py` faz os PNG a
      > partir dele. O `descodificar-icones.py` lê-os com o ZXing e confirma que
      > devolvem o endereço do próprio gerador.
      >
      > **E o SVG, que existia, não era um QR válido** — tinha os três cantos
      > com um quadrado 7x7 cheio e o padrão de baixo-direito inexistente.
      > Parecia um QR e nenhuma câmara o lia. **Uma conta de módulos não apanha**:
      > o ícone tinha 302 módulos escuros, e qualquer verificação que conta
      > módulos passa.
- [ ] **`responder.txt`** na raiz: parece ser texto solto que ficou num commit.
      Convém confirmar se se deve apagar.
