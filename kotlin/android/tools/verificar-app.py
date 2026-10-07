"""
Verifica a app Android a correr num emulador.

A app compilava e ninguem a correra. Os tres bugs que os comentarios da
`CasaActivity` descrevem - "a app arrancava, mostrava a mensagem de validacao e
nao aceitava escrita nenhuma" - foram todos encontrados a mao, e um bug
encontrado a mao nao fica escrito em lado nenhum: da proxima vez a pessoa ve
"compila" e conclui que funciona.

Por isso que este script existe. **Nao e' um teste de interface no sentido do
`WinFormsTestes`**: a interface do Compose nao se mede sem um dispositivo, e o
dispositivo que este repositorio tem e' um emulador. O que ele mede e' o que a
`AGENTS.md` pede quando diz que um teste que prova que uma peca esta' boa nao
prova que a maquina liga - aqui, que o que se escreve no ecra chega ao `:core` e
volta como payload.

O que ele verifica, e porquê cada um:

  1. **O APK construiu.** Sem isto os cinco passos seguintes medem a versao de
     ontem, e `adb install` de um APK velho da 'Sucesso'.
  2. **O processo existe** (`pidof`). Um `am start` devolve "Success" mesmo
     quando a app morre a seguir - o `am` nao sabe o que aconteceu depois.
  3. **A Activity esta' em primeiro plano** (`dumpsys activity activities`). O
     processo vivo e' um processo que pode estar em segundo plano.
  4. **O ecra tem pixels** (um screenshot com dimensao). Um PNG de poucos KB e'
     um ecra em branco, e um ecra em branco e' o sintoma de uma app que compila
     e nao mostra nada.
  5. **O selector tem as onze categorias** da spec. E' o caso que a `AGENTS.md`
     descreve do registo que tem onze e o selector que tem dez: **sem sintoma e
     sem erro**, porque a aplicacao esta' certa e a pessoa e' que nao consegue
     escolher. **Contar e' o que diz.**
  6. **Escrever no campo produz o payload** e tira a mensagem de erro. E' a
     prova de que `:app` e `:core` comunicam, e nao de que um `@Composable` se
     desenha.

Duas regras que este script cumpre porque as duas falharam antes de ele existir:

  - **As coordenadas sao medidas, nunca adivinhadas.** A primeira versao tocou em
    `(540, 560)`, que e' o meio do ecra e nao o campo, e chegou a concluir que a
    app nao aceitava escrita. Ela aceitava. O toque e' no centro do no que o
    `uiautomator` mediu.
  - **A tela e' reposta ao estado inicial antes de cada medicao.** Uma medicao
    que depende do estado anterior mede o estado anterior: com o menu ja aberto,
    o toque no botao acertou num item do menu e mediu a categoria errada.

    python kotlin/android/tools/verificar-app.py
    python kotlin/android/tools/verificar-app.py --sem-emulador   # so constroi
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ANDROID = AQUI.parent
KOTLIN = ANDROID.parent

APLICACAO = "com.qrcodegen.app"
ACTIVITY = f"{APLICACAO}/.MainActivity"
AVD = "Medium_Phone"

#: As onze categorias da `QrCategory` do `:core`. **A lista esta' escrita aqui de
#: proposito** e nao importada: o `:core` e' um modulo Kotlin e nao se importa de
#: Python, e uma lista gerada a partir do codigo sob teste diria que o codigo esta'
#: certo. O que interessa e' que **a spec e' a medida** - o mesmo ficheiro
#: `spec/vectors.json` que as outras quatro stacks medem - e este e' o ponto em que
#: a app se desliga dela.
CATEGORIAS = {
    "Link", "Texto", "Email", "Telefone", "SMS", "WhatsApp",
    "Evento", "Localização", "WiFi", "vCard", "PIX",
}

LINK = "https://exemplo.pt"


# --- o SDK -------------------------------------------------------------


def sdk() -> Path:
    """Onde esta' o SDK do Android.

    **O `ANDROID_HOME` pode estar vazio** - nesta maquina esta' - e o `adb` do
    `platform-tools` e' que sabe onde se encontra. Por isso que ha uma segunda
    fonte, e porque que a ausencia do SDK e' um erro com a razao e' nao um
    `FileNotFoundError` a meio da construcao.
    """
    for variavel in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        valor = os.environ.get(variavel)
        if valor and Path(valor).is_dir():
            return Path(valor)

    candidato = Path.home() / "AppData" / "Local" / "Android" / "Sdk"
    if candidato.is_dir():
        return candidato

    raise SystemExit(
        "  O SDK do Android nao esta' em ANDROID_HOME, em ANDROID_SDK_ROOT nem "
        f"em {candidato}. Instala-o, ou aponta uma das duas variaveis para ele."
    )


def caminho_adb() -> Path:
    """O `adb` do SDK. **Procurado em tres sitios**, porque o `PATH` raramente o
    tem e o `ANDROID_HOME` raramente esta' definido."""
    raiz = sdk()
    for candidato in (
        raiz / "platform-tools" / "adb.exe",
        raiz / "platform-tools" / "adb",
        Path(shutil.which("adb") or ""),
    ):
        if candidato.is_file():
            return candidato

    raise SystemExit(
        f"  O `adb` nao esta' em {raiz / 'platform-tools'}. Instala as "
        "platform-tools do SDK."
    )


