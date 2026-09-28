# Kotlin — app Android

**Stack planeada:** Kotlin 2 / Jetpack Compose / ZXing core (Apache-2.0)
**Estado:** ⬜ por fazer — pasta vazia de propósito

Partilha o ZXing com a stack Java (ver `../../java/desktop-javafx/README.md`).

## Racional

É a plataforma onde o QR é mais usado. Duas funcionalidades que só fazem
sentido aqui:

- **Leitura pela câmara** — o ZXing tem um módulo de Android que faz isso
  nativamente. Noutras stacks seria preciso descodificar uma imagem à mão.
- **Partilhar e imprimir** direto, e guardar em favoritos.

## Esplanado

```
kotlin/android/
├── build.gradle.kts
└── app/src/main/java/…/
    ├── MainActivity.kt
    ├── Payloads.kt       — espelha python/qrcode_core/pix.py
    ├── QrView.kt         — preview + export
    └── Scanner.kt        — leitura pela câmara
```

## Antes de começar

Falta a decisão em `../../docs/TODO.md` BLOQUEIO 4: **é preciso conta de
Play Store ou basta APK sideload?** Isso muda a assinatura, o keystore e se o
investimento em Compose compensa.

## Primeiro passo

`Payloads.kt` a passar os vetores de `../../spec/vectors.json`. A UI só depois.
