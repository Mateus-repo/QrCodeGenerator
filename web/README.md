# Web — PWA

O cliente com mais alcance: um link e funciona em qualquer Windows, Mac, Linux
ou telemóvel, sem instalar nada.

**Stack:** HTML + CSS + ES modules + Canvas. Sem framework, sem build,
**zero dependências**.
**Estado:** ✅ 11 tipos · ✅ 103 testes · ✅ 9 temas × 3 modos · ✅ encodererificado com o ZXing · Lighthouse 100/100/100 **nas 18 combinações**

Guia de uso e partilha: [`../docs/COMO-USAR.md`](../docs/COMO-USAR.md)

---

## Duas formas de usar

### 1. Servido (GitHub Pages, Netlify, qualquer servidor)

```bash
cd web
python -m http.server 8777
# abre http://127.0.0.1:8777
```

Ou com Node, se preferires: `npx serve web`.

Instalável como app (PWA): funciona offline depois da primeira visita.

### 2. Ficheiro único, sem servidor

```bash
node web/tools/bundle.mjs
# -> web/dist/qrcode-generator.html   (~116 KB)
```

Abre com duplo clique, de `file://`, em qualquer sistema operativo. Dá para
mandar por email ou pôr num cartão de memória.

**Porque é que existem as duas formas:** módulos ES são bloqueados em `file://`
pelo Chrome (CORS), por isso a versão em vários ficheiros precisa de um
servidor. O ficheiro único contorna isso — não usa módulos.

---

## Estrutura

```
web/
├── index.html            layout: formulário | resultado
├── styles.css            estrutura e contrato de variáveis
├── themes.css            forma por família + paleta por família e modo
├── themes.js             famílias, modos, persistência, sem flash
├── app.js                estado, formulários, exportação
├── qrcode.js             encoder QR (ISO/IEC 18004), sem dependências
├── payloads/
│   ├── types.js          payload e validação dos 11 tipos
│   ├── pix.js            PIX / BR Code
│   ├── text.js           ASCII, escaping iCal/WiFi, URL encoding
│   └── normalize.js      telefone e URL
├── manifest.json         PWA
├── sw.js                 service worker (offline)
├── assets/icon.svg
├── tests/                node:test + verificação cruzada com o ZXing
├── tools/bundle.mjs      gera o ficheiro único
└── dist/                 (gerado) ficheiro único
```

---

## Temas

Nove famílias, cada uma com variante clara e escura — 27 combinações. Em
*Opções → Tema* escolhes a família, e no botão ao lado o modo:

| Família | Claro | Escuro |
|---|---|---|
| **Padrão** | as cores do site | idem, invertidas |
| **Windows 11** | Mica claro | Mica escuro |
| **Windows 10** | Fluent claro | Fluent escuro |
| **Windows 8** | Metro claro | **Metro escuro — o original** |
| **Windows 7** | Aero Glass | Aero escuro |
| **Windows XP** | Luna | ardósia com o brilho do Luna |
| **Windows 95** | o azul-petróleo de sempre | esquema "Dark" dos anos 90 |
| **macOS** | como o macOS real | como o macOS real |
| **Ubuntu** | Yaru, berinjela `#77216f` | Yaru escuro, berinjela `#300a24` |

O modo **Sistema** segue o que o computador disser, e muda sozinho se o ligares
com a página aberta. A escolha (família + modo) fica guardada e é aplicada
**antes do primeiro paint**, senão via-se um flash a cada carregamento.

### Honestidade sobre as variantes escuras

Nem todas existem no sistema original:

- **Existem de facto:** Windows 7, Windows 8 (o Metro escuro *era* o original),
  Windows 10, Windows 11, macOS desde o Mojave, e a Yaru do Ubuntu, que tem
  variante escura oficial.
- **São interpretação nossa:** Windows 95 e Windows XP. A Microsoft nunca
  entregou um 95 nem um Luna escuro. O que existia eram temas de terceiros
  populares na altura — o esquema "Dark" do Windows 98, o "Roy's Dark Theme" e o
  "Luna Black" — e é ao espírito desses que estes blocos recurrrem.

As fontes dos temas retrô também não são fornecidas. MS Sans Serif, Tahoma,
Segoe UI, SF Pro e Ubuntu são propriedade de terceiros; cada tema pede a sua
pelo nome e cai na seguinte se não estiver instalada. Em Linux quase nenhuma
existe, e é por isso que cada tema define uma pilha e não uma fonte só.

### Como o CSS está organizado

