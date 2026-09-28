# Web — PWA

O cliente com mais alcance: um link e funciona em qualquer Windows, Mac, Linux
ou telemóvel, sem instalar nada.

**Stack:** HTML + CSS + ES modules + Canvas. Sem framework, sem build,
**zero dependências**.
**Estado:** ✅ 11 tipos · ✅ 54 testes · ✅ encoder verificado com o ZXing ·
Lighthouse 100/100/100

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
# -> web/dist/qrcode-generator.html   (~69 KB)
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
├── styles.css            uma folha, tema claro/escuro
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

## Testes

```bash
# 54 testes: encoder + payloads + os 10 vetores da spec partilhada
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
| Tema | `prefers-color-scheme` | segue o SO, sem interruptor |
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

Lighthouse: acessibilidade 1.0, boas práticas 1.0, SEO 1.0.

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
