# Ideia — Próximo Passo do QrCodeGenerator

> Documento de planeamento. Define **o que** fazer a seguir, **como** organizar o
> repositório e **porquê**. Nada aqui é obrigatório; é a base para decidirmos.
>
> O checklist concreto e bloqueante está em [`TODO.md`](TODO.md) — lê esse primeiro.

---

## 1. Onde estamos hoje

Existe uma única implementação: **C# / .NET 8 WinForms** (`csharp/desktop-winforms`),
com 10 categorias de QR, preview em tempo real, export PNG e exe standalone.

O que já provou funcionar:

- Geração de payload por categoria (Link, Texto, Email, Telefone, SMS, WhatsApp,
  Evento, Geo, WiFi, VCard).
- Validação de campos com mensagens em português.
- Deteção de conteúdo demasiado longo (`DataTooLongException`).
- UI simples, sem dependências externas além do QRCoder.

O que **não** existe ainda:

- Nenhum outro cliente (site, APK, Java, Python).
- Nenhum catálogo de tipos formalizado — as regras estão espalhadas em `QrService.cs`.
- Nenhum teste. As regras podem divergir silenciosamente entre plataformas.
- Export apenas em PNG, apenas 256/512/1024, sem estilo nem logo.

---

## 2. Ideia central: 1 motor de regras, 5 interfaces

O erro clássico ao fazer "a mesma app em 5 linguagens" é duplicar a lógica e
divergir. O QR, ao contrário, é um formato **normalizado**: o conteúdo final é
uma string com regras públicas (RFC / ISO / schemas de cada tipo).

Logo, a regra não precisa de ser código partilhado — precisa de ser uma
**especificação verificável**:

```
        docs/TIPOS-QR.md      (fonte de verdade humana)
        spec/vectors.json     (exemplos dourados, legíveis por máquina)
                 │
                 ▼
   ┌─────────┬─────────┬─────────┬─────────┬─────────┐
   │  C#     │  Java   │  Kotlin │  Python │   Web   │
   │ WinForms│  JavaFX │ Android │ core/CLI│   PWA   │
   └─────────┴─────────┴─────────┴─────────┴─────────┘
        cada um implementa a spec e passa nos mesmos testes
```

**Regra de ouro:** o mesmo conjunto de campos produz **exatamente a mesma
string de payload** em todas as plataformas. Se divergir, é bug.

Como garantir (a parte detalhada fica na Fase 0):

1. Cada stack tem testes que leem `spec/vectors.json`.
2. Cada teste: constrói o payload a partir dos campos → compara com o esperado.
3. Extra: gerar PNG e **descodificar** o PNG, confirmando que devolve o payload
   esperado. Isto apanha bugs de biblioteca, não só de lógica.

---

## 3. Organização de pastas (nova)

```
QrCodeGenerator/
├── README.md                  ← índice: o que é cada pasta, link para docs
├── docs/
│   ├── IDEIA.md               ← este documento
│   └── TIPOS-QR.md            ← catálogo de tipos + formato exato de cada payload
├── spec/
│   ├── payloads.json          ← categorias, campos e regras (contrato entre stacks)
│   └── vectors.json           ← vetores de teste dourados (input → payload esperado)
│
├── csharp/
│   └── desktop-winforms/      ← app Windows (C# / .NET 8 / WinForms / QRCoder)
├── java/
│   └── desktop-javafx/        ← app desktop multiplataforma (Java 21 / JavaFX / ZXing)
├── kotlin/
│   └── android/               ← app Android (Kotlin / Jetpack Compose / ZXing)
├── python/
│   ├── qrcode_core/           ← biblioteca partilhada (payloads + geração)
│   ├── cli/                   ← interface de linha de comandos
│   └── gui/                   ← interface gráfica (Tkinter ou PySide6)
└── web/
    ├── index.html             ← PWA estática (ES modules, sem build obrigatório)
    ├── assets/
    └── sw.js                  ← service worker (offline + instalável)
```

Notas sobre a organização:

- **Uma pasta por plataforma, nunca por funcionalidade.** Uma categoria nova
  toca 6 pastas (spec + 5 clientes), mas o nome das pastas nunca mente sobre o que
  há dentro.
- `python/qrcode_core` é a pasta única que vale a pena estruturar em sub-módulos
  (`payloads.py`, `render.py`, `batch.py`, `cli_app.py`) — é a implementação de
  referência, as outras copiam a estrutura.
- `web/` sem framework no início: HTML + ES modules + Canvas. Um ficheiro por
  categoria. Compila zero, abre com duplo clique, hospeda em qualquer lado.
  Se crescer, passa a Vite + TypeScript sem mudar a estrutura.
