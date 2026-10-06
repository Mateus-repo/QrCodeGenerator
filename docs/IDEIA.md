# Ideia — Próximo Passo do QrCodeGenerator

> Documento de planeamento original. Define **o que** fazer, **como** organizar o
> repositório e **porquê**. Está um pouco desatualizado à medida que o trabalho
> avançou — a secção 1 foi reescrita e a 7 marca o que ficou para trás.
>
> | Documento | Para quê |
> |---|---|
> | [`COMO-USAR.md`](COMO-USAR.md) | **Como usar e como partilhar cada app** |
> | [`TODO.md`](TODO.md) | O checklist do que falta |
> | [`TIPOS-QR.md`](TIPOS-QR.md) | A spec: formato exato de cada payload |
> | Este | O raciocínio por trás das decisões |

---

## 1. Onde estamos hoje

**Quatro stacks completas**, com os mesmos 11 tipos e os mesmos payloads,
verificadas contra a mesma spec partilhada.

| Stack | O que é | Estado |
|---|---|---|
| `web` | PWA + encoder QR próprio, zero dependências | ✅ 54 testes · Lighthouse 100/100/100 |
| `csharp` | App Windows + `core` sem dependências | ✅ 137 testes |
| `java` | App desktop **multiplataforma** + `core` | ✅ 119 testes |
| `python` | Biblioteca + CLI | ✅ 108 testes |

```
418 testes no total, mais 29 matrizes de QR confirmadas por leitura com o ZXing
```

O que já está resolvido:

- **Spec formalizada** em `docs/TIPOS-QR.md` e `spec/vectors.json`.
- **Os 7 bugs do antigo `QrService.cs` corrigidos**, cada um com teste.
- **PIX** implementado e validado contra o exemplo oficial do Banco Central.
- **Quatro clientes concordam byte a byte** nos vetores da spec.
- **Paridade testada em dois níveis**: o payload (string a string) e a imagem
  (gerar PNG e descodificar com um leitor independente).
- **A app Java corre no mesmo código em Windows, macOS e Linux**, com
  instalador nativo de cada um.

O que **não** existe ainda:

- Kotlin/Android (pasta com README, vazia de propósito).
- GUI em Python (`python/gui/`).
- Os 10 tipos antigos ainda não estão portados para Python.
- Sem estilo, sem logo, sem geração em lote, sem leitor de QR.
- Sem CI.

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

Estado: ✅ pronto nas 3 stacks · 🔧 corrigido · ⬜ por escrever

| # | Tipo | Payload alvo | Estado |
|---|---|---|---|
| 1 | Link | `https://…` | ✅ |
| 2 | Texto livre | texto cru | ✅ |
| 3 | Email | `mailto:` + `?subject=&body=` | ✅ |
| 4 | Telefone | `tel:+351…` | ✅ |
| 5 | SMS | `SMSTO:+351…:msg` | ✅ |
| 6 | WhatsApp | `https://wa.me/<num>?text=` | ✅ |
| 7 | Evento (iCal) | `BEGIN:VCALENDAR…` | ✅ 🔧 |
| 8 | Localização | `geo:lat,lng` | ✅ 🔧 |
| 9 | WiFi | `WIFI:T:WPA;S:;P:;H:;;` | ✅ |
| 10 | VCard 4.0 | `BEGIN:VCARD…` | ✅ 🔧 |
| 11 | **PIX / pagamento** | BR Code EMV (`00020126…6304…`) | ✅ |
| 12 | **Crypto** | `bitcoin:`, `ethereum:` (EIP-681) | ⬜ |
| 13 | **Produto (GS1)** | `https://gs1.org/01/<GTIN>` | ⬜ |
| 14 | **ISBN / EAN** | `urn:isbn:` / AI `(01)` | ⬜ |
| 15 | **Redes sociais** | link/handle por plataforma | ⬜ |
| 16 | **App / deep link** | `myapp://`, App Link, store URL | ⬜ |
| 17 | **Documento / PDF** | URL (+ hash opcional) | ⬜ |
| 18 | **Cupão / desconto** | URL curta assinada | ⬜ |
| 19 | **MeCard** | `MECARD:N:;TEL:;;` | ⬜ |
| 20 | **Bluetooth** | `BT:addr;nome;;` | ⬜ (experimental) |
| 21 | **Fidelidade / loyalty** | payload JSON assinado | ⬜ |
| 22 | **Ficha técnica / menu** | URL do documento | ⬜ |