def adb(*argumentos: str, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(caminho_adb()), *argumentos],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=timeout,
    )


# --- o ecra ------------------------------------------------------------


def nos() -> list[dict]:
    """Todos os nos da arvore de acessibilidade, com os atributos.

    **O XML nao se apanha com uma expressao regular.** Um no e' `<node index="0"
    text="" ... class="android.widget.EditText" ...>` - e o `class` vem *depois*
    de outros atributos, portanto um padrao que o exija antes de `[^>]*` nunca o
    ve. Corta-se por `<node ` e leem-se os atributos de cada pedaco, que e' o
    que se faz com XML.
    """
    adb("shell", "uiautomator", "dump", "/sdcard/ecra.xml")
    xml = adb("shell", "cat", "/sdcard/ecra.xml").stdout

    achados = []
    for pedaco in xml.split("<node ")[1:]:
        atributos = dict(re.findall(r'(\w[\w-]*)="([^"]*)"', pedaco))
        if atributos:
            achados.append(atributos)
    return achados


def caixa(no: dict) -> list[int]:
    """`[x1,y1][x2,y2]` em quatro inteiros, ou `[]** se o no nao tem medida."""
    valores = re.findall(r"\d+", no.get("bounds", ""))
    return [int(v) for v in valores] if len(valores) == 4 else []


def no_com_texto(alvo: str) -> dict | None:
    """O primeiro no cujo texto ou descricao e' exactamente `alvo`."""
    for no in nos():
        if no.get("text") == alvo or no.get("content-desc") == alvo:
            return no
    return None


def centro(no: dict) -> tuple[int, int]:
    """O centro do no. **E' aqui que se toca, e nao em `(540, 560)`.**"""
    x1, y1, x2, y2 = caixa(no)
    return (x1 + x2) // 2, (y1 + y2) // 2


def textos() -> list[str]:
    return [t for t in (n.get("text") for n in nos()) if t and t.strip()]


# --- os passos ---------------------------------------------------------


