# Kotlin — app Android

**Estado:** o `:core` existe e passa os 34 vectores de `spec/vectors.json`. A
app também existe, **compila, instala e corre** — e isso está verificado, não
suposto: ver [o verificador](#o-verificador-da-app) abaixo. O que a app **não**
faz é mostrar um QR.

**Stack planeada:** Kotlin 2 / Jetpack Compose / ZXing core (Apache-2.0)

Partilha o ZXing com a stack Java (ver `../../java/desktop-javafx/README.md`).

**O ZXing está declarado e não é usado.** A dependência `com.google.zxing:core`
está no `build.gradle.kts` e **nenhum ficheiro de produção da app ou do `:core` a
importa** — só os ficheiros de *teste* do `:core`. Hoje são 2 MB de peso morto no
APK, e fica assim até ao encoder de matriz. Está aqui porque vai ser preciso no
passo a seguir, e não porque sirva para alguma coisa agora.

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

## O que a app faz hoje

Uma tela, a **fase zero**: escolher um dos onze tipos, preencher os campos, ver o
payload e a validação.

```
kotlin/
├── core/                       ← os payloads e as simbologias, verificados
│   └── src/main/kotlin/com/qrcodegen/core/
└── android/
    ├── build.gradle.kts
    ├── tools/verificar-app.py  ← a verificação, ver abaixo
    └── src/main/java/com/qrcodegen/app/
        ├── MainActivity.kt     ← a única Activity
        └── ui/CasaActivity.kt  ← a tela: selector, campos, payload
```

E o que ela **não** tem, escrito aqui para ninguém dar com a boca cheia:

- **Sem imagem.** Não há `QrView.kt`. O `:core` sabe construir `CodigoMatriz` e
  `CodigoDeBarras`, mas um QR em Kotlin seria um **segundo** encoder ao lado do
  Java — e a `AGENTS.md` é explícita: um encoder que só passa nos testes próprios
  não está verificado, e o que verifica é o ZXing a ler a imagem. O encoder de
  matriz em Kotlin é trabalho dele, com os seus testes de leitura.
- **Sem códigos de barras na tela.** O `:core` tem `Lineares`, `Gs1_128` e
  `CodigoGs1`, verificados com o ZXing nos 139 testes. A tela não os mostra. É o
  item em `../../docs/TODO.md`.
- **Sem câmara.** `Scanner.kt` continua por fazer.
- **Sem testes.** `kotlin/android/src/test` **não existe**. Os três bugs que os
  comentários da `CasaActivity` descrevem — "a app arrancava, mostrava a mensagem
  de validação e não aceitava escrita nenhuma" — foram todos encontrados à mão,
  e um bug encontrado à mão não fica escrito em lado nenhum.

## O verificador da app

```powershell
python kotlin/android/tools/verificar-app.py
```

Constrói o APK, arranca um emulador se não houver nenhum, instala, arranca a
Activity e **mede o que a tela mostra**. Não é um teste de interface no sentido
do `WinFormsTestes`: uma interface Compose não se mede sem um dispositivo, e o
dispositivo que este repositório tem é um emulador. O que mede é o que a
`AGENTS.md` pede quando diz que um teste que prova que uma peça está boa não
prova que a máquina liga — aqui, que **o que se escreve no ecrã chega ao `:core`
e volta como payload**.

O que afirma, e porquê cada um:

| Afirmação | A propriedade verificada |
|---|---|
| O APK construiu | Sem isto os cinco passos seguintes medem a versão de ontem |
| O processo existe | Um `am start` devolve `Success` mesmo quando a app morre a seguir |
| A Activity está em primeiro plano | O processo vivo pode estar em segundo plano |
| O ecrã tem pixels | Um PNG de poucos KB é um ecrã em branco |
| O selector tem **as onze** categorias | O registo com onze e o selector com dez não dá sintoma nem erro |
| O campo tem o que se escreveu | A escrita chegou ao `:app` |
| **Um `TextView`** tem o payload | O `:core` foi chamado e respondeu |
| A contagem de caracteres aparece | O `remember` está a recalcular |

**"O campo tem o que se escreveu" e "um `TextView` tem o payload" são o mesmo
testo medido de duas maneiras, e a diferença entre eles é o que os torna bons.**
A primeira versão afirmava `link in texts()`, e passava mesmo com o `Text` do
payload trocado por uma constante — porque o *campo* tem o link e basta. Um
`EditText` com o link é o campo; um `TextView` com o link é o payload. **Não se
pergunta *onde* está; pergunta-se *em que nó* está.**

**Verificado reintroduzindo dois bugs**, que é a única maneira de saber se um
teste afirma alguma coisa:

| Bug reintroduzido | O que o verificador disse |
|---|---|
| `QrCategory.entries.take(10)` no selector | `10 de 11` · `faltam: ['PIX']` |
| `text = "conteudo"` em vez de `text = payload` | `o campo tem o link mas nenhum TextView o tem` |

Sai com código diferente de zero em ambos, e verde com a app restaurada.

O que o verificador **não** prova está escrito na sua própria saída, para quem o
corre não ficar com a ideia errada: não prova que gere um QR, nem que a app tenha
testes.

## Antes de publicar

Falta a decisão em `../../docs/TODO.md` BLOQUEIO 4: **é preciso conta de
Play Store ou basta APK sideload?** Isso muda a assinatura, o keystore e se o
investimento em Compose compensa.

## A máquina

Não precisa de instalar nada. O Android Studio já lá está, com a imagem de
sistema e o AVD `Medium_Phone`, e a aceleração do emulador está disponível
(`WHPX is installed and usable`). O Gradle é o `gradlew` versionado em
`../gradle/wrapper/`.

O verificador usa o `adb` do SDK. **O `ANDROID_HOME` pode estar vazio** — nesta
máquina está —, por isso que ele procura o SDK em `ANDROID_HOME`,
`ANDROID_SDK_ROOT` e na localização por omissão, e diz qual não encontrou em vez
de falhar a meio.

Para abrir aqui no IDE: **File → Open** e escolher a pasta `kotlin/` — a raiz do
Gradle. O Studio passa a ver os dois módulos, `core` e `android`.