`data-theme` leva a **forma** e `data-modo` leva a **cor**, em atributos
separados:

```css
[data-theme='win95'] { --raio: 0; --fonte: 'MS Sans Serif', ...; }   /* forma */
[data-theme='win95'][data-modo='escuro'] { --fundo: #12242e; ... }   /* cor   */
```

A forma não tem modo: o Windows 95 é sempre com a mesma moldura 3D, tenha a
página clara ou escura. São 9 blocos de forma e 18 de cor, e não 27 de cada.

O modo `sistema` **não existe no CSS** — o JavaScript resolve-o para `claro` ou
`escuro` conforme o `prefers-color-scheme` antes de escrever no atributo. Se
fosse feito em CSS, cada paleta apareceria duas vezes: uma sob `[data-modo='escuro']`
e outra dentro de um `@media`. São 18 blocos, não 36. Há um teste que falha se
alguém escrever `[data-modo='sistema']` no CSS.

### O QR code nunca é tematizado

Um código tem de ser módulos escuros sobre fundo claro, e não há como consertar
depois de impresso. O canvas fica sempre preto sobre branco, em todos os temas.
Isto não é uma convenção: há um teste que falha se algum tema tocar nas cores do
canvas, e outro que confirma que nenhum tema chega perto.

Verificado nos píxeis, e não só por leitura do CSS: nas 18 combinações o canvas
dá **os mesmos 263 169 píxeis** — 93 636 escuros, 169 533 claros, zero com cor.

### O que a verificação de contraste encontrou

As paletas não foram estimadas a olho. `tests/themes.test.mjs` calcula a razão de
contraste WCAG 2.1 de cada par de tokens, compõe as cores translúcidas sobre o
fundo como o browser faz, e percorre as 18 paletas. O que apanhou:

| Achado | Razão |
|---|---|
| Cabeçalho do Ubuntu a **1.98:1** | quase invisível: `--texto` escuro sobre a berinjela |
| Opções e campos brancos sobre o Windows 11 escuro | `--superficie` era branco em vez do Mica já composto: **1.09:1** |
| Campos do Aero claro a **3.11:1** | `--campo-fundo` apontava para o fundo (o azul do ambiente) em vez da superfície |
| Caixa de erro do Windows 95 escuro a **1.00:1** | fundo de erro branco com texto branco |
| "Guardar PNG" branco sobre cinza | `[data-theme='x'] button` (0,1,1) vencia `button.primario` (0,1,0) |
| Gradiente do botão do XP a **2.9:1** na ponta clara | o brilho do Luna deixava o branco por baixo de 4.5 |

O gradiente merece nota: o Lighthouse **não o pode apanhar**, porque não sabe
avaliar gradientes e o `background-color` de um elemento com gradiente é
transparente. Só um teste que leia as paragens do `linear-gradient` é que o vê.
É a razão de existir o teste *"o texto do botão principal sobrevive a todos os
pontos do gradiente"*. O brilho do Luna passou a ser uma linha de 1 px no topo do
botão em vez de um fundo mais claro: mesma personagem, texto legível.

Dois testes estruturaiswentam além do contraste:

- *"a forma não depende do modo"* — se a forma estivesse dentro dos blocos de
  modo, mudar de claro para escuro mudaria o raio e a fonte, e o Windows 95
  escuro deixaria de parecer Windows 95.
- *"a cor do texto de cada modo é realmente clara ou escura"* — um "modo escuro"
  com texto escuro passa todos os testes de contraste, porque o contraste entre
  duas cores escuras é alto. É o erro mais óbvio de todos e nenhum rácio o
  denuncia.

Lighthouse dá 100/100/100 nas 18 combinações.

---

## Testes

```bash
# 103 testes: encoder + payloads + temas + os 10 vetores da spec partilhada
node --test "web/tests/*.test.mjs"

# o teste que importa: o ZXing lê o que o encoder produz?
node web/tests/cross-check.mjs
python web/tests/descodificar.py
```

O segundo par é o que apanha bugs reais. Were 29 matrizes — versões 1 a 39,
1500 bytes de payload, acentos, emoji, caracteres de controlo, iCalendar e
vCard — e confirma que um leitor independente devolve o texto original.

> **Foi este teste que encontrou dois bugs** que nenhum teste estrutural vê:
> a máscara 4 com `x` e `y` trocados (a única assimétrica das oito) e as
> posições dos padrões de alinhamento erradas a partir da versão 7. Os QR
> resultantes até "pareciam" certos.

---

## O encoder de QR