### 🔧 Bugs encontrados e corrigidos

Todos encontrados ao ler o `QrService.cs` original, todos corrigidos em
`csharp/core/`, todos com teste de regressão em `csharp/tests/BugFixTests.cs`.

| Bug | Consequência | Correção |
|---|---|---|
| VCard perdia a morada | contacto sem endereço | ADR completo (rua, cidade, CEP, país) |
| VCard sem tipos de telefone | um único número, sem `cell`/`work` | dois telefones com tipo, `N` com a família primeiro |
| iCal com `Environment.NewLine` | LF fora do Windows → payload diferente por SO | CRLF explícito (RFC 5545) |
| iCal sem escaping | iCal inválido com `,` `;` `\` | `\,` `\;` `\\` `\n` |
| Coordenadas sem validação | `geo:` que nenhum mapa abre | intervalo lat ±90, lng ±180 |
| `GeoLat`/`GeoLng` em `string` | parsing inconsistente | `double?` |
| Link sem filtro de esquema | `javascript:` e `data:` passavam | allowlist + recusa explícita |
| Telefone normalizado a meio | `00` só convertido no início | normalização consistente |

### 🐛 Bugs encontrados no encoder de QR do site

Encontrados pelo teste que **descodifica** a imagem com o ZXing, e não por
nenhum teste estrutural:

- **Máscara 4 com `x` e `y` trocados.** A norma define as máscaras em termos de
  (linha, coluna) e a 4 é a única assimétrica. As outras sete são simétricas,
  por isso só esta falhava — e só em 1 dos 29 casos testados.
- **Posições dos padrões de alinhamento erradas** a partir da versão 7. O QR
  "parecia" certo e nenhum leitor o lia.

O detalhe exato de cada payload (com escaping e exemplos) vai para
`docs/TIPOS-QR.md`.

---

## 6. Funcionalidades transversais (as 6 plataformas)

Nem todos precisam de tudo. Prioridade:

**P0 — em todas**
- [x] Catálogo de tipos idêntico (da spec) — 11 tipos em C#, Python e web
- [x] Export **PNG** em 256 / 512 / 1024 / 2048 (web, C#, Python)
- [x] Nível de correção L/M/Q/H com explicação em linguagem simples (web)
- [x] Validação com mensagem **por campo** (não um erro genérico)
- [x] Cópia para clipboard do PNG e do payload (web)
- [x] Deteção de overflow com números concretos ("123 de 2331 bytes (ECC M)")
- [x] Tema claro/escuro (web, segue o SO)
- [x] pt-PT em todas; en/es por fazer

**P1 — onde faz sentido**
- [x] Export **SVG** (web, Python) — escala sem perda
- [ ] Export **SVG** no C#
- [ ] Export **PDF** com vários QR numa página
- [ ] **Estilo**: cor foreground/background, módulos arredondados, logo ao centro
      (com validação de contraste e da "zona de leitura")
- [ ] **Geração em lote** a partir de CSV/JSON → N PNG + ZIP (Python, web, C#)
- [ ] Histórico local + favoritos + templates
- [ ] **Leitura** de QR existente (ZXing no Java/Kotlin, `zxing-cpp` no Python,
      `BarcodeDetector` na web) — o `zxing-cpp` já está nos testes

**P2 — Stretch**
- [ ] Códigos de **barras**: Code128, EAN-13, ITF, Code39
- [ ] Outras simbologias 2D: Data Matrix, PDF417, Aztec
- [ ] QR **dinâmico** (conteúdo real num link curto, permite analytics/desativar)
- [x] PWA instalável e offline
- [ ] Assinatura criptográfica de payloads (fidelidade/cupões)

---

## 7. Roadmap

### Fase 0 — Fundação ✅
Porque primeiro: sem isto, as 5 stacks divergem e não há como saber qual está certa.

- [x] `docs/TIPOS-QR.md` com o formato exato dos 22 tipos
- [x] `spec/vectors.json` com 10 casos de PIX, cada um verificado por CRC,
      round-trip e **descodificação do PNG**
- [x] Gerador `spec/gerar-vectors.py`
- [x] Corrigir os 7 bugs 🔧 **antes** de propagar
- [ ] `spec/payloads.json` (metadados: nome, ícones, ordem, campos) — hoje
      vive no código de cada stack
- [ ] Vetores dos 10 tipos antigos (depende de os portar para Python)
- [ ] CI

### Fase 1 — Python (implementação de referência) 🟡
- [x] `qrcode_core/pix.py` — PIX completo
- [x] `qrcode_core/render.py` — PNG/SVG, matriz, capacidade
- [x] `cli/qrcli.py` — `pix`, `pix-leer`, `fix-crc`
- [x] Testes a correr a spec/vectors.json
- [ ] `qrcode_core/payloads.py` — os outros 10 tipos
- [ ] `qrcode_core/batch.py` — CSV → ZIP
- [ ] `gui/` — Tkinter

### Fase 2 — Web (PWA) ✅
- [x] `index.html` + CSS, layout responsivo
- [x] Módulos JS por tipo, espelhando a spec
- [x] Canvas com preview em tempo real, export PNG/SVG
- [x] Service worker + manifest (offline, instalável)
- [x] **Encoder de QR próprio** (~450 linhas, zero dependências)
- [x] Ficheiro único para `file://`
- [ ] Publicar no GitHub Pages

