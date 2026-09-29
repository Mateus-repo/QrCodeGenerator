# Kotlin

**Estado:** o core passa os 34 vectores de `spec/vectors.json`. A app Android
ainda não existe.

## Como compilar

```bash
cd kotlin
./gradlew :core:test      # Windows: gradlew.bat :core:test
```

**Não precisa de Gradle instalado** — o `gradlew` descarrega a versão fixada em
`gradle/wrapper/gradle-wrapper.properties`. Precisa de um JDK, e o toolchain
está fixado em **Java 21**, pelo que serve o JDK do sistema ou o JBR do Android
Studio.

É a primeira stack do repositório a usar Gradle; a Java compila com `javac` por
um `build.sh`, sem Maven nem Gradle. Daqui o wrapper ser obrigatório em vez de
confortável: sem ele, "compila aqui" depende do Gradle que cada máquina tem.

## A estrutura, e porque o core não está dentro do Android

```
kotlin/
├── build.gradle.kts       — plugins e a versão do Kotlin
├── settings.gradle.kts
├── gradlew, gradlew.bat   — o wrapper
├── gradle/wrapper/        — a versão fixada do Gradle
├── core/                  — Kotlin/JVM puro: os payloads e o PIX
│   └── src/{main,test}/kotlin/com/qrcodegen/core/
└── android/               — a app (por fazer)
```

**`:core` é Kotlin/JVM puro e `:app` vai ser a aplicação Android.** A separação
não é cosmética: é o que permite ao core correr os 34 vectores da spec em
segundos, sem o SDK do Android e sem o AGP. Sem isso não haveria como verificar
um payload Kotlin contra a spec antes de lhe meter uma interface por cima.

O `README.md` desta pasta propunha `Payloads.kt` dentro de
`app/src/main/java/`. Era o caminho curto para um ficheiro e o caminho longo para
não ter testes: dentro do módulo Android, um teste de payload só corre com o SDK
instalado e o AGP a resolver.

## O que o core faz

Onze tipos de payload e o PIX, com `QrCategory` a enumerar os onze e
`QrFields` com os nomes de campo **que a spec usa** — `mailTo`, `wifiSsid`,
`vcFirstName`. O PIX é a excepção e a excepção tem razão: os campos chamam-se
`key`, `name` e `city` porque são os do `PixPayload` do Banco Central.

**A verificação é byte a byte contra `spec/vectors.json`**, e a spec é o arbrito
— `AGENTS.md` é explícito sobre isso, e este módulo não tem nenhuma das outras
linguagens como referência.

## O que ainda não está

- **O encoder de QR.** O core só constrói payloads; não há código de
  biblioteca. Sem ele não há nível 2 — a verificação por leitura, que é a que
  apanha o que nenhum teste estrutural vê.
- **A app Android.** O `README.md` da pasta tem o plano.
- **A leitura pela câmara.** O ZXing tem um módulo de Android que a faz
  nativamente, e é a razão de ser desta plataforma.

## Os quatro bugs que os vectores apanharam ao escrever isto

Todos dentro do core, e nenhum deles apanhado por um teste de estrutura — só
pelo confronto com a spec. Vale a pena porque mostram o que uma spec apanha e o
que não:

- **O `escapeWifi` punha `$1` em vez de `\`**, porque numa cadeia de
  substituição o `$1` é a referência ao primeiro grupo. O payload saía
  `WIFI:T:WPA;S:Rede$1 Com$1 Separadores;...` — que se desenha, se lê, e liga a
  uma rede que não existe. **É a terceira vez que esta armadilha aparece neste
  repositório**: o `re.sub` do Python tinha o mesmo problema, e o `$` numa
  substituição do `bundle.mjs` punha `</body>` dentro do JavaScript. A correção
  em todos é a mesma: **passar uma função**, que desliga as substituições todas.

- **O dígito verificador do CPF iterava `1..2` em vez de `9..10`**, e o peso do
  primeiro dígito saía errado. O sintoma é a mensagem errada: o CPF
  `529.982.247-25` da spec, que **é válido**, era recusado com "os dígitos
  verificadores não conferem" — que é precisamente a mensagem falsa, porque os
  dígitos conferem e a conta não.

- **O `stripWrapping` removia também os espaços**, e o exemplo do Banco Central
  tem `5913Fulano de Tal` — treze caracteres **com um espaço no meio**, que o
  comprimento declarado `'13'` conta. Tirá-lo deixava onze, a leitura perdia-se a
  meio e o `08` do comprimento da cidade era lido como uma etiqueta nova. **Um
  espaço no nome de uma pessoa é o caso mais comum que existe**, e não um caso de
  bordo.

- **O conjunto do SMS era `CharRange + String`**, e o Kotlin resolve essa soma
  com `T` inferido para `Any`: o espaço, a vírgula e os parênteses desapareceram
  da verificação sem erro de compilação. **Um conjunto de caracteres escrito como
  expressão é um conjunto de caracteres que ninguém lê** — agora é uma cadeia
  plana, como no navegador, e comparável com ele linha a linha.
