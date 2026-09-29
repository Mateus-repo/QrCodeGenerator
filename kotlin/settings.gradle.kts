/*
 * O raiz do Gradle e' `kotlin/`, e e' o que se abre no Android Studio.
 *
 * **Dois modulos, e a separacao e' o que torna a stack verificavel.** O
 * `:core` e' Kotlin/JVM puro e corre os 34 vectores de `spec/vectors.json` em
 * segundos, sem o SDK do Android e sem o AGP; o `:app` e' a aplicacao. Sem esta
 * separacao, um teste de payload so correria com o SDK instalado — e quem escreve
 * o codigo no dia-a-dia nao faz isso.
 *
 * **Uma versao do Kotlin para os dois modulos.** O core nasceu com o 2.2.20 e o
 * Compose exige o plugin do compilador na mesma versao do Kotlin, que hoje e'
 * 2.4.x. Deixar os dois em versoes diferentes dava um `core` compilado com uma
 * e um `app` com outra, e a falha — quando aparecesse — seria um
 * `NoSuchMethodError` em runtime, que e' o pior sitio para uma divergencia de
 * versoes aparecer.
 */
pluginManagement {
    repositories {
        gradlePluginPortal()
        google()

        /*
         * **O `google()` e' obrigatorio para o AGP, e a falha nao diz isso.**
         *
         * Sem ele, o erro e' `Plugin [id: 'com.android.application', version:
         * '9.4.1', apply: false] was not found in any of the following sources`,
         * seguido de uma lista de repositorios que inclui o `mavenCentral()` — e
         * que **nao** inclui o `google()`. A lista de "onde procurou" e' a pista
         * e a mensagem principal nao e'.
         *
         * E este bloco e' diferente do `allprojects` do `build.gradle.kts`: um
         * resolve **plugins**, o outro resolve **dependencias**, e meter o
         * `google()` so num deles da a falha acima com o outro a parecer
         * correcto.
         */
        mavenCentral()
    }
}

dependencyResolutionManagement {
    /*
     * **`repositoriesMode` e' `PREFER_SETTINGS` para o `google()` nao poder
     * faltar.** O `FAIL_ON_PROJECT_REPOS` obrigaria a declarar tudo aqui, o que
     * e' mais limpo, mas quebra qualquer modulo que declare o seu — e o erro
     * volta a ser crptico. O `PREFER_SETTINGS` usa este quando ha declaracao e
     * cala-se quando nao ha.
     */
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "qrcodegenerator"

include(":core")

/*
 * O modulo da app, que vive em `android/` e nao em `app/`.
 *
 * **O `projectDir` aponta para `android/` porque o README e' anterior ao
 * modulo** — a pasta chamava-se `kotlin/android/` e o esplanado do README punha
 * os ficheiros da app dentro dela. Mover a pasta para `app/` seria mais limpo, e
 * a unica razao para nao o fazer e' que o README ja aponta para ca e mudar os
 * dois e' mexer em mais um sítio sem ganho.
 */
include(":app")
project(":app").projectDir = file("android")