- `spec/` é **dados**, não código. Nenhuma stack o pode alterar sem atualizar
  o outro lado primeiro.

---

## 4. Stack definida por pasta

| Pasta | Linguagem | UI | Lib de QR | Build / Entrega |
|---|---|---|---|---|
| `csharp/desktop-winforms` | C# / .NET 8 | WinForms | QRCoder 1.8 (MIT) | `dotnet publish` → exe único |
| `java/desktop-javafx` | Java 21 | JavaFX | ZXing core (Apache-2.0) | `jpackage` → exe / dmg |
| `kotlin/android` | Kotlin 2 / AGP | Compose | ZXing core | Gradle → APK / AAB |
| `python` | Python 3.11+ | Tkinter (CLI) | segno + Pillow | `pyinstaller` / `pipx` |
| `web` | TypeScript (JS) | HTML/CSS | implementação própria (QR por tabela) | estático / GitHub Pages |

Escolhas e raciocínio:

- **Java e Kotlin partilham o ZXing** → a mesma biblioteca, os mesmos bugs
  reports, a mesma resposta a payloads malformados. Vantagem real de ter as duas.
- **Python com segno**: sem dependências pesadas, saída SVG de primeira, e
  `qrcode` como alternativa se preferirmos Pillow. Python é a melhor escolha
  para a implementação de referência porque é a mais rápida de iterar.
- **Web sem biblioteca**: o algoritmo QR (RS + Reed-Solomon + escolha de máscara)
  cabe em ~250 linhas. Zero dependências = zero supply-chain, zero build.
  Se preferirmos menos código, `qrcode.js` funciona bem.
- **WinForms mantém-se** porque já funciona. Não há ganho em reescrever
  em Avalonia/WinUI — o objetivo aqui é *paridade de tipos*, não modernity.

---

## 5. Mais tipos de QR (o pedido principal)

Estado: ✅ já existe · 🆕 novo · 🔧 fix

| # | Tipo | Payload alvo | Estado |
|---|---|---|---|
| 1 | Link | `https://…` | ✅ |
| 2 | Texto livre | texto cru | ✅ |
| 3 | Email | `mailto:` + `?subject=&body=` | ✅ |
| 4 | Telefone | `tel:+351…` | ✅ |
| 5 | SMS | `SMSTO:+351…:msg` | ✅ |
| 6 | WhatsApp | `https://wa.me/<num>?text=` | ✅ |
| 7 | Evento (iCal) | `BEGIN:VCALENDAR…` | ✅ |
| 8 | Localização | `geo:lat,lng` | ✅ |
| 9 | WiFi | `WIFI:T:WPA;S:;P:;H:;;` | ✅ |
| 10 | VCard 4.0 | `BEGIN:VCARD…` | ✅ |
| 11 | **PIX / pagamento** | BR Code EMV (`00020126…6304…`) | 🆕 |
| 12 | **Crypto** | `bitcoin:`, `ethereum:` (EIP-681) | 🆕 |
| 13 | **Produto (GS1)** | `https://gs1.org/01/<GTIN>` | 🆕 |
| 14 | **ISBN / EAN** | `urn:isbn:` / AI `(01)` | 🆕 |
| 15 | **Redes sociais** | link/handle por plataforma | 🆕 |
| 16 | **App / deep link** | `myapp://`, App Link, store URL | 🆕 |
| 17 | **Documento / PDF** | URL (+ hash opcional) | 🆕 |
| 18 | **Cupão / desconto** | URL curta assinada | 🆕 |
| 19 | **MeCard** | `MECARD:N:;TEL:;;` | 🆕 |
| 20 | **Bluetooth** | `BT:addr;nome;;` | 🆕 (experimental) |
| 21 | **Fidelidade / loyalty** | payload JSON assinado | 🆕 |
| 22 | **Ficha técnica / menu** | URL do documento | 🆕 |

🔧 **Bugs/limitações a corrigir já** (encontrados ao ler `QrService.cs`):

- **VCard perde a morada**: os parâmetros de endereço/endereço estão todos a
  passar `""`, logo o endereço nunca entra no payload. Adicionar morada
  (rua, número, cidade, CEP, país).
- **VCard não tem N/TITLE consistentes** para vários campos (dois telefones,
  tipo `work`/`cell`).
- **iCal usa `Environment.NewLine`**: em Windows dá CRLF, noutro platform dá LF.
  A spec de iCalendar exige CRLF. Fixa `CRLF` explicitamente em todas as stacks.