### Fase 3 — C# (paridade) ✅
- [x] Extrair `QrService` → `core/` sem dependências de WinForms
- [x] Tipos novos + os 7 bugs
- [x] 137 testes, incluindo leitura do PNG com o ZXing
- [ ] Export SVG/PDF

### Fase 4 — Java desktop ✅
- [x] Java 21 + JavaFX, sem Maven nem Gradle (dois diretórios e um JDK)
- [x] `core` sem dependências, espelhando o `csharp/core`
- [x] `QrPayloadBuilder` / `QrValidator` / `Pix` com os mesmos payloads
- [x] 119 testes, incluindo dois de portabilidade (locale e fim de linha)
- [x] `build.sh` a compilar, testar e correr, em Windows/macOS/Linux
- [x] `jpackage` para `.msi`/`.exe`, `.dmg`/`.pkg` e `.deb`
- [ ] Geração em lote a partir de CSV
- [ ] Leitura de QR pela câmara (o ZXing tem, mas a app ainda não usa)

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
leitor real, independentemente da biblioteca usada. **Foi ele que encontrou os
dois bugs do encoder de QR do site.**

Estado atual:

| Stack | Nível 1 | Nível 2 | Comando |
|---|---|---|---|
| Python | ✅ 108 testes | ✅ zxing-cpp | `python -m pytest tests -q` |
| C# | ✅ 137 testes | ✅ ZXing.Net | `dotnet test` |
| Java | ✅ 119 testes | ⚠️ ZXing gera e lê (mesma biblioteca) | `java/build.sh test` |
| Web | ✅ 54 testes | ✅ 29 matrizes, zxing-cpp | `node --test` + `descodificar.py` |
| Kotlin | ⬜ | ⬜ | — |
| Go | ⬜ | ⬜ | — |

A ressalva em Java: o `RenderTests` gera e lê com o mesmo ZXing, o que é mais
fraco — um erro comum aos dois passava despercebido. Para compensar, o PNG
gerado pela CLI do Java foi verificado à mão com o `zxing-cpp` do Python, e
confirma que devolve o payload. Quando houver CI, o mesmo ficheiro de spec pode
servir de teste de integração.

