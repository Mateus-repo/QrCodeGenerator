/**
 * O Gradle wrapper e' o que faz este projecto compilar sem Gradle instalado.
 *
 * **A versao esta fixada, e nao `latest`.** A razao e' a mesma de qualquer outra
 * dependencia: uma stack que compila na maquina de uma pessoa e nao na de outra
 * nao e' uma stack, e' um misterio. Quem clona precisa de um JDK e de nada mais.
 *
 * **O toolchain esta fixado em Java 21**, e nao ha razao para o deixar solto. O
 * Android Studio corre o Gradle com o JBR dele — que aqui e' o Java 25 — e o
 * `gradlew` da linha de comandos usa o JDK do sistema, que e' o 21. Sem a
 * fixacao compila numa e falha na outra, e a mensagem de erro e' sempre a de uma
 * dependencia que desceu de versao, que e' a pior forma de uma falha aparecer.
 */
plugins {
    kotlin("jvm") version "2.2.20" apply false
}

allprojects {
    repositories {
        mavenCentral()
    }
}
