package com.qrcodegen.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.qrcodegen.app.ui.CasaActivity

/**
 * A unica Activity, e so uma.
 *
 * **O `QrFields` do `:core` e' construido aqui, e nao nos composables.** Um
 * `remember { QrFields() }` dentro de um `when` que muda de categoria recria o
 * objecto a cada troca de ecra e perde o que a pessoa escreveu. E o
 * `QrFields` e' do `:core`, a mesma classe que os 34 vectores da spec
 * verificaram — e nao uma copia, que e' o modo de falha que a `AGENTS.md`
 * descreve do GS1-128: um registo que funciona e nao aparece no selector.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                Surface {
                    CasaActivity()
                }
            }
        }
    }
}
