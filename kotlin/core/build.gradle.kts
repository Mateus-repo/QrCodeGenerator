/**
 * O core: os payloads e o desenho, sem Android e sem interface.
 *
 * ## Porque este modulo e' separado do `:app`
 *
 * **E' o que torna a stack verificavel.** Os 34 vectores de `spec/vectors.json`
 * correm aqui em segundos, com `gradlew :core:test`, sem o SDK do Android e sem
 * o AGP — e sem isso nao haveria forma de verificar um payload Kotlin contra a
 * spec antes de lhe meter uma interface por cima.
 *
 * O `README.md` da pasta propunha `Payloads.kt` dentro de `app/src/main/java/`.
 * Isso era o caminho curto para um ficheiro, e o caminho longo para nao ter
 * testes: dentro do modulo Android, um teste de payload so corre com o SDK
 * instalado e o AGP a resolver, e quem escreve o codigo no dia-a-dia nao faz
 * isso. Aqui corre com um comando.
 *
 * ## O que o core espelha
 *
 * `web/payloads/types.js` e `python/qrcode_core/tipos.py`. **A `AGENTS.md` diz
 * que a spec e' o arbitro e nao qualquer uma das implementacoes** — por isso que
 * aqui nao ha referencia a nenhuma das outras linguagens: ha referencia aos
 * vectores, e a verificacao e' byte a byte contra eles.
 */
plugins {
    kotlin("jvm")
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    /*
     * `kotlin-test` com o runner do JUnit 5.
     *
     * **E' a unica dependencia de teste que nao e' sobre dados.** O resto — o
     * Gson para ler a spec e o ZXing para a leitura — e' sobre o ficheiro que a
     * verificacao consome. Esta e' sobre a forma de escrever `assert`.
     */
    testImplementation(kotlin("test"))
    testImplementation(kotlin("test-junit5"))
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    /*
     * Gson para ler a spec nos testes, e o mesmo que a stack Java usa.
     *
     * **So nos testes.** O core nao sabe o que e' JSON, e nao tem de saber: o
     * payload de um QR e' texto, e quem o produz nunca teve um JSON na mao. Uma
     * dependencia no `main` por causa de um ficheiro de testes seria a prova de
     * que a fronteira esta no sitio errado.
     */
    testImplementation("com.google.code.gson:gson:2.13.2")

    /*
     * O ZXing, para o nivel 2: gerar a imagem e descodifica-la com um leitor
     * independente. **E' o mesmo artifact que a stack Java usa**, pela razao de
     * ser o mesmo leitor — um encoder so esta verificado se um leitor que nao foi
     * escrito pela mesma mao o le.
     */
    testImplementation("com.google.zxing:core:3.5.3")
}

tasks.test {
    useJUnitPlatform()

    /*
     * A spec esta dois niveis acima (`spec/vectors.json`) e o Gradle corre com o
     * directorio do modulo. **Um caminho escrito a mao aqui parte assim que
     * alguem renomear a pasta, e o sintoma e' "a spec nao foi encontrada" num
     * teste que nao tem nada a ver com a spec.**
     *
     * E a spec e' a unica fonte da verdade deste repositorio, portanto o teste
     * que a le tem de falhar alto quando ela nao esta la — e nao passar a vazio.
     */
    systemProperty(
        "qrcodegen.spec",
        rootProject.file("../spec/vectors.json").absolutePath,
    )
    systemProperty(
        "qrcodegen.cases",
        rootProject.file("../spec/casos.py").absolutePath,
    )

    testLogging {
        events("failed")
        showStandardStreams = true
    }
}


/**
 * A ponta de Kotlin da comparacao de modulos.
 *
 *     gradlew :core:runLinear < casos.json
 *
 * Le os casos em JSON de stdin e devolve os modulos em JSON, para o
 * `spec/paridade-kotlin.mjs` comparar com o Python sem interpretar nada pelo
 * caminho. E' o mesmo contrato que o `java/build.sh run-linear`.
 *
 * **Vive no classpath dos testes, e nao do `main`.** A ferramenta e' um
 * verificador: nao ha razao para o `core` saber o que e' JSON, e o Gson ja era
 * dependencia de teste para a spec. Um `main` de producao para um script de
 * comparacao seria uma dependencia a mais no `main` por causa de um ficheiro
 * que so o `spec/` consome.
 *
 * **O `standardInput` e' explicito** porque o `JavaExec` nao o herda por omissao
 * — e sem esta linha o Gradle le do seu proprio stdin, a toolchain diz que o
 * daemon nao tem terminal, e acomparacao fica sem casos com um erro que fala de
 * rede. E' o mesmo disfarce do toolchain do daemon: a falha aponta para o
 * sitio errado.
 */
tasks.register<JavaExec>("runLinear") {
    group = "verification"
    description = "Casos de códigos de barras em JSON (stdin) -> módulos em JSON (stdout)"

    dependsOn("testClasses")
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("com.qrcodegen.tools.ParidadeLinearesKt")

    standardInput = System.`in`
}

/**
 * A ponta de Kotlin da comparação de um código **2D**.
 *
 * **E' uma tarefa a parte e não mais um tipo na [runLinear],** porque um Data
 * Matrix devolve uma matriz e não uma lista de módulos: ver a nota do
 * `ParidadeDataMatrix` para o que acontece quando se tenta encaixar os dois no
 * mesmo formato.
 *
 * O `standardInput` é explícito pela mesma razão que na `runLinear`: o `JavaExec`
 * não o herda por omissão, e sem esta linha o Gradle lê do seu próprio stdin e a
 * comparação fica sem casos — com um erro que fala de rede.
 */
tasks.register<JavaExec>("runDatamatrix") {
    group = "verification"
    description = "Casos de Data Matrix em JSON (stdin) -> matrizes em JSON (stdout)"

    dependsOn("testClasses")
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("com.qrcodegen.tools.ParidadeDataMatrixKt")

    standardInput = System.`in`
}

/**
 * A ponta de Kotlin da comparacao do **GS1-128**.
 *
 * **E' uma tarefa a parte e nao mais um tipo na [runLinear],** porque o GS1-128
 * devolve **tres textos** - `payload`, `gs1` e `legenda` - e o `CodigoDeBarras` so
 * tem `legenda`. Encaixa-lo obrigava a perder dois dos tres, e a perder era um
 * `KeyError` no script de paridade que so aparecia em Kotlin.
 *
 * O `standardInput` e' explicito pela mesma razao que na [runLinear]: o `JavaExec` nao
 * o herda por omissao, e sem esta linha o Gradle le do seu proprio stdin e a
 * comparacao fica sem casos - com um erro que fala de rede.
 *
 * **O `mainClass` tem o `Kt` no fim**, que e' o que o Kotlin junta ao nome do
 * ficheiro. Sem ele o Gradle diz `Could not find or load main class`, que nao fala
 * do ficheiro em falta - e e' o mesmo disfarce do `gradle-wrapper.jar`.
 */
tasks.register<JavaExec>("runGs1") {
    group = "verification"
    description = "Casos de GS1-128 em JSON (stdin) -> modulos e tres textos em JSON (stdout)"

    dependsOn("testClasses")
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("com.qrcodegen.tools.ParidadeGs1Kt")

    standardInput = System.`in`
}
