# O que fazer ANTES de continuar

> Checklist de bloqueio. Nada disto é opcional, e nada disto depende de
> implementar C#, Java, Kotlin, Python ou web. É a fundação que impede as 5
> implementações de divergirem. Ver `IDEIA.md` para o porque.

**Estado:** a spec do PIX está feita e validada contra o exemplo oficial do
Banco Central. Os 10 tipos do C# estão descritos mas ainda sem vetores.
Python tem 108 testes a passar.

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
- [ ] `requirements.txt` em `python/`

---

## Depois disto (ordem de implementação)

```
1. python/qrcode_core   → ✅ PIX pronto. Falta os 10 tipos existentes
2. web/                 → ✅ PWA + encoder próprio + ficheiro único
3. csharp/              → ✅ core extraído, 7 bugs corrigidos, PIX
4. java/desktop-javafx  → Payloads.java espelhado + jpackage
5. kotlin/android       → Compose + scan de câmara
6. extras               → lote, leitor, simbologias, PDF/SVG
```

Cada passo só avança quando os vectors passam nessa stack.

---

## Como saber que está feito

- [x] `docs/TIPOS-QR.md` com o PIX completo e os 10 tipos descritos
- [x] `spec/vectors.json` com 10 casos de PIX, verdes e descodificados
- [x] `QrService.cs` sem os 7 bugs, com teste de regressão para cada um
- [x] `verificar-paridade` a correr em 3 stacks (C#, Python e web) com ✅
- [x] Encoder de QR do site verificado por leitura com o ZXing (29 matrizes)
- [ ] `spec/vectors.json` com ~30 casos (faltam os 10 tipos em Python e web)
- [ ] Respostas ao BLOQUEIO 4 registadas em `IDEIA.md` secção 9
