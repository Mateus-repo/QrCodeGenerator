<#
.SYNOPSIS
    Verificacao antes de um commit automatico.

.DESCRIPTION
    Mostra, num so sitio: o que mudou, o que nao deve entrar, se ha sinais de
    segredo, e que stacks do repositorio foram tocadas (para saber que testes
    correr).

    Nao altera nada. Nao faz commit. So le.

.EXAMPLE
    pwsh -File .opencode/skills/auto-commit/scripts/preflight.ps1

.EXAMPLE
    pwsh -File .opencode/skills/auto-commit/scripts/preflight.ps1 -Staged
#>
[CmdletBinding()]
param(
    # Quando true, so olha para o que ja esta no indice, em vez da arvore toda.
    [switch]$Staged
)

$ErrorActionPreference = 'Stop'

# A consola do Windows assume CP850 e mastiga os acentos. Sem isto, "ultimo"
# aparece "�ltimo" e o script fica inutilavel em Windows.
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # Em ambientes sem consola (CI, redirect) nao ha o que configurar.
}

# Join-Path aceita so dois argumentos no Windows PowerShell 5.1, por isso
# sobe um directorio de cada vez. (No PowerShell 7 dava para passar os quatro
# de uma vez, mas esta skill corre no que estiver instalado.)
$raiz = $PSScriptRoot
foreach ($nivel in 1..4) { $raiz = Join-Path $raiz '..' }
$raiz = (Resolve-Path $raiz).Path
Set-Location $raiz

function Titulo([string]$t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# 1. Estado
# ---------------------------------------------------------------------------

Titulo 'Estado'

$ramo = git rev-parse --abbrev-ref HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Nao e um repositorio git.' -ForegroundColor Red
    exit 1
}

$ultimo = git log -1 --oneline 2>$null
Write-Host "ramo:   $ramo"
Write-Host "último: $ultimo"

if ($Staged) {
    $ficheiros = @(git diff --cached --name-only)
} else {
    # -uall desdobra as pastas nao rastreadas em ficheiros. Sem isto, uma pasta
    # nova aparece como uma linha so e a analise de segredos nao a abre.
    $alterados = @(git status --porcelain -uall | ForEach-Object { $_.Substring(3) })
    $ficheiros = @($alterados | Where-Object { $_ } | Sort-Object -Unique)
}

if ($ficheiros.Count -eq 0) {
    Write-Host 'Nada para commitar. A arvore esta limpa.' -ForegroundColor Green
    exit 0
}

Write-Host ''
Write-Host "ficheiros ($($ficheiros.Count)):"
$ficheiros | ForEach-Object { Write-Host "  $_" }

# ---------------------------------------------------------------------------
# 2. Stacks tocadas -> que testes correr
# ---------------------------------------------------------------------------

Titulo 'Stacks tocadas'

# Ordem importa: 'web/' e' docs/ vem antes de regras mais genericas.
$stacks = [ordered]@{
    'csharp' = 'cd csharp && dotnet test'
    'java'   = 'cd java && ./build.sh test'
    'python' = 'cd python && python -m pytest tests -q'
    'web'    = 'node --test "web/tests/*.test.mjs"'
    'spec'   = 'python spec/gerar-vectors.py  (se mexer na spec, regerar)'
}

$tocadas = New-Object System.Collections.Generic.List[string]
foreach ($stack in $stacks.Keys) {
    $prefixo = "$stack/"
    $pertence = $ficheiros | Where-Object { $_.StartsWith($prefixo) -or $_.StartsWith("../$prefixo") }
    if ($pertence) {
        $tocadas.Add($stack)
        $contagem = @($pertence).Count
        Write-Host "  $stack ($contagem ficheiro(s))" -ForegroundColor Yellow
    }
}

if ($tocadas.Count -eq 0) {
    Write-Host '  Nenhuma. Mudou-se so documentacao ou ficheiros na raiz.'
    Write-Host '  Se a SPEC nao mudou, nao ha testes a correr.'
} else {
    Write-Host ''
    Write-Host 'Correr antes de commitar:' -ForegroundColor Yellow
    foreach ($stack in $tocadas) { Write-Host "  $($stacks[$stack])" }
}

# ---------------------------------------------------------------------------
# 3. Segredos
# ---------------------------------------------------------------------------
#
# Nao e uma analise de segredos a serio. E uma rede de seguranca barata que
# apanha a classe de erro mais comum: uma chave de API colada num ficheiro que
# ia ser committado. Falsos positivos sao aceitaveis aqui - o pior que acontece
# e o script chorar e o agente ir ver.

Titulo 'Possiveis segredos'

