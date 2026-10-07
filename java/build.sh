#!/usr/bin/env bash
# Compila e testa o core e a app. Funciona em Windows, macOS e Linux.
#
# Sem Maven nem Gradle: são dois diretórios de código e um JDK. Um ficheiro de
# build que depende de uma ferramenta de build para não fazer nada é um
# problema de portabilidade, não uma conveniência.
#
#   ./build.sh test       compila e corre os testes
#   ./build.sh compile    só compila
#   ./build.sh run        corre a linha de comandos
#   ./build.sh app        corre a interface gráfica
#   ./build.sh package    gera o instalador nativo (jpackage)
#   ./build.sh run-linear <casos-json>   devolve os módulos de códigos de barras
#                                         em JSON, para o spec/paridade-java.mjs
#   ./build.sh run-datamatrix <casos-json>  o mesmo para o Data Matrix, que e' 2D
#                                         e devolve uma matriz, para o
#                                         spec/paridade-java-datamatrix.mjs
#e devolve tres textos: o `payload`, o `gs1` e a
#legenda. E' um comando a parte porque o
#CodigoDeBarras so tem a legenda.
#spec/paridade-gs1-java.mjs

set -euo pipefail

cd "$(dirname "$0")"

# O separador do classpath é ':' no Unix e ';' no Windows — e o Git Bash no
# Windows conta como Windows, mesmo com Paths do tipo /c/Users.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    SEP=";"
    # O javac é um binário do Windows e não entende /c/Users/...: convertemos
    # os caminhos para a forma mista (C:/Users/...) antes de os passar.
    to_native() { cygpath -m "$1"; }
    ;;
  *)
    SEP=":"
    to_native() { printf '%s' "$1"; }
    ;;
esac

# --- Configuração ----------------------------------------------------------

JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}"
JAVAC="${JAVA_BIN}javac"
JAVA="${JAVA_BIN}java"

command -v "$JAVAC" >/dev/null || JAVAC=javac
command -v "$JAVA" >/dev/null || JAVA=java

CACHE="$HOME/.m2/qrcodegen"
mkdir -p "$CACHE"
CACHE_NATIVE="$(to_native "$CACHE")"

# O SDK do JavaFX não vem no JDK desde o Java 11. Sem isto, compilar a app
# gráfica dá "package javafx.application does not exist".
FX_VERSION="21.0.5"
FX_SDK="$CACHE/javafx-sdk-$FX_VERSION"

download() {
  url="$1"; target="$2"
  if [ -f "$target" ]; then return 0; fi
  echo "  a descarregar $(basename "$target")..."
  curl -fsSL "$url" -o "$target"
}

fetch_jars() {
  base="https://repo1.maven.org/maven2"
  download "$base/com/google/zxing/core/3.5.3/core-3.5.3.jar"          "$CACHE/core-3.5.3.jar"
  download "$base/com/google/zxing/javase/3.5.3/javase-3.5.3.jar"      "$CACHE/javase-3.5.3.jar"
  download "$base/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar"     "$CACHE/gson-2.11.0.jar"
  download "$base/org/junit/platform/junit-platform-console-standalone/1.11.3/junit-platform-console-standalone-1.11.3.jar" \
                                                                 "$CACHE/junit-1.11.3.jar"
}

fetch_javafx() {
  [ -d "$FX_SDK" ] && return 0

  case "$(uname -s)" in
    Darwin) platform="mac" ;;
    Linux)  platform="linux" ;;
    *)      platform="windows" ;;
  esac

  zip="$CACHE/javafx-sdk.zip"
  download "https://download2.gluonhq.com/openjfx/$FX_VERSION/openjfx-${FX_VERSION}_${platform}-x64_bin-sdk.zip" "$zip"
  echo "  a extrair o JavaFX..."
  unzip -q -o "$zip" -d "$CACHE"
}

# --- Classpaths ------------------------------------------------------------

core_cp() {
  echo "$CACHE_NATIVE/core-3.5.3.jar$SEP$CACHE_NATIVE/javase-3.5.3.jar$SEP$CACHE_NATIVE/gson-2.11.0.jar"
}

javafx_cp() {
  find "$FX_SDK/lib" -name '*.jar' 2>/dev/null | while read -r jar; do
    printf '%s%s' "$(to_native "$jar")" "$SEP"
  done
}

