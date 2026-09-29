/**
 * A app Android.
 *
 * ## O que esta app e' e o que ela ainda nao e'
 *
 * E' a **fase zero**: mostra os onze tipos, escolhe um, mostra o payload e o QR.
 * Nao le a camera ainda, e o `Scanner.kt` do `README.md` continua por fazer.
 *
 * **A fase zero nao e' um recorte por preguiça — e' a ordem que o repositorio
 * obriga.** A `AGENTS.md` diz que a regra do QR se verifica pelo payload, e o
 * payload ja esta verificado nos 34 vectores. O que falta verificar e' a imagem,
 * e isso e' o nivel 2, que precisa do **encoder no `:core`** — e o encoder ainda
 * nao existe. Meter uma camera em cima de um encoder por escrever seria
 * alinhar duas coisas que nenhuma esta verificada.
 *
 * ## As dependencias, e porque sao poucas
 *
 * Compose para a interface, ZXing para a imagem, e o `:core` para o payload.
 * **O `:core` e' um `project(":core")` e nao um artifact publicado**, que e' o que
 * garante que a app e' a mesma biblioteca que os 34 vectores verificaram. Uma
 * copia do payload dentro do modulo Android dava uma app que funciona e uma
 * biblioteca que divergiu sem ninguem dar conta — que e' exactamente o modo de
 * falha que a `AGENTS.md` descreve do GS1-128.
 */
plugins {
    /*
     * **O `kotlin("android")` nao esta aqui, e a ausencia e' o AGP 9.**
     *
     * Ate ao AGP 8 era preciso declarar `org.jetbrains.kotlin.android` para o
     * modulo falar Kotlin. **Desde o AGP 9.0 o suporte vem integrado**, e
     *declara-lo e' um erro:
     *
     *     The 'org.jetbrains.kotlin.android' plugin is no longer required for
     *     Kotlin support since AGP 9.0.
     *
     * O que se ve aqui e' a razao de a ferramenta divergir de cada linguagem:
     * uma linha que o AGP passou a rejeitar, e que num projecto antigo
     * continuaria a passar sem dar conta.
     */
    id("com.android.application")

    /*
     * **O do Compose fica, e nao por ser o Kotlin.** Este e' o compilador do
     * Compose, que e' separado do compilador Kotlin e tem de casar com a versao
     * dele. Sem este plugin o `build.gradle.kts` compila e o `@Composable` nao
     * e' nada.
     */
    kotlin("plugin.compose")
}

android {
    namespace = "com.qrcodegen.app"

    /*
     * **`android-36` e nao `android-37.0`.** A pasta do SDK chama-se
     * `android-37.0` e nao `android-37`, que e' a assinatura de uma plataforma
     * em previa. Uma app que compila contra uma previa obriga quem a constroi a
     * ter a mesma previa, e o ganho nao paga isso.
     */
    compileSdk = 36

    defaultConfig {
        applicationId = "com.qrcodegen.app"

        /*
         * **O minSdk e' 26 e nao 21, e a razao e' o `EccLevel`.** O codigo de
         * corre em qualquer lado, mas `java.time` — que o `QrFields` usa para a
         * data do evento — so existe como API no Android a partir do 26. A
         * alternativa e' a biblioteca de desugaring, que acrescenta uma
         * dependencia e um plugin de build por causa de um `LocalDateTime`.
         */
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false

            /*
             * **Sem assinatura de release, e e' de proposito.** A decisao em
             * BLOQUEIO 4 — conta de Play Store ou APK sideload — esta por
             * responder, e as duas mudam isto: um sideload aceita um keystore de
             * debug e uma conta de loja exige um upload key, um de distribution,
             * e uma assinatura que nunca muda. **Um keystore no repositorio
             * seria o pior sitio para uma chave que nao se pode trocar** — e o
             * `.gitignore` ja ignora `*.keystore` por isso.
             */
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlin {
        jvmToolchain(21)
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":core"))

    implementation(platform("androidx.compose:compose-bom:2025.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.10.1")

    /*
     * O ZXing, que e' o mesmo artifact que a stack Java e a stack Kotlin usam
     * para ler. **Aqui e' para gerar** — `QRCodeWriter` — e no nivel 2 e' para
     * ler de volta. Um encoder so esta verificado se um leitor que nao foi
     * escrito pela mesma mao o le, e o ZXing e' esse leitor nas duas direccoes.
     */
    implementation("com.google.zxing:core:3.5.3")
}
