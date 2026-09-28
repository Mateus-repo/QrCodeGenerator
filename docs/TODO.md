# O que falta

> Checklist do que ainda não está feito. Os BLOQUEIOS 1–3 já estão resolvidos —
> ficaram os quatro que não dependem da spec.
>
> Ver `IDEIA.md` para o raciocínio e `COMO-USAR.md` para usar o que já existe.

**Estado:** 4 stacks completas (web, C#, Java, Python), 11 tipos de QR + 4 simbologias
de codigos de barras, 467 testes. A
spec do PIX está validada contra o exemplo oficial do Banco Central e os 7
bugs do `QrService.cs` original estão corrigidos com teste de regressão.

O que bloqueia: **Python só tem PIX** — é a maior lacuna de paridade, numa das
stacks que se chamava de referência. Kotlin não existe. Não há CI.

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
- [ ] Vetores dos 10 tipos restantes (precisa de os portar para Python, que é
      quem gera a spec)
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
- [ ] **Code 93** — mais compacto e mais seguro que o Code 39. Não é um
      Code 39 melhorado: tem dois dígitos de controlo e uma tabela diferente.
      O `python-barcode` não o tem, por isso a tabela vem de outra fonte.
- [ ] **Code 11** — telecomunicações. Formato antigo, três dígitos de
      controlo. Precisa da especificação.
- [ ] **GS1-128** — não é um encoder novo: é Code 128 com o caractere FNC1 no
      início, para os dados de Application Identifier da GS1 (data de
      validade, lote, quantidade). Barato de fazer; falta decidir que campos
      da GS1 se expõem na interface.

### 2D matriciais — 1 de 5

- [x] QR Code, versões 1–40, com correção de erros — `web/qrcode.js`
- [ ] **Micro QR** (M1–M4) — estrutura completamente diferente do QR: um só
      padrão de localização no M1 e dois nos restantes, quatro máscaras em vez
      de oito, e máscaras de dados próprias. A ISO/IEC 18004 é a mesma do QR
      normal, o que é uma vantagem: a parte difícil, que é a colocação dos
      codewords, é partilhada.
- [ ] **Data Matrix (ECC200)** — o padrão da indústria farmacêutica,
      aeroespacial e de defesa. Pequeno e quadrado, sem os quadrados grandes
      nos cantos. Reed-Solomon sobre GF(256) e cinco modos de codificação
      (ASCII, C40, Text, EDIFACT, Base256).
- [ ] **GS1 DataMatrix** — não é um encoder novo: é Data Matrix com o
      cabeçalho FNC1 em ASCII, para rastreabilidade na saúde e na logística.
- [ ] **Aztec** — bilhetes de comboio e cartões de embarque. Tem um padrão de
      orientação central e usa Reed-Solomon sobre GF(16) e GF(256). Não é
      apenas mais difícil: é um algoritmo diferente do QR.
- [ ] **MaxiCode** — desenvolvido pela UPS para encomendas em movimento. Tem
      uma tabela de 866 codewords de correcção em anéis concêntricos. É dos
      mais difíceis da lista.

### 2D da família QR

- [x] **FrameQR** — `web/frameqr.js`, ligado à interface. Não é uma simbologia
      nova: é pós-processamento sobre o QR, apagar um quadrado centrado e pôr
      o logótipo lá dentro. A correcção de erros é que reconstrói os módulos
      apagados. Tem 12 testes de estrutura e os **oito logótipos que a aplicação
      recomenda foram lidos por leitor independente** — mais o PNG que o browser
      exportou.
- [ ] **Afinar o limite do logótipo por versão.** Hoje a mesma percentagem vale
      para todas as versões, o que é conservador nos QR grandes. A conta certa é
      em codewords: quantos o bloco aguenta estragar, e não que percentagem de
      área. Deixa o logótipo maior no H sem perder a garantia.
- [ ] **rMQR Code** — ISO/IEC 23941 (2022). A especificação é **paga** (CHF 204
      na ISO), mas as tabelas que interessam são públicas: as 32 versões com os
      seus codewords, os comprimentos do indicador de contagem por versão, a
      máscara (`(i/2 + j/3) mod 9 = 0`) e a informação de formato. E há
      implementações abertas da ISO. Viável.
- [ ] **SQRC (Secret Function Equipped QR Code)** — o contentor é especificado
      pela DENSO (AES-128 em dois segmentos, com o ID da chave no primeiro
      byte), e o browser tem AES no Web Crypto sem dependências. **Mas**: quem
      distribui a chave, e como? Um código "secreto" cuja chave vai no mesmo
      sítio não é secreto. Falta uma decisão sobre o modelo de chaves antes de
      valer a pena escrever.

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

## Ordem de implementação

```
1. python/qrcode_core   → ✅ PIX pronto. FALTA os 10 tipos existentes  ← aqui
2. web/                 → ✅ PWA + encoder próprio + ficheiro único
3. csharp/              → ✅ core extraído, 7 bugs corrigidos, PIX
4. java/                → ✅ core + app + CLI + jpackage, 119 testes
5. kotlin/android       → Compose + scan de câmara
6. extras               → ✅ 4 simbologias 1D (ver BLOQUEIO 6) · falta 2D e PDF
```

Cada passo só avança quando os vetores passam nessa stack.

**A ordem mudou em relação ao plano original:** o site foi feito antes de o
Python ter os 10 tipos, porque era o cliente com mais alcance. O resultado é
que o Python é hoje a única stack incompleta — e é a implementação de
referência, o que é uma incoerência que vale resolver.

---

## Como saber que está feito

- [x] `docs/TIPOS-QR.md` com o PIX completo e os 10 tipos descritos
- [x] `spec/vectors.json` com 10 casos de PIX, verdes e descodificados
- [x] `QrService.cs` sem os 7 bugs, com teste de regressão para cada um
- [x] `verificar-paridade` a correr em 4 stacks (C#, Java, Python e web) com ✅
- [x] Encoder de QR do site verificado por leitura com o ZXing (29 matrizes)
- [x] `docs/COMO-USAR.md` — como usar e como partilhar cada app
- [x] Java: 4.ª stack completa, com `jpackage` para os três sistemas
- [ ] `spec/vectors.json` com ~30 casos (faltam os 10 tipos em Python)
- [ ] Respostas ao BLOQUEIO 4 registadas em `IDEIA.md` secção 9

## Dívidas conhecidas

Coisas que ficaram por fazer e que se notam:

- [ ] **Python só tem PIX.** Os 10 tipos antigos estão no C#, no Java e no
      site, mas não na biblioteca Python. É a maior lacuna de paridade — e
      apesar de ser a implementação de referência.
- [ ] **Kotlin/Android não existe.** A pasta tem README, nada mais.
- [ ] **Sem GUI em Python.** `python/gui/` está vazio.
- [ ] **Sem CI.** Os testes correm à mão, uma stack de cada vez. Um
      `verificar-paridade.sh` juntava tudo.
- [ ] **O teste de nível 2 do Java é mais fraco.** Gera e lê com o mesmo ZXing.
      O PNG foi verificado à mão com o `zxing-cpp` do Python, mas isso não
      está automatizado.
- [ ] **`jpackage` só corre no SO de destino.** O `.msi` faz-se no Windows, o
      `.dmg` no macOS. Documentado, mas é uma limitação real.
- [ ] **`assets/icon-192.png` e `icon-512.png` não existem** — estão
      declarados no manifesto mas nunca gerados. Num PWA instalável no telemóvel
      isso nota-se.
- [ ] **`responder.txt`** na raiz: parece ser texto solto que ficou num commit.
      Convém confirmar se se deve apagar.
