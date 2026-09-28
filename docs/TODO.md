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

**O que está feito e verificado** (18 casos, todos lidos por leitor independente):

- [x] EAN-13 — `web/symbologies/upcean.js`
- [x] EAN-8
- [x] UPC-A
- [x] Code 128, com escolha automática de conjunto — `web/symbologies/code128.js`
- [x] Harness de nível 2 para lineares: `web/tests/gerar-lineares.mjs` +
      `web/tests/descodificar-lineares.py`

**Fica de fora, e porquê.** Isto é o ponto importante desta secção: quatro
encoders foram escritos e **não passaram na leitura**, por isso não estão no
repositório.

- [ ] **Code 39** — a tabela tem 43 entradas de nove elementos (cinco barras,
      quatro espaços, três largos). Escrita de memória saiu com doze
      elementos por carácter, e a segunda tentativa, já pela regra 2-de-5 da
      especificação, esbarrou nos caracteres finais (`-`, `.`, espaço, `*`,
      `$`, `/`, `+`, `%`), que não seguem a regra: têm as cinco barras
      estreitas e três espaços largos, ao contrário dos outros 35. Precisa da
      tabela completa da ISO/IEC 16388, não de dedução.
- [ ] **ITF e ITF-14** — a tabela dos dez dígitos está certa, e o formato é
      simples. O que falta é acertar a moldura: a razão larga/estreita tem de
      ser igual na moldura e nos dados (o leitor mede-a na moldura), e a
      moldura de início não pode ter barra larga. Duas correções feitas e ainda
      não leu — falta perceber qual das duas o leitor está a recusar.
- [ ] **Codabar** — mesma situação: a estrutura de sete elementos é conhecida,
      a tabela dos dezassete caracteres não.
- [ ] **UPC-E** — deixado de fora do `upcean.js` de propósito. A tabela de
      paridade depende do dígito de controlo do UPC-A expandido, e escrevê-la
      de memória é a forma rápida de entregar códigos que não passam em
      leitor nenhum. Entra com a ISO/IEC 6120 à mão.
- [ ] **Code 93** — ainda nem tentado.
- [ ] **GS1 DataBar** (Omni, Expanded, Limited) — o mais difícil dos 1D.

**2D matriciais**, por ordem de dificuldade. Todos são verificáveis pelo ZXing,
que já os lê: Data Matrix, Aztec, PDF417, Micro QR, rMQR.

- [ ] **FrameQR** — não é uma simbologia nova, é um pós-processamento sobre o QR
      que já existe: um rectangle branco no centro para caber um logótipo. É o
      mais barato de todos e vale ser o primeiro.
- [ ] Data Matrix (ECC200)
- [ ] Aztec
- [ ] PDF417
- [ ] Micro QR (M1–M4) — estrutura completamente diferente: um só padrão de
      alinhamento, e máscaras e máscaras de dados próprias
- [ ] rMQR —矩形, com reflexão. Especificação de 2022.

**E três coisas da lista que não são código:**

- [ ] **iQR Code** — propriedade da Denso Wave, e a especificação não é
      publicada. Não é implementável com rigor. Dizer não é a resposta errada.
- [ ] **SQRC** — a parte encriptada exige AES *e* um modelo de distribuição de
      chaves que não é nosso para decidir. O contentor é possível; o segredo não
      sem o utilizador dizer como é que a chave chega ao leitor.
- [ ] **QR dinâmico** — aponta para um URL curto de redirecção que só um servidor
      pode servir. Uma app que corre toda no dispositivo, sem contas nem
      servidor, não tem como fazer isto. E os "scan analytics" são tracking de
      pessoas.

**Regra que rege esta secção:** um encoder só entra no repositório depois de o
ZXing devolver a string certa. Não há "quase". O motivo está em cima — quatro
encoders pareceram certos durante a escrita e não eram.

---

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
