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

## A app: fase zero, e o que ela faz e o que ela não faz

`:app` e' uma aplicacao Android que escolhe um dos onze tipos, mostra os campos
desse tipo e escreve o **payload**. Nao mostra QR, nao le a camara, nao exporta.

**Nao mostrar o QR e' uma decisao, e nao uma falta.** O encoder ainda nao existe
no `:core`, e um QR gerado por um segundo caminho dentro da app seria um encoder
sem nenhuma verificacao por leitura — que e' o que a `AGENTS.md` diz que nunca
entra no repositorio. O que o `:core` sabe garantir e' o payload, e a app mostra
isso.

### Os onze tipos vem do `enum`, e isso e' a verificacao

O selector e' um `for (c in QrCategory.entries)` e os campos sao um `when`
**exaustivo, sem `else`**. Um tipo novo da um erro de compilacao, e nao um ecra
vazio. E' a resposta ao modo de falha que a `AGENTS.md` descreve do GS1-128: onze
listas de campos escritas a mao teriam onze sitios para um tipo aparecer num e
noutro, e o sintoma e' um registo sem entrada — invisivel.

## Os dois bugs que so o teste no dispositivo apanhou

Nenhum dos dois apanha um teste, porque **nenhum dos dois e' um bug de payload**.
Sao bugs de estado, e o payload esta certo em todo o momento — que e' o que os
faz tao dificeis de ver.

**O `QrFields` era uma classe normal com `var`, e o Compose re-renderiza por
identidade.** `f.url = "x"` nao cria um objecto novo, o `mutableStateOf` nao ve
nada, o `OutlinedTextField` fica com `""` para sempre e o teclado e' recusado. **A
app arrancava, nao rebentava, e a mensagem de validacao aparecia** — parecia que
funcionava. O sintoma e' que o campo aceita o foco, o teclado sobe, e nao entra
um unico caracter. So se descobre a escrever. A correccao e' `data class`, para o
`copy()` criar a identidade nova — e a razao esta escrita no `QrFields` com a
magnitude do problema, porque nao ha nada que impeca alguem de o voltar a
transformar numa classe normal.

**O `editar` partia de um `QrFields()` novo em vez de uma copia.** Cada tecla
cria um objecto com **um** campo preenchido e apaga todos os outros. No `link`
nunca se viu, porque ha um campo so; no PIX, cada tecla limpava a chave e o nome
e so o ultimo campo escrito sobrevivia. **Uma app que aceita texto e o perde a
seguir nao da erro, nao rebenta, e o sintoma e' "a app nao guarda nada"** — que
e' o que se descobre a preencher um formulario a serio, e nao a olhar para ele.

**A regra que sai disto, e que vale para as outras stacks:** um bug de estado
nao aparece em nenhum teste que verifique saida, e **uma app que arranca e mostra
a mensagem certa pode nao fazer nada**. A verificacao que apanhou os dois foi
escrever num campo e ver o que fica — que e' a razao de o nivel 3 existir no
site mesmo com o encoder certo, e de nenhum teste de estructura substituir a
leitura.

## O que foi verificado, e o que nao foi

**Verificado:**

- `gradlew :app:assembleDebug` produz um APK de 9,5 MB, com manifesto, sete
  `.dex` e `resources.arsc`.
- Instalado no emulador (`android-37.2`, AVD `Medium_Phone`), lancado, **sem
  nenhuma excepcao** no `logcat`.
- Os onze tipos aparecem no selector e cada um desenha os seus campos.
- Escrever `exemplo.pt` no `link` produz `https://exemplo.pt` — **18
  caracteres, que e' exactamente o que a spec diz** para `link_sem_esquema`.
- As mensagens de validacao vem do `:core` e sao as mesmas que as outras cinco
  stacks mostram: *"Indica um link."*, *"Indica a chave PIX."*, *"CPF/CNPJ
  invalido (os digitos verificadores nao conferem)."*
- Com a correccao do `copy()`, os tres campos do PIX **mantem o texto em
  simultaneo**.

**Nao verificado:** escrever uma chave de PIX **valida** no dispositivo e ver os
122 bytes do TLV. A automacao por `adb` e' que nao chega la — o `input text` come
os hifens do UUID e os *backspaces* so apagam para tras do cursor, e o que chegou
ao campo foi um fragmento de 38 digitos, que a app recusou com a mensagem certa.
**A logica do PIX esta verificada por dez vectores da spec no mesmo codigo que a
app chama**; o que falta e' a prova de que o dedo de uma pessoa chega ao teclado
certo, e essa prova e' uma instrumented test ou um dedo.

## Duas coisas que o tooling obriga a saber, e que a documentacao nao diz

**O `kotlin("android")` ja nao existe no AGP 9.** Desde o 9.0 o suporte do
Kotlin vem integrado, e declara-lo e' um erro que diz exactamente isso. O do
Compose fica, e e' separado.

**O `google()` tem de estar em `pluginManagement`, e nao so em `allprojects`.**
Um resolve *plugins* e o outro resolve *dependencias*, e sem o primeiro a falha
e' `Plugin [id: 'com.android.application', version: '9.4.1', apply: false] was
not found` seguida de uma lista de repositorios onde o `google()` nao esta. **A
lista de "onde procurou" e' a pista**, e a mensagem principal nao e'.

## Gradle, AGP e Kotlin: as versoes que ficam

| | | |
|---|---|---|
| Gradle | 9.8.0 | pelo wrapper, em `gradle/wrapper/` |
| AGP | 9.4.1 | exige Gradle 9.1+ |
| Kotlin | 2.4.20 | **uma so versao para os dois modulos** |
| Compose | `kotlin("plugin.compose")` | o compilador do Compose, que tem de casar com o do Kotlin |
| `compileSdk` | 36 | e nao `android-37.0`, que e' uma previa |
| `minSdk` | 26 | pelo `java.time`, que so existe como API no 26 |

## O que ainda nao esta

- **O encoder de QR.** Sem ele nao ha nivel 2 — a verificacao por leitura, que
  e' a que apanha o que nenhum teste estrutural ve. E' a peca que falta, e e' do
  `:core`.
- **A leitura pela camara**, e a permissao que vai com ela. O `README.md` de
  `android/` tem o plano, e a permissao entra **no mesmo commit que o scanner**:
  pedir uma permissao que nada usa e' o pior dos dois mundos.
- **A app em si esta em fase zero** — sem QR, sem exportacao, sem partilhar.
- **A decisao de BLOQUEIO 4**: conta de Play Store ou APK sideload. Muda a
  assinatura e o keystore, e o `build.gradle.kts` nao tem assinatura de release
  por causa disso.

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
