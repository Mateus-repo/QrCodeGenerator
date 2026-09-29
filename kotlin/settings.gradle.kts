/**
 * O raiz do Gradle e' `kotlin/`, e e' o que se abre no Android Studio.
 *
 * A stack Java nao usa Gradle — compila com `javac` por um `build.sh` — e este e'
 * o primeiro projecto do repositorio a usar. Daqui o wrapper e' obrigatorio em
 * vez de confortavel: sem ele, "compila aqui" depende de o Gradle estar instalado
 * na maquina de cada um, e a versao que cada um tem e' diferente.
 *
 * **`:core` e' Kotlin/JVM puro e `:app` e' a aplicacao Android.** A separacao nao
 * e' cosmetica: e' o que permite ao core correr os 34 vectores da spec em
 * segundos, sem o SDK do Android e sem o AGP. E' por isso que a UI pode esperar
 * — o que se verifica primeiro e' o que tem regra, e a regra esta no payload.
 */
rootProject.name = "qrcodegenerator"

include(":core")