$padroes = @(
    @{ nome = 'chave privada';     regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' }
    @{ nome = 'token do GitHub';   regex = 'gh[pousr]_[A-Za-z0-9]{16,}' }
    @{ nome = 'chave OpenAI';      regex = 'sk-[A-Za-z0-9]{20,}' }
    @{ nome = 'chave da AWS';      regex = 'AKIA[0-9A-Z]{16}' }
    @{ nome = 'chave da Google';   regex = 'AIza[0-9A-Za-z_\-]{35}' }
    @{ nome = 'chave do Slack';    regex = 'xox[baprs]-[A-Za-z0-9\-]{10,}' }
    @{ nome = 'atribuição a senha'; regex = '(?i)(password|passwd|senha|secret|api[_-]?key|token)\s*[:=]\s*[''"][^''"]{8,}[''"]' }
)

$alertas = 0
foreach ($ficheiro in $ficheiros) {
    if (-not (Test-Path -LiteralPath $ficheiro -PathType Leaf)) { continue }
    # Ficheiros binarios ou grandes nao se leem para inspeccao
    $item = Get-Item -LiteralPath $ficheiro
    if ($item.Length -gt 2MB) { continue }

    try {
        $conteudo = Get-Content -LiteralPath $ficheiro -Raw -ErrorAction Stop
    } catch {
        continue
    }
    if ($null -eq $conteudo) { continue }

    foreach ($padrao in $padroes) {
        $achados = [regex]::Matches($conteudo, $padrao.regex)
        if ($achados.Count -gt 0) {
            $alertas++
            Write-Host "  $($ficheiro): $($padrao.nome) ($($achados.Count) vez(es))" -ForegroundColor Red
        }
    }
}

if ($alertas -eq 0) {
    Write-Host '  Nada. (A rede e ingenua de proposito.)' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host 'NAO commitar sem mostrar isto ao utilizador.' -ForegroundColor Red
    Write-Host 'Se for um segredo a sério, o ficheiro tem de rodar a chave e' -ForegroundColor Red
    Write-Host 'entrar no .gitignore antes de qualquer commit.' -ForegroundColor Red
}

# ---------------------------------------------------------------------------
# 4. Ficheiros que nao deviam entrar
# ---------------------------------------------------------------------------

Titulo 'Ficheiros a vigiar'

# Coisas que aparecem na raiz deste repositorio e nao pertencem a nenhuma stack.
$varridos = $ficheiros | Where-Object { $_ -notmatch '/' }

if ($varridos) {
    foreach ($ficheiro in $varridos) {
        $suspeito = $false
        $motivo = ''

        if ($ficheiro -eq 'responder.txt') {
            $suspeito = $true
            $motivo = 'texto solto de uma resposta de chat, sem ligacao ao codigo'
        } elseif ($ficheiro -match '\.txt$') {
            $suspeito = $true
            $motivo = 'ficheiro .txt na raiz: confirmar que e conteudo e nao rascunho'
        } elseif ($ficheiro -notmatch '^(README|AGENTS|LICENSE|CHANGELOG)\.md$') {
            $suspeito = $true
            $motivo = 'raiz do repositorio: confirmar que e intencional'
        }

        if ($suspeito) {
            Write-Host "  $ficheiro - $motivo" -ForegroundColor Yellow
        }
    }
}

# Ficheiros gerados que por algum motivo nao estao ignorados
$gerados = $ficheiros | Where-Object {
    $_ -match '(^|/)(dist|build|target|bin|obj|\.crosscheck)/' -or $_ -match '\.(dll|exe|pdb|class|jar|apk|aab|keystore)$'
}
if ($gerados) {
    Write-Host ''
    Write-Host 'Ficheiros gerados nao estao a ser ignorados:' -ForegroundColor Red
    $gerados | ForEach-Object { Write-Host "  $_" }
    Write-Host 'O .gitignore devia apanhar isto. Commitar binarios e o caminho' -ForegroundColor Red
    Write-Host 'mais curto para um repositorio impossivel de usar.' -ForegroundColor Red
}

if (-not $varridos -and -not $gerados) { Write-Host '  Nada.' -ForegroundColor Green }

# ---------------------------------------------------------------------------
# 5. Sugestao de escopo
# ---------------------------------------------------------------------------

Titulo 'Escopo'

$docs = @($ficheiros | Where-Object { $_ -match '^(docs/|.*\.md$)' })
$codigo = @($ficheiros | Where-Object { $_ -notmatch '^(docs/|.*\.md$)' })

if ($docs.Count -gt 0 -and $codigo.Count -gt 0) {
    Write-Host "Documentacao ($($docs.Count)) e codigo ($($codigo.Count)) ao mesmo tempo." -ForegroundColor Yellow
    Write-Host 'Sao normalmente duas commits: a mudanca e a documentacao que a explica.'
} elseif ($codigo.Count -gt 0) {
    Write-Host 'So codigo.'
} else {
    Write-Host 'So documentacao.'
}

Write-Host ''
Write-Host 'Confirma com: git diff --cached --stat' -ForegroundColor DarkGray
