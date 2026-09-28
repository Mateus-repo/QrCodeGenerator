# Web — PWA

**Stack planeada:** HTML + CSS + ES modules + Canvas, sem build
**Estado:** ⬜ por fazer — pasta vazia de propósito

## Racional

- **Sem framework, sem build.** Abre com duplo clique, hospeda em qualquer
  lado (incluindo GitHub Pages), zero dependências para supply-chain.
- **Canvas** para o preview; `toBlob()` dá PNG sem biblioteca.
- **PWA** (manifest + service worker) para funcionar offline e ser instalável
  no telemóvel.
- Se um dia precisar de TypeScript, Vite entra **sem mudar a estrutura**.

O algoritmo QR em JS (Reed-Solomon + escolha de máscara + tabela de
caracteres) cabe em ~250 linhas. Escrever à mão também é um bom teste de que a
spec está bem entendida — e evita uma dependência.

## Esplanado

```
web/
├── index.html          — layout de 2 colunas: formulário | preview
├── app.js              — controlo de estado e render
├── payloads/pix.js     — espelha python/qrcode_core/pix.py
├── payloads/*.js       — um módulo por tipo
├── assets/
├── manifest.json       — PWA
└── sw.js               — service worker (cache offline)
```

## Primeiro passo

1. `payloads/pix.js` a passar os vetores de `../spec/vectors.json` — a mesma
   lista de testes, em JS.
2. Depois a UI, espelhando o layout de `../csharp/desktop-winforms/MainForm.cs`.

Ver `../docs/IDEIA.md` secção 4.