Escrito à mão, ~450 linhas, porque uma biblioteca de QR para a web são ~40 KB
de JavaScript e uma cadeia de dependências. O algoritmo cabe num ficheiro e
assim sabemos exactamente o que o site envia.

Cobre: modo byte (UTF-8), versões 1–40, os quatro níveis de correção de erro,
Reed-Solomon com interlaçamento, as 8 máscaras com escolha por penalização,
padrões funcionais, informação de formato e de versão.

```js
import { encode, draw, toSvg, MAX_BYTES } from './qrcode.js';

const qr = encode('https://exemplo.pt', { ecl: 'M' });
// -> { size, version, mask, modules }

draw(canvas, 'https://exemplo.pt', { scale: 8, border: 4 });
const svg = toSvg('https://exemplo.pt', { border: 4 });
```

**Opção `mask`:** força uma máscara. Só existe para depurar contra outra
implementação — nunca em produção.

---

## Portabilidade — o que foi decidido e porquê

O requisito é funcionar em Windows, macOS, Linux e telemóvel. Decisões
consequentes:

| Tema | Decisão | Porquê |
|---|---|---|
| Dependências | zero | nada de `npm install`, nada de CDN a cair |
| Build | nenhum | compila zero; Hospedar é copiar ficheiros |
| Módulos ES | sim, **+** ficheiro único | ESM é limpo mas o Chrome bloqueia `file://`; o ficheiro único cobre esse caso |
| Tipos de letra | `system-ui` | o que o SO já tem; aspeto nativo em todas as plataformas |
| Aspeto dos controlos | nativo | o `<select>` desenha a seta do SO; substituir dava aspeto falso em Linux e Android |
| Tema | 9 famílias × 3 modos | cada família tem clara e escura; o modo `sistema` segue o SO e muda com ele |
| Forma vs. cor | dois atributos, `data-theme` e `data-modo` | a forma não tem modo — o Windows 95 escuro é o Windows 95 |
| Cores dos temas | verificadas, não estimadas | contraste WCAG AA em todos os pares e em todos os pontos dos gradientes, por teste |
| Alvos de toque | 44 px mínimo | mão grande, ecrã pequeno |
| Entalhe do iPhone | `env(safe-area-inset-*)` | os botões não ficam debaixo da notch |
| Layout | 1 coluna abaixo de 860 px | telemóvel primeiro, duas colunas no computador |
| Ficheiros | `<a download>` + Blob | a via que funciona em todos os browsers; `showSaveFilePicker` é só do Chromium |
| Copiar | Clipboard API **com alternativa** | a API só existe em contexto seguro; em `file://` copiamos o payload por `<textarea>` |
| Partilhar | `navigator.share` quando existe | botão só aparece onde a API existe; senão faz o mesmo que "Guardar" |
| Service worker | só em http/https | registar em `file://` dá 404; é ignorado em silêncio |
| Redimensionar | escala calculada **depois** de saber o tamanho da matriz | senão o "tamanho em píxeis" pedido dá um canvas do tamanho errado |
| Redução de movimento | `prefers-reduced-motion` | respeita a preferência do SO |

---

## Acessibilidade

- `prefers-reduced-motion` respeitado.
- Alvos com no mínimo 44×44 px.
- Erros em `role="alert"`, com mensagem **por campo** e não genérica.
- "Saltar para o conteúdo", `lang="pt-PT"`, `aria-label` nas secções.
- O canvas tem `role="img"` e um `aria-label` descritivo.
- Foco visível com contorno de 3 px em todos os controlos.
- O payload é legível por ecrã de leitura (`<pre>` com `tabindex`).
- Cada tema passa a auditoria de contraste; a que falhava era o texto, não a
  paleta em si.

Lighthouse: acessibilidade 1.0, boas práticas 1.0, SEO 1.0 — **verificado nas 18
combinações** de família e modo, não só no padrão.

---

## Privacidade

Nada sai do dispositivo. Não há analytics, não há CDN, não há chamadas de
rede para além dos ficheiros do próprio site. O QR de WiFi, VCard ou PIX
contém dados sensíveis e nunca saem daqui.

---

## Notas

- O ficheiro único em `dist/` é gerado. Não está no git (ver `.gitignore`).
- `assets/icon-192.png` e `icon-512.png` estão declarados no manifesto mas não
  são gerados: o SVG serve para todos os browsers modernos. Num PWA
  instalável vale a pena gerar os PNG.
- O `README.md` do repositório diz onde cada coisa está.
