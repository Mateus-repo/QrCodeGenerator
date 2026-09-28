# O que fazer ANTES de continuar

> Checklist de bloqueio. Nada disto é opcional, e nada disto depende de
> implementar C#, Java, Kotlin, Python ou web. É a fundação que impede as 5
> implementações de divergirem. Ver `IDEIA.md` para o porque.

**Estado:** nada foi implementado. O repositório tem hoje 1 cliente (C# WinForms)
com 10 tipos e sem testes.

---

## BLOQUEIO 1 — Spec dos tipos (obrigatório)

Sem isto, cada stack nova inventa o seu payload e ninguém sabe qual está certo.

- [ ] `docs/TIPOS-QR.md` — para os 22 tipos, escrever:
  - [ ] o formato exato do payload (com exemplo preenchido)
  - [ ] campos obrigatórios / opcionais / validações
  - [ ] regras de **escaping** por tipo
  - [ ] o limite de bytes de cada tipo
- [ ] Fazer primeiro só dos **10 tipos que já existem**, escritos a partir do
      `QrService.cs`, para não haver surpresa
- [ ] Marcar explicitamente onde o C# atual está **errado** (VCard sem morada,
      iCal sem escaping, etc.) — a spec fica com a versão correta, o C# passa a
      ter um bug a corrigir

**Saída:** alguém que nunca viu o código consegue gerar o payload correto a
partir da doc sozinha.

---

## BLOQUEIO 2 — Vetores de teste (obrigatório)

A spec em prosa não é verificável. Precisamos de input → output esperado.

- [ ] `spec/vectors.json` com ~30 casos, cobrindo:
  - [ ] o caso feliz de cada tipo
  - [ ] caracteres problemáticos: `;` `:` `\` `"` `,` `%` `&` `?` `#`
  - [ ] acentos e emoji (`Olá`, `☕`, `😀`)
  - [ ] quebras de linha dentro de Texto, VCard, iCal e mailto
  - [ ] campos vazios → erro esperado
  - [ ] limites: payload exatamente no máximo e 1 a mais
  - [ ] telefone com `00`, `+`, só dígitos, com espaços
  - [ ] coordenadas com `,` decimal e com `.` decimal
  - [ ] SSID e password de WiFi com `;` e `:` (o caso clássico de bug)
- [ ] `spec/payloads.json` — metadados por tipo: nome PT, nome EN, ícone/emoji,
      ordem de apresentação, lista de campos, validação
- [ ] `spec/verificar-paridade.*` — script que corre as stacks e imprime
      ✅/❌ por vetor (começa com 1 coluna: a stack que existir)

---

## BLOQUEIO 3 — Corrigir os bugs do C# ANTES de propagar

Se propagarmos os bugs, os 5 clientes nascem com os mesmos 7 defeitos.
Corrigir agora custa 1 ficheiro; corrigir depois custa 6.

Ficheiro: `csharp/desktop-winforms/QrService.cs`

- [ ] **VCard**: adicionar morada completa (rua, nº, cidade, CEP, país) —
      hoje todos os parâmetros de endereço passam `""`
- [ ] **VCard**: vários telefones/emails com tipo (`cell`, `work`)
- [ ] **iCal**: forçar `\r\n` em vez de `Environment.NewLine`
- [ ] **iCal**: escapar `,` `;` `\` e newlines nos campos de texto
- [ ] **Geo**: validar latitude em [-90, 90] e longitude em [-180, 180]
- [ ] **Geo**: mudar `GeoLat`/`GeoLng` de `string` para `double?`
- [ ] **Link**: rejeitar esquemas não permitidos (`javascript:`, `data:`, `file:`)
- [ ] **Telefone**: normalização consistente (hoje `00` só é convertido se
      estiver exatamente no início, e o WhatsApp não valida o comprimento)

---

## BLOQUEIO 4 — Decisões a tomar (preciso de resposta tua)

Estas não são técnicas, são de produto. Respondemos **antes** de escrever
qualquer código novo:

- [ ] **Qual é a implementação de referência?** (rec: Python — mais rápida de
      iterar e valida a spec)
- [ ] **A web leva framework?** (rec: não, HTML + ES modules, zero build)
- [ ] **A app Android exige conta/Play Store ou basta APK sideload?** (muda
      assinatura, keystore, e se vale a pena)
- [ ] **Java desktop: Windows só, ou também macOS/Linux?** (rec: Windows, igual
      ao C#; macOS só com `jpackage` a dar)
- [ ] **PIX entra já?** (é o tipo com mais regras: EMV, CRC16, chave, valor) —
      recommend: sim, é o que torna o projeto útil em Portugal/Brasil
- [ ] **Estilo e logo nos QR: em todas as plataformas ou só web+Python?**
- [ ] **QR dinâmico (link curto + analytics)?** isso implica backend, muda o
      âmbito de "app local" para "serviço"

---

## BLOQUEIO 5 — Repos e ferramentas

- [ ] `.gitignore` cobrir Java (`target/`, `*.class`), Gradle/Android
      (`.gradle/`, `build/`, `local.properties`), Python (`__pycache__/`,
      `.venv/`, `*.egg-info/`), Node (`node_modules/`)
- [ ] CI (GitHub Actions) com um job por stack, mesmo que vazio no início
- [ ] `README.md` raíz reescrito como índice das 5 pastas
- [ ] Um `README.md` curto dentro de cada pasta, com a stack e o comando de build

---

## Depois disto (ordem de implementação)

```
1. python/qrcode_core   → payloads.py + render.py + testes com vectors.json
2. web/                 → espelha payloads.py em JS + PWA
3. csharp/              → core separado de WinForms, tipos novos, bugs
4. java/desktop-javafx  → Payloads.java espelhado + jpackage
5. kotlin/android       → Compose + scan de câmara
6. extras               → lote, leitor, simbologias, PDF/SVG
```

Cada passo só avança quando os vectors passam nessa stack.

---

## Como saber que está feito

- [ ] `docs/TIPOS-QR.md` completo para os 10 tipos existentes
- [ ] `spec/vectors.json` com 30 casos, todos verdes em pelo menos 1 stack
- [ ] `QrService.cs` sem os 7 bugs, e com um teste que o prova
- [ ] Respostas ao BLOQUEIO 4 registadas em `IDEIA.md` secção 9
- [ ] `verificar-paridade` a correr em 2 stacks (C# e Python) com ✅
