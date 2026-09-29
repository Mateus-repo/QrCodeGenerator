/**
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
 *
 * **A versao do Gradle esta fixada** em `gradle/wrapper/gradle-wrapper.properties`
 * e nao `latest`: uma stack que compila na maquina de uma pessoa e nao na de
 * outra nao e' uma stack. Quem clona precisa de um JDK e de nada mais.
 */
plugins {
    kotlin("jvm") version "2.4.20" apply false
    kotlin("plugin.compose") version "2.4.20" apply false
    id("com.android.application") version "9.4.1" apply false
}

allprojects {
    repositories {
        mavenCentral()
        // O Google, para o AGP e para o AndroidX. **O `mavenCentral()` sozinho
        // nao chega** e a falha e' um `Plugin [id: 'com.android.application']
        // was not found`, que fala do plugin e nao do repositorio.
        google()
    }
}