**O Go entra por último, e é a única em que a escolha da linguagem é um
trade-off e não um dado.** Numa app que se instala, a linguagem é uma decisão
de plataforma — o que o utilizador já tem. Num programa que se distribui, é uma
decisão de distribuição: um binário só sem runtime chega-se mais longe do que
um ficheiro que precisa do runtime instalado. **O Go compensa aqui pela
distribuição e não pela ergonomia**, e é por isso que é a sexta: só depois de a
spec estar madura é que a sexta implementação pode limitar-se a cumpri-la.

O que fica menos óbvio: o Go **não tem** `char`, e `len(s)` conta bytes. Todo o
código que toca em texto ASCII — que é o código de barras, quase todo — tem de
converter ou de iterar bytes. Num repositório cuja regra é *nada escrito de
memória*, isso é mais um sítio onde um erro não dá erro nenhum.

Falta um `spec/verificar-paridade.sh` que corra as stacks e imprima uma tabela
✅/❌ por vetor. Por agora corre-se cada uma à parte.

---

## 9. Riscos e decisões em aberto

| Tema | Opção A | Opção B | Decidido |
|---|---|---|---|
| Código partilhado | Kotlin Multiplatform | Spec em JSON + N implementações | **Spec em JSON** — menos toolchain, cada app idiomática |
| Biblioteca web | Escrever à mão | `qrcode.js` | **À mão** (~450 linhas), zero dependências. Verificado com o ZXing |
| UI Python | Tkinter | PySide6 | **Tkinter** (zero install). Por decidir |
| Ordem de implementação | Python primeiro | Web primeiro | **Python primeiro**, como planeado. O site foi depois |
| Idiomas | pt-PT só | pt/en/es | **pt-PT**. en/es por fazer |
| Estilo (logo, cores) | Em todas | Só na web | Por decidir. Recomendação: só web |
| Módulos ES em `file://` | Módulos | Ficheiro único | **As duas**: ESM servido + bundle para duplo clique |
| LICENSE | MIT | MIT | Manter |

Riscos técnicos a vigiar:

- **QR não é ilimitado.** Limite real: 2 953 bytes (ECC L, modo byte). Payloads
  grandes (WiFi com password longa, VCard completa) são o problema número 1.
  A UI já avisa **antes** de gerar, com os números.
- **Escaping é onde as implementações divergem.** Cada caractere especial tem
  regra própria por tipo (`\:` no WiFi, `\;` no iCal, `%20` em mailto). Já
  confirmado na prática: foi um bug de escaping (a máscara 4) que só o teste
  de leitura apanhou.
- **Escolha de máscara pode variar entre bibliotecas** → o PNG nunca é
  byte-a-byte igual entre stacks. Daí o Nível 2 (descodificar) em vez de
  comparar hashes. Também torna fútil comparar matrizes com outra biblioteca.
- **N× o esforço de manutenção.** Cada correção na spec tem de ser replicada.
  É o custo do modelo escolhido; pagamos por clareza, não por DRY de código.
- **Divergência silenciosa.** Uma stack pode passar o Nível 1 e falhar o Nível 2
  — payload certo, QR ilegível. O Nível 2 não é opcional.

---

## 10. Próximo passo

1. Portar os 10 tipos antigos para `python/qrcode_core/payloads.py` — é a peça
   que falta para o Python ter paridade com C# e web.
2. Gerar os vetores desses 10 tipos na spec e passar nas 3 stacks.
3. `spec/verificar-paridade.sh` para correr tudo de uma vez.
4. CI (GitHub Actions) com um job por stack.
5. JavaFX e depois Kotlin.

---

## Notas de repo

- `.gitignore` cobre Java (`target/`, `*.class`), Android/Gradle (`.gradle/`,
  `build/`, `local.properties`), Python (`__pycache__/`, `.venv/`,
  `*.egg-info/`, `.pytest_cache/`), Node (`node_modules/`) e os artefactos
  gerados do site (`web/dist/`, `web/.crosscheck/`).
- Artefactos grandes (APK, exe, ZIP de release, o ficheiro único do site)
  ficam fora do git — usar GitHub Releases.
- `spec/` é a fonte de verdade. Se um payload mudar, muda-se aqui primeiro e
  depois em todas as stacks, com a spec a provar que ficaram iguais.