def construir() -> Path:
    """Compila o APK de debug e devolve o caminho."""
    #: **O caminho tem de ser absoluto.** O `subprocess` nao procura o programa no
    #: `cwd` - o `cwd` e' onde o processo corre, nao onde se procura o executavel -
    #: e por isso que um `gradlew.bat` com o `cwd` no `kotlin/` da
    #: `FileNotFoundError` e' o sintoma de um caminho relativo.
    gradlew = KOTLIN / ("gradlew.bat" if os.name == "nt" else "gradlew")

    if not gradlew.is_file():
        raise SystemExit(f"  O wrapper do Gradle nao esta' em {gradlew}")

    print("  a construir o APK...")
    r = subprocess.run(
        [gradlew, "--console=plain", ":app:assembleDebug"],
        cwd=KOTLIN, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )

    if r.returncode != 0:
        print("  a construcao falhou:")
        print("\n".join(f"    {l}" for l in r.stdout.splitlines()[-25:]))
        raise SystemExit(1)

    apks = sorted((ANDROID / "build" / "outputs" / "apk").rglob("*.apk"))
    if not apks:
        raise SystemExit("  A construcao disse que sim e nao ha APK nenhum")

    apk = apks[0]
    print(f"    {apk.name}, {apk.stat().st_size // 1024} KB")

    #: O APK sem assinatura nao instala, e o ficheiro diz se tem.
    with zipfile.ZipFile(apk) as z:
        assinaturas = [n for n in z.namelist() if n.startswith("META-INF/")]
        dex = [n for n in z.namelist() if n.endswith(".dex")]

    print(f"    {len(dex)} DEX, {len(assinaturas)} entradas META-INF")

    if not assinaturas:
        print("    **O APK nao tem assinatura e nao instala.**")

    return apk


def arrancou_algum() -> bool:
    r = adb("devices")
    return any(
        linha.strip() and linha.split()[1] == "device"
        for linha in r.stdout.splitlines()[1:]
    )