- **iCal não escapa**: vírgulas, `;` e newlines nos campos de texto produzem
  iCal inválido. Falta `\,` `\;` `\\` `\n`.
- **Coordenadas aceitam valores fora do intervalo** (lat ±90, lng ±180).
- **`GeoLat`/`GeoLng` em string** — deveria ser `double?` para não haver
  `Parse` duplicado nem risco de parsing inconsistente.
- **Link aceita qualquer coisa**: `javascript:`, `data:`, `ftp:` passam. Validar
  esquema.
- **Normalização de telefone inconsistente**: `00` → `+` só no início, e o
  WhatsApp remove todos os não-dígitos do prefixo mas não valida o tamanho.

O detalhe exato de cada payload (com escaping e exemplos) vai para
`docs/TIPOS-QR.md`.

---

## 6. Funcionalidades transversais (as 6 plataformas)

Nem todos precisam de tudo. Prioridade:

**P0 — em todas**
- [ ] Catálogo de tipos idêntico (da spec)
- [ ] Export **PNG** em 256 / 512 / 1024 / 2048
- [ ] Nível de correção L/M/Q/H com explicação em linguagem simples
- [ ] Validação com mensagem **por campo** (não um erro genérico)
- [ ] Cópia para clipboard do PNG e do payload
- [ ] Deteção de overflow com dica acionável ("o teu texto tem 3 100 caracteres,
      o limite com ECC L é 2 953")
- [ ] Tema claro/escuro
- [ ] pt-PT como base; en/es só na web

**P1 — onde faz sentido**
- [ ] Export **SVG** (web, Python, C#) — escala sem perda
- [ ] Export **PDF** com vários QR numa página
- [ ] **Estilo**: cor foreground/background, módulos arredondados, logo ao centro
      (com validação de contraste e da "zona de leitura")
- [ ] **Geração em lote** a partir de CSV/JSON → N PNG + ZIP (Python, web, C#)
- [ ] Histórico local + favoritos + templates
- [ ] **Leitura** de QR existente (ZXing no Java/Kotlin, `pyzbar`/`zxing-cpp`
      no Python, `BarcodeDetector` na web)

**P2 — Stretch**
- [ ] Códigos de **barras**: Code128, EAN-13, ITF, Code39
- [ ] Outras simbologias 2D: Data Matrix, PDF417, Aztec
- [ ] QR **dinâmico** (conteúdo real num link curto, permite analytics/desativar)
- [ ] PWA instalável e offline
- [ ] Assinatura criptográfica de payloads (fidelidade/cupões)

---

## 7. Roadmap

### Fase 0 — Fundação (1 a 2 dias, sem código de app)
Porque primeiro: sem isto, as 5 stacks divergem e não há como saber qual está certa.

- [ ] Criar `docs/TIPOS-QR.md` com o formato exato dos 22 tipos
- [ ] Criar `spec/vectors.json` com ~30 casos (incl. caracteres especiais, emoji,
      acentos, quebras de linha, payload vazio, limites)
- [ ] Criar `spec/payloads.json` (metadados: nome, ícones, ordem, campos)
- [ ] Script `spec/dump-csharp-payloads` que corra sobre o `QrService` atual e
      imprima cada payload → serve para calibrar a spec com o comportamento real
- [ ] CI: lint dos JSON + validação dos vectors (formato, não conteúdo)
- [ ] Corrigir os bugs 🔧 da secção 5 **antes** de propagar

### Fase 1 — Python (implementação de referência)
- [ ] `qrcode_core/payloads.py` — as 22 categorias, funções puras, sem UI
- [ ] `qrcode_core/render.py` — PNG/SVG, ECC, tamanho, estilo
- [ ] `qrcode_core/batch.py` — CSV → ZIP
- [ ] `cli/` — `qrcli link --url ... -o out.png`, útil para CI e scripts
- [ ] `gui/` — Tkinter, mesma estrutura de formulários
- [ ] Testes a correr a spec/vectors.json

Porque primeiro: é o mais rápido a iterar, e valida a spec antes de a escrever
em 3 linguagens mais.

### Fase 2 — Web (PWA)
- [ ] `index.html` + CSS com layout de 2 colunas (form / preview)
- [ ] Um módulo JS por categoria, espelhando `payloads.py`
- [ ] Canvas com preview em tempo real, export PNG/SVG
- [ ] Service worker + manifest (offline, instalável)
- [ ] Site GitHub Pages: `https://<user>.github.io/QrCodeGenerator/`

### Fase 3 — C# (paridade)
- [ ] Extrair `QrService` → `core/` sem dependências de WinForms
- [ ] Implementar os tipos novos + bugs
- [ ] Export SVG/PDF
- [ ] Referência de UI para as outras stacks (a que já tem preview)

### Fase 4 — Java desktop
- [ ] Maven/Gradle, Java 21, JavaFX
- [ ] `Payloads.java` espelhando a spec
- [ ] `QrView.java` com cache/animação (as bibliotecas nativas dão zoom suave)
- [ ] `jpackage` para gerar `.exe` e `.dmg` a partir do mesmo código

### Fase 5 — Kotlin / Android
- [ ] Compose com a mesma estrutura de ecrãs
- [ ] Scan integrado (a partir de câmara ou de imagem da galeria) — o grande
      diferencial do telemóvel
- [ ] Partilhar/imprimir direto, guardar no "Favoritos"
- [ ] APK release assinada

### Fase 6 — Lote + leitura + symbologias
- [ ] Geração em lote e leitor em todas as stacks

---

## 8. Como testar a paridade entre plataformas

Para cada stack, dois níveis de teste:

**Nível 1 — payload (rápido, obrigatório)**
```
para cada vetor em spec/vectors.json:
    payload = construir(campos)
    assert payload == esperado
```

**Nível 2 — imagem (lento, na CI)**
```
para cada vetor:
    png = gerar(payload, ecc=L, size=512)
    lido = descodificar(png)          # zxing / pyzbar / BarcodeDetector
    assert lido == payload
```

O Nível 2 é o que interessa: garante que o QR gerado é mesmo legível por um
leitor real, independentemente da biblioteca usada.

Um script `spec/verificar-paridade.sh` corre as 5 stacks e imprime uma tabela
✅/❌ por vetor. Quando a coluna do Java ficar verde, a spec está boa.

---

## 9. Riscos e decisões em aberto

| Tema | Opção A | Opção B | Recomendação |
|---|---|---|---|
| Código partilhado | Kotlin Multiplatform | Spec em JSON + 5 implementações | **Spec em JSON.** Menos toolchain, e cada app é idiomática |
| Biblioteca web | Escrever à mão (~250 linhas) | `qrcode.js` | Escrever à mão, é um bom exercício e elimina dependências |
| UI Python | Tkinter | PySide6 | **Tkinter** no início (zero install). PySide6 só se o visual unacceptable |
| Ordem de implementação | Python primeiro | Web primeiro | **Python primeiro**: é a spec executável mais barata de fazer |
| Idiomas | pt-PT só | pt/en/es | **pt-PT** primeiro; i18n com ficheiros de strings desde o início |
| Estilo (logo, cores) | Em todas | Só na web | **Só na web e Python** (onde há Cycle); o resto fica funcional |
| LICENSE | MIT (atual) | MIT | Manter |

Riscos técnicos a vigiar:

- **QR não é ilimitado.** Limite real: 2 953 bytes (ECC L, byte mode). Erros de
  quota de payloads grandes (WiFi com password longa, VCard com foto) são o
  problema número 1. A UI deve avisar **antes** de gerar.
- **Escaping é onde as implementações divergem.** Cada caractere especial tem
  regra própria por tipo (`\:` no WiFi, `\;` no iCal, `%0A` em mailto). Testes
  com strings que contêm caracteres problemáticos.
- **Aleatoriedade na escolha de máscara** pode variar entre bibliotecas → o PNG
  nunca é byte-a-byte igual entre stacks. Daí o Nível 2 (descodificar) em vez de
  comparar hashes.
- **5× o esforço de manutenção.** Cada correção na spec tem de ser replicada.
  É o custo do modelo escolhido; pagamos por clareza, não por DRY de código.

---

## 10. Próximo passo imediato (se hoje fosse começar)

1. Escrever `docs/TIPOS-QR.md` com os 22 tipos (payload exato + escaping).
2. Gerar `spec/vectors.json` com 30 casos a partir dessa doc.
3. Corrigir os 7 bugs 🔧 em `csharp/desktop-winforms/QrService.cs`.
4. Implementar `python/qrcode_core` e fazer passar os vectors.
5. Quando o Python passar, o resto é copiar a estrutura 4 vezes.

Nada disto precisa de mais do que as ferramentas que já tens instaladas.

---

## Notas de repo

- `.gitignore` foi alargado para cobrir Java (`target/`, `*.class`),
  Android/Gradle (`.gradle/`, `build/`, `local.properties`),
  Python (`__pycache__/`, `.venv/`, `*.egg-info/`) e Node (`node_modules/`).
- Artefactos grandes (APK, exe, ZIP de release) continuam fora do git —
  usar GitHub Releases.