# Caminhos absolutos. Um classpath *relativo* passa a ser reinterpretado pelo
# Git Bash e o javac do Windows deixa de encontrar o que está lá — falhava só
# no Windows, e só quando a build era feita pelo script.
ROOT_NATIVE="$(to_native "$PWD")"
CORE_CLASSES="$ROOT_NATIVE/core/build/classes"
CORE_TESTS="$ROOT_NATIVE/core/build/test-classes"
APP_CLASSES="$ROOT_NATIVE/desktop-javafx/build/classes"
TOOLS_CLASSES="$ROOT_NATIVE/tools/build/classes"

# Lista de ficheiros .java num formato que o javac aceite.
source_list() {
  find "$1" -name '*.java' | while read -r file; do
    printf '"%s"\n' "$(to_native "$file")"
  done
}

# --- Passos ----------------------------------------------------------------

compile_core() {
  echo "==> core"
  mkdir -p core/build/classes
  source_list core/src/main/java > core/build/sources.txt
  "$JAVAC" -encoding UTF-8 -Xlint:all -d "$(to_native core/build/classes)" \
    @"core/build/sources.txt"
}

compile_core_tests() {
  echo "==> testes do core"
  mkdir -p core/build/test-classes
  source_list core/src/test/java > core/build/test-sources.txt
  "$JAVAC" -encoding UTF-8 -d "$(to_native core/build/test-classes)" \
    -cp "$CORE_CLASSES$SEP$(core_cp)$SEP$CACHE_NATIVE/junit-1.11.3.jar" \
    @"core/build/test-sources.txt"
}

# **O filtro de nome de classe e' o mesmo para toda a gente, e por omissao so
# reconhece o ingles.** O JUnit descobre `.*Tests?$` — "Test" ou "Tests" — e uma
# classe chamada `SimbologiasTestes` **nao bate**: nao e' descoberta, nao corre, e
# nao diz nada. Nao ha aviso, nao ha falha, o build passa.
#
# A `AGENTS.md` manda que os testes se chamem em portugues, e `Testes` e' a forma
# portuguesa de `Tests`. As duas coisas sao verdade e o JUnit so conhece uma,
# por isso o filtro diz as duas.
test_core() {
  echo "==> testes"
  "$JAVA" -jar "$CACHE_NATIVE/junit-1.11.3.jar" execute \
    -cp "$CORE_CLASSES${SEP}$CORE_TESTS$SEP$(core_cp)" \
    --select-package=com.qrcodegen.core \
    --include-classname='.*(Test|Tests|Teste|Testes)$' \
    --details=summary --disable-ansi-colors
}