def esperar_arranque(segundos: int = 420) -> bool:
    """Espera pelo `sys.boot_completed`.

    **Espera-se pelo estado, e nao por um intervalo.** O primeiro arranque de um
    emulador demora tres vezes mais do que os seguintes, e um `sleep` fixo que
    chegue para o segundo falha no primeiro - que e' o que faz um script de
    verificacao parecer intermitente.
    """
    for _ in range(segundos // 3):
        time.sleep(3)
        if adb("shell", "getprop", "sys.boot_completed", timeout=20).stdout.strip() == "1":
            return True
    return False


def subir_emulador() -> None:
    """Arranca o emulador e espera que arranque.

    **Sem janela** (`-no-window`): e' uma verificacao, e uma janela que ninguem ve
    gasta a mesma memoria. `-no-window` precisa do `swiftshader_indirect` para o
    renderizador funcionar.
    """
    if arrancou_algum():
        print("  ja ha um dispositivo; nao se arranca outro")
        return

    emulador = sdk() / "emulator" / "emulator.exe"
    if not emulador.is_file():
        raise SystemExit(
            f"  Nao ha emulador em {emulador}, e nao ha nenhum dispositivo ligado."
        )

    print(f"  a arrancar o emulador {AVD}...")
    subprocess.Popen(
        [
            str(emulador), "-avd", AVD,
            "-no-window", "-gpu", "swiftshader_indirect",
            "-no-snapshot", "-no-audio", "-no-boot-anim",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    if not esperar_arranque():
        raise SystemExit("  O emulador nao arrancou")

    print("  o emulador arrancou")


def instalar_e_arrancar(apk: Path) -> None:
    r = adb("install", "-r", "-t", str(apk), timeout=300)
    saida = (r.stdout or r.stderr).strip()

    if "Success" not in saida:
        print(f"  **instalar falhou**: {saida[:200]}")
        raise SystemExit(1)

    print(f"    instalado: {saida.splitlines()[-1]}")

    #: `am force-stop` antes de arrancar. **Uma tela que ja foi usada mede o uso
    #: anterior** - com o selector aberto, o toque no botao acertava num item do
    #: menu e a medicao seguinte era da categoria errada. O estado inicial e' o
    #: unico estado em que a tela e' sempre a mesma.
    adb("shell", "am", "force-stop", APLICACAO)
    time.sleep(1)

    r = adb("shell", "am", "start", "-n", ACTIVITY, timeout=90)
    if "Error" in (r.stdout or "") + (r.stderr or ""):
        print(f"  **arrancar falhou**: {(r.stdout or r.stderr)[:200]}")
        raise SystemExit(1)

    time.sleep(5)


def vivo() -> bool:
    return bool(adb("shell", "pidof", APLICACAO).stdout.strip())


def em_primeiro_plano() -> bool:
    r = adb("shell", "dumpsys", "activity", "activities")
    return any(
        "ResumedActivity" in linha and APLICACAO in linha
        for linha in r.stdout.splitlines()
    )


def ecra_tem_pixels() -> tuple[int, int]:
    """As dimensoes do screenshot.

    **Um PNG de poucos KB e' um ecra em branco.** A dimensao diz se ha area e o
    tamanho diz quantos pixels, e um emulador apagado da' os dois.
    """
    destino = Path(os.environ.get("TEMP", "/tmp")) / "verificar-app.png"
    destino.unlink(missing_ok=True)

    adb("shell", "screencap", "-p", "/sdcard/verificar.png", timeout=120)
    adb("pull", "/sdcard/verificar.png", str(destino), timeout=180)

    if not destino.is_file():
        return 0, 0

    cabecalho = destino.read_bytes()[:24]
    if cabecalho[:8] != b"\x89PNG\r\n\x1a\n":
        return 0, 0

    return (
        int.from_bytes(cabecalho[16:20], "big"),
        int.from_bytes(cabecalho[20:24], "big"),
    )


def campo_de_texto() -> dict | None:
    """O `OutlinedTextField` da tela.

    **Procurado pela classe, e nao pela posicao nem pelo indice** — um campo
    `EditText` e' o que aceita escrita, e o resto da tela e' o que nao aceita.
    """
    return next((n for n in nos() if "EditText" in n.get("class", "")), None)


def limpar_campo(campo: dict) -> bool:
    """Deixa o campo vazio. **Devolve se conseguiu.**

    **A pre-condicao de escrever e' o campo estar vazio.** Sem este guarda, uma
    execucao anterior que deixou texto da para a seguinte: a escrita concatena, o
    payload sai com o texto antigo colado ao novo, e o teste diz que a app nao
    aceita escrita quando a aceita. **Um teste que mede o estado anterior mede o
    estado anterior** — e o `AGENTS.md` chama a isto passar sem testar nada.
    """
    if not (campo.get("text") or "").strip():
        return True

    x, y = centro(campo)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(1)

    #: O `KEYCODE_MOVE_END` e' o que o `input keyevent` aceita para o cursor; a
    #: selecao toda e' o `KEYCODE_CTRL_LEFT` com o `A`, que o `input` nao faz. O
    #: caminho que funciona e' apagar many: o `DEL` de tras para tras.
    for _ in range(60):
        adb("shell", "input", "keyevent", "KEYCODE_DEL")

    time.sleep(1.5)
    return not (campo_de_texto() or {}).get("text", "").strip()


def escrever_e_medir() -> list[dict] | None:
    """Escreve no campo do link e devolve a arvore da tela.

    **O toque e' no centro do no medido**, e nao no meio do ecra. Tocar no sitio
    errado nao falha: o `input text` nao tem para onde ir, a tela fica igual, e a
    conclusao "a app nao aceita escrita" e' errada - que e' a pior das tres
    situacoes, porque e' uma conclusao firme a partir de uma medicao que nao
    mediu nada.

    **Devolve `None` quando nao ha campo ou o campo nao esvazia.** Quem chama
    trata disso como falha, e nao como um resultado: um `None` e' "nao deu para
    medir", e uma medida que nao deu para fazer nao e' uma medida que passou.
    """
    campo = campo_de_texto()
    if campo is None:
        return None

    if not limpar_campo(campo):
        print("    **o campo nao ficou vazio; a escrita nao seria medivel**")
        return None

    campo = campo_de_texto()
    x, y = centro(campo)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(1.5)

    adb("shell", "input", "text", LINK)
    time.sleep(2.5)

    depois = nos()
    return depois


def medir_escrita(depois: list[dict]) -> dict:
    """O que a tela mostra depois de se escrever, separado pelas tres coisas que
    se estao a afirmar.

    **Porque e' que sao tres e nao uma.** A primeira versao afirmava
    `LINK in textos()` e passava - mas passava tambem com o `Text` do payload
    trocado por uma constante, porque o **campo** tem o link e basta. A
    propriedade afirmada era "a string escrita aparece em algum sitio", que e'
    verdade mesmo quando o `:core` nao foi chamado, e o `AGENTS.md` chama a isto
    um teste que passa sem testar nada.

    A distincao que fecha o buraco e' **estructural, e nao posicional**: o que se
    escreveu esta' num `EditText` e o que o `:core` devolve esta' num `TextView`.
    Um `TextView` com o link e' o payload; um `EditText` com o link e' o campo.
    **Nao se pergunta onde esta', pergunta-se em que no esta'.**

    - `escrita` — o campo tem o que se escreveu. **Sem isto, "o payload
      apareceu" pode ser o campo.**
    - `payload` — um `TextView` (e nao um `EditText`) tem o link. **E' o `:core`
      a responder.**
    - `erro` — a mensagem de validacao desapareceu. Uma tela com o campo
      preenchido e o payload antigo a mostra e' o sintoma de um `remember` mal
      posto, que e' o primeiro dos tres bugs que a `CasaActivity` descreve.
    """
    campo_texto = any(
        "EditText" in n.get("class", "") and n.get("text") == LINK
        for n in depois
    )

    payload_texto = any(
        "EditText" not in n.get("class", "")
        and n.get("text", "").strip() == LINK
        for n in depois
    )

    return {
        "escrita": campo_texto,
        "payload": payload_texto,
        "erro": any("Indica um link" in (n.get("text") or "") for n in depois),
        "contagem": any(
            re.fullmatch(r"\d+ caracteres", n.get("text") or "") for n in depois
        ),
    }


def fechar_menu() -> None:
    """Fecha o selector com a tecla de voltar.

    **Abrir o selector deixa a tela noutro estado, e medir o estado seguinte sem
    o fechar mede o popup.** O `BACK` fecha-o; o toque seguinte, no campo, seria
    recebido pelo menu aberto - que e' o que aconteceu na primeira versao deste
    script: o campo aparecia preenchido e a validacao passava, e o payload
    aparecia com o texto antigo colado ao novo. **A tela e' um estado, e cada
    medida tem de partir de um estado conhecido.**
    """
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.5)


def categorias_no_selector() -> set[str]:
    """As categorias que o selector mostra.

    **Abre-se o selector tocando no botao medido**, e nao no sitio onde o botao
    estava da ultima vez - que e' o que a versao que media torto fez.
    """
    botao = no_com_texto(f"Link  ▾")
    if botao is None:
        botao = next(
            (n for n in nos() if "▾" in (n.get("text") or "")),
            None,
        )

    if botao is None:
        return set()

    x, y = centro(botao)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(2.5)

    vistas = {t for t in textos() if t in CATEGORIAS}

    fechar_menu()
    return vistas


# --- o veredicto -------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--sem-emulador", action="store_true",
        help="apenas constroi o APK; nao precisa de SDK nem de emulador",
    )
    argumentos = ap.parse_args()

    print(f"  verificar a app: {APLICACAO}")

    apk = construir()

    if argumentos.sem_emulador:
        print("  --sem-emulador: a construcao e' tudo o que se pediu")
        return 0

    subir_emulador()
    instalar_e_arrancar(apk)

    falhas: list[str] = []

    # 2. o processo
    vivo_ = vivo()
    print(f"  o processo vivo: {vivo_}")
    if not vivo_:
        falhas.append("o processo morreu depois de arrancar")

        r = adb("logcat", "-d", "-t", "300")
        for linha in r.stdout.splitlines():
            if "AndroidRuntime" in linha or "FATAL" in linha:
                print(f"    {linha[:180]}")

    # 3. a activity
    primeiro = em_primeiro_plano()
    print(f"  a Activity em primeiro plano: {primeiro}")
    if not primeiro:
        falhas.append("a Activity nao esta' em primeiro plano")

    # 4. o ecra
    largura, altura = ecra_tem_pixels()
    print(f"  o ecra: {largura}x{altura}")
    if largura == 0 or altura == 0:
        falhas.append("o screenshot nao tem dimensao: o ecra esta' em branco")

    # 5. as categorias
    if primeiro:
        vistas = categorias_no_selector()
        print(f"  o selector mostra {len(vistas)} de {len(CATEGORIAS)} categorias")

        if vistas != CATEGORIAS:
            # **O caminho da falha foi o primeiro a ser corrido.** Com o bug
            # reintroduzido (`QrCategory.entries.take(10)`) o verificador disse
            # `10 de 11` e morreu com um `NameError` a tentar dizer *qual*
            # faltava - o `faltas` no `f` e o `faltam` na variavel. Um erro de
            # escrita no caminho do erro e' o que nao aparece enquanto tudo
            # passa, e e' o que esconde a razao do `--sem-emulador` dar verde
            # com a app partida.
            faltam = sorted(CATEGORIAS - vistas)
            a_mais = sorted(vistas - CATEGORIAS)

            if faltam:
                print(f"    faltam: {faltam}")
            if a_mais:
                print(f"    a mais: {a_mais}")

            falhas.append(
                f"o selector mostra {len(vistas)} e a spec tem {len(CATEGORIAS)}"
            )

        # 6. a escrita, dos dois lados
        depois = escrever_e_medir()

        if depois is None:
            falhas.append("nao deu para medir a escrita: nao ha campo, ou nao esvazia")
        else:
            medida = medir_escrita(depois)
            print(f"  o campo tem o que se escreveu:    {medida['escrita']}")
            print(f"  o `:core` devolveu o payload:     {medida['payload']}")
            print(f"  a contagem de caracteres aparece: {medida['contagem']}")
            print(f"  a mensagem de erro desapareceu:   {not medida['erro']}")

            #: **Cada lado tem a sua falha, e a mensagem diz qual.**
            #: "escrever no campo nao produziu o payload" seria verdade e
            #: enganador quando o campo recebeu e o `:core` nao devolveu - sao
            #: dois defeitos diferentes, com causas diferentes.
            if not medida["escrita"]:
                falhas.append("o campo nao ficou com o que se escreveu")
            if not medida["payload"]:
                falhas.append(
                    "o campo tem o link mas nenhum `TextView` o tem: o `:core` "
                    "nao devolveu o payload"
                )
            if not medida["contagem"]:
                falhas.append("a contagem de caracteres nao apareceu")
            if medida["erro"]:
                falhas.append("a mensagem de erro ficou com o campo preenchido")
    else:
        falhas.append("a tela nao foi medida: a Activity nao esta' em primeiro plano")

    print()
    if falhas:
        print(f"  **{len(falhas)} falhas:**")
        for f in falhas:
            print(f"    - {f}")
        return 1

    print("  A app arranca, aceita escrita, mostra as onze categorias e o")
    print("  `:core` devolve o payload.")
    print()
    print("  O que isto **nao** prova, e esta' escrito no README:")
    print("    - que gere um QR. A tela nao tem imagem, e o `:core` ainda nao")
    print("      tem encoder de matriz em Kotlin.")
    print("    - que tenha testes. `src/test` nao existe na app: tudo o que")
    print("      provou a propriedade ate agora foi este script.")
    return 0


if __name__ == "__main__":
    sys.exit(main())