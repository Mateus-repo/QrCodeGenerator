# Kotlin — app Android

**Estado:** o `:core` existe e passa os 34 vectores de `spec/vectors.json`. A
app não.

**Stack planeada:** Kotlin 2 / Jetpack Compose / ZXing core (Apache-2.0)

Partilha o ZXing com a stack Java (ver `../../java/desktop-javafx/README.md`).

## Onde está o core, e porque não está aqui

O `:core` é um módulo **Kotlin/JVM puro**, em `../core/`, e este README
propunha antes que o `Payloads.kt` vivesse em `app/src/main/java/`. Isso mudou,
e a razão é a verificação:

> Dentro do módulo Android, um teste de payload só corre com o SDK instalado e
> o AGP a resolver — e quem escreve o código no dia-a-dia não faz isso.

Como módulo à parte, `gradlew :core:test` corre os 34 vectores da spec em
segundos, sem Android Studio e sem o SDK. **A regra que se verifica primeiro é a
do payload**, e a interface pode esperar.

## Racional

É a plataforma onde o QR é mais usado. Duas funcionalidades que só fazem
sentido aqui:

- **Leitura pela câmara** — o ZXing tem um módulo de Android que faz isso
  nativamente. Noutras stacks seria preciso descodificar uma imagem à mão.
- **Partilhar e imprimir** direto, e guardar em favoritos.

## Esplanado

```
kotlin/
├── core/                       ← feito: os payloads, verificados contra a spec
│   └── src/main/kotlin/com/qrcodegen/core/
└── android/                    ← a app, por fazer
    ├── build.gradle.kts
    └── src/main/java/…/
        ├── MainActivity.kt
        ├── QrView.kt         — preview + export
        └── Scanner.kt        — leitura pela câmara
```

**O encoder de QR é a peça que falta antes de tudo o resto**, e não é uma peça
desta pasta: é do `:core`, e sem ele não há nível 2 — a verificação por leitura
que é a que apanha o que nenhum teste estrutural vê. Ver `../README.md`.

## Antes de começar a app

Falta a decisão em `../../docs/TODO.md` BLOQUEIO 4: **é preciso conta de
Play Store ou basta APK sideload?** Isso muda a assinatura, o keystore e se o
investimento em Compose compensa.

## A máquina

Não precisa de instalar nada. O Android Studio já lá está, com a imagem de
sistema e o AVD `Medium_Phone`, e a aceleração do emulador está disponível
(`WHPX is installed and usable`). O Gradle é o `gradlew` versionado em
`../gradle/wrapper/`.

Para abrir aqui no IDE: **File → Open** e escolher a pasta `kotlin/` — a raiz do
Gradle. O Studio passa a ver os dois módulos, `core` e `android`.