compile_app() {
  echo "==> app"
  mkdir -p desktop-javafx/build/classes
  cp -r desktop-javafx/src/main/resources/* desktop-javafx/build/classes/ 2>/dev/null || true
  source_list desktop-javafx/src/main/java > desktop-javafx/build/sources.txt
  "$JAVAC" -encoding UTF-8 -d "$(to_native desktop-javafx/build/classes)" \
    -cp "$CORE_CLASSES$SEP$(core_cp)$SEP$(javafx_cp)" \
    @"desktop-javafx/build/sources.txt"
}

# As ferramentas de verificação. Não são app nem biblioteca: existem para o
# spec/ comparar módulos, e por isso vivem em `tools/` e não dentro do core.
compile_tools() {
  echo "==> ferramentas"
  mkdir -p tools/build/classes
  source_list tools/src/main/java > tools/build/sources.txt
  "$JAVAC" -encoding UTF-8 -d "$(to_native tools/build/classes)" \
    -cp "$CORE_CLASSES$SEP$(core_cp)" \
    @"tools/build/sources.txt"
}

# --- Comandos --------------------------------------------------------------

case "${1:-test}" in
  compile)
    fetch_jars; fetch_javafx
    compile_core; compile_core_tests; compile_app
    ;;

  test)
    fetch_jars
    compile_core; compile_core_tests; test_core
    ;;

  run)
    fetch_jars
    compile_core; compile_app
    shift || true
    exec "$JAVA" -cp "$APP_CLASSES$SEP$CORE_CLASSES$SEP$(core_cp)" \
      com.qrcodegen.app.Cli "$@"
    ;;

  # A ponta de Java da comparação de módulos. Os casos vêm em JSON e a saída
  # é JSON, para o spec/paridade-java.mjs comparar sem interpretar nada pelo
  # caminho.
  #
  # **Compila o core e as ferramentas, e nada mais.** Não precisa do JavaFX nem
  # da app, e trazer o JavaFX para uma comparação de módulos custaria um
  # download de 200 MB a cada vez que a spec muda.
  run-linear)
    fetch_jars
    # O progresso da compilação vai para stderr, para o stdout ficar só com o
    # JSON. Sem isto, o `==>` do core entra no meio da resposta e o
    # spec/paridade-java.mjs recebe um array pela metade — que é a falha mais
    # confusa de diagnosticar que há, porque o erro aparece em Node e a causa
    # está num `echo` do build.
    { compile_core; compile_tools; } >&2
    shift || true
    exec "$JAVA" -cp "$TOOLS_CLASSES$SEP$CORE_CLASSES$SEP$(core_cp)" \
      com.qrcodegen.tools.ParidadeLineares "$@"
    ;;

  # A ponta de Java da comparação de um codigo **2D**. E' um comando a parte e
  # nao mais um tipo no `run-linear`, porque um Data Matrix devolve uma matriz
  # e nao uma lista de modulos: ver a nota do `ParidadeDataMatrix` para o que
  # acontece quando se tenta encaixar os dois no mesmo formato.
  run-datamatrix)
    fetch_jars
    { compile_core; compile_tools; } >&2
    shift || true
    exec "$JAVA" -cp "$TOOLS_CLASSES$SEP$CORE_CLASSES$SEP$(core_cp)" \
      com.qrcodegen.tools.ParidadeDataMatrix "$@"
    ;;

    # A ponta de Java da comparacao do **GS1-128**. E' um comando a parte e nao
    # mais um `case` no `run-linear`, porque o GS1-128 devolve **tres textos** —
    # `payload`, `gs1` e `legenda` — e o `CodigoDeBarras` so tem `legenda`.
    # Encaixa-lo obrigava a perder dois dos tres, e a perder era um `KeyError` no
    # script de paridade que so aparecia em Java.
    run-gs1)
      fetch_jars
      { compile_core; compile_tools; } >&2
      shift || true
      exec "$JAVA" -cp "$TOOLS_CLASSES$SEP$CORE_CLASSES$SEP$(core_cp)" \
        com.qrcodegen.tools.ParidadeGs1 "$@"
      ;;

  app)
    fetch_jars; fetch_javafx
    compile_core; compile_app
    exec "$JAVA" --add-modules javafx.controls \
      -cp "$APP_CLASSES$SEP$CORE_CLASSES$SEP$(core_cp)$SEP$(javafx_cp)" \
      com.qrcodegen.app.App
    ;;

  package)
    fetch_jars; fetch_javafx
    compile_core; compile_app

    # jpackage quer um jar, não uma pasta de classes. Empacotamos a app e
    # metemos o core no mesmo --input.
    echo "==> jar"
    mkdir -p desktop-javafx/build/package
    cp -r core/build/classes/com desktop-javafx/build/package/
    (cd desktop-javafx/build/package && "${JAVA_BIN}jar" --create --file ../app.jar .)

    # jpackage gera um instalador nativo a partir do mesmo código:
    #   --win  -> .msi e .exe      --mac -> .dmg e .pkg      --linux -> .deb
    # Requer ferramentas do sistema: wiX no Windows, Xcode CLT no macOS,
    # fakeroot e dpkg-deb no Linux.
    platform_flag=""
    case "$(uname -s)" in
      Darwin) platform_flag="--mac" ;;
      Linux)  platform_flag="--linux --deb" ;;
      *)      platform_flag="--win" ;;
    esac

    exec "${JAVA_BIN}jpackage" \
      --name "GeradorQR" \
      --app-version 1.0.0 \
      --vendor "QrCodeGenerator" \
      --description "Gerador de QR codes" \
      --input desktop-javafx/build/package \
      --main-jar app.jar \
      --class-path "$(core_cp)" \
      --module-path "$(javafx_cp)" \
      --java-options "--add-modules javafx.controls,javafx.fxml" \
      --dest desktop-javafx/dist \
      $platform_flag
    ;;

  *)
    echo "uso: $0 {compile|test|run|app|package|run-linear}" >&2
    exit 1
    ;;
esac
