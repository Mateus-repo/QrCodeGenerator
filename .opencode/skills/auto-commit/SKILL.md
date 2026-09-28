---
name: Auto Commit
description: Fazer commit do trabalho por conta própria, com mensagem útil, depois de verificar testes, segredos e ficheiros que não devem entrar. Use quando o utilizador pedir para commitar, guardar o trabalho, fazer commit, ou depois de um bloco de trabalho que ficou pronto.
---

# Auto commit

Fazer commit do trabalho por conta própria, com uma mensagem que valha alguma
coisa. Este repositório já foi committado com mensagens `fic`, `atyua`, `.` e `fiz` — um
histórico que não serve para nada. O objectivo desta skill é que nunca mais
acrescente um.

## O que esta skill faz e o que não faz

**Faz:** verifica, testa, escreve a mensagem, commita, reporta.

**Não faz, nunca:**

- `git push`. Commit é reversível; publicar não é. O push é uma acção separada,
  pedida à parte. Se o utilizador quiser publicar, diz explicitamente.
- `git add -A` em árvore suja sem ler o diff. Ver "Antes de commitar".
- `git commit --no-verify`. Se um hook falhar, o hook está a fazer o seu
  trabalho. Reporta e para.
- `git add -f` sobre um ficheiro ignorado. Se um ficheiro deve entrar, corrige
  o `.gitignore` e diz isso ao utilizador.
- `git reset --hard`, `git checkout .`, `git clean` para "resolver" um
  ficheiro inesperado. Isso destrói trabalho. pergunta.

## Antes de commitar

Lê o que mudou. Isto não é formalidade: sem isto, um commit pode engolir
ficheiros que o utilizador estava a meio de mexer.

```powershell
powershell -NoProfile -File .opencode/skills/auto-commit/scripts/preflight.ps1
```

> `-NoProfile` não é飾: um perfil do utilizador pode ter aliases que mudam o
> significado de `git`. Se esta máquina tiver `pwsh` e não `powershell`, serve
> o mesmo. O script é PowerShell 5.1 — sem `Join-Path` de vários argumentos, sem
> `??`, sem ternário.
>
> O ficheiro tem de ficar gravado em **UTF-8 com BOM**. Sem BOM o PowerShell 5.1
> lê o script como ANSI e os acentos viram `Ãº`. Se editares o script, mantém o
> BOM.

O script dá-te o que precisas num sítio: o estado, a lista de ficheiros
alterados, os avisos de segredos, e **quais stacks foram tocadas** (para saberes
que testes correr).

Depois disto, decide:

- **Uma só coisa mudou** → commita.
- **Várias coisas independentes mudaram** → isso são vários commits. Agrupa por
  assunto e faz um commit por grupo, não um commit com quatro assuntos. Exemplo:
  um `feat` no payload do PIX e uma correção de texto no README são dois
  commits, mesmo que tenham sido feitos na mesma sessão.
- **Há um ficheiro que não reconheces** → não commites. Mostra ao utilizador o
  que é e pergunta. Pode ser lixo solto (há um `responder.txt` na raiz que é
  texto de uma resposta de chat) ou pode ser trabalho a sério de outra pessoa.
  A diferença não se adivinha.
- **Só há ficheiros gerados** → não há nada a fazer. O `.gitignore` já os
  apanha; se aparecerem na mão, o `gitignore` está errado.

## Testes

Um commit que quebra os testes é pior do que não commitar. Corre os testes das
stacks que o `preflight.ps1` disser que foram tocadas:

| Stack tocada | Comando |
|---|---|
| `csharp/` | `cd csharp && dotnet test` |
| `java/` | `cd java && ./build.sh test` |
| `python/` | `cd python && python -m pytest tests -q` |
| `web/` | `node --test "web/tests/*.test.mjs"` |

Se falharem:

- **A falha é do que acabaste de fazer** → não commites. Corrige primeiro.
- **A falha já estava lá** → não commites na mesma. Diz ao utilizador que já
  estava partida, e pergunta se queres commitar assim mesmo.

Em Windows, `./build.sh` é `C:\Program Files\Git\bin\bash.exe build.sh test`.

## A mensagem

Formato Conventional Commits, com o **assunto em português**, que é a língua do
código e da documentação deste repositório. O prefixo fica em inglês porque é
isso que as ferramentas leem.

```
<tipo>(<âmbito>): <assunto em minúsculas, imperativo, sem ponto final>

<corpo: o porquê, não o quê. O "quê" já está no diff.>

<rodapé: referências a issues ou ao que fechou>
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `style`, `build`,
`chore`, `revert`.

Regras que importam:

- **Imperativo, no presente:** `adiciona`, não `adicionado` / `adicionava`.
  Um commit descreve o que o commit *faz*.
- **Assunto com 50 a 72 caracteres.** Mais curto que isso não diz nada.
- **Corpo explica o porquê.** Se o diff mostra *o quê*, o corpo tem de responder
  a *porquê isto e não outra coisa*. Uma linha sobre a decisão tomada vale mais
  que três linhas a descrever o ficheiro.
- **Um assunto, uma commit.** Se precisas de " e " no assunto, são duas commits.
- **Sem ponto final no assunto.** O corpo é que leva a pontuação.

Exemplos deste repositório:

```
fix(pix): não destruía nomes com espaço no BR Code

O payload era normalizado com strip() e "Fulano de Tal" perdia os
espaços. Um nome de recebedor com espaço é o caso normal, não a
exceção, e o resultado não era lido por nenhuma app de banco.

A validação passou a rejeitar espaço nas pontas em vez de o remover
a meio, e o CRC-16 é calculado sobre o payload exato que vai para a
matriz.
```

```
feat(web): variantes clara e escura de cada tema

Passou a haver 9 famílias x 3 modos. A forma do tema (raio, fonte,
moldura 3D) ficou num atributo e a paleta noutro, porque a forma não
depende do modo: o Windows 95 escuro tem a mesma moldura que o claro.

O modo "sistema" e resolvido em JavaScript, senao cada paleta
aparecia duas vezes no CSS e o ficheiro dobrava de tamanho.
```

Ver `references/mensagens.md` para a lista de antipadrões e mais exemplos.

## Commitar

```powershell
# 1. Adiciona o grupo, ficheiro a ficheiro. Nunca -A sem ter lido o diff.
git add <ficheiros>

# 2. Confirma o que vai mesmo entrar
git diff --cached --stat

# 3. Commita com a mensagem num ficheiro temporário
#    (evita que aspas e quebras de linha estraguem a mensagem no PowerShell)
```

A mensagem em ficheiro temporário é o truque que evita a classe de erros mais
chata: escrever `-m "..."` com aspas e acentos no PowerShell. Escreve a mensagem
num `.git/COMMIT_EDITMSG` temporário, ou num ficheiro fora da árvore, e usa:

```powershell
git commit -F <ficheiro>
```

Depois do commit:

```powershell
git log -1 --stat
git status --short
```

E reporta ao utilizador, em português: o hash curto, o assunto, quantos ficheiros,
que stacks foram testadas, e o que ficou de fora (se ficou alguma coisa). Sem
isso o commit é uma caixa preta.

## Ao fim de um bloco de trabalho

Se a tarefa ficou concluída e os testes passam, faz o commit sem que te peçam.
Não comeces pelo commit: primeiro o trabalho, os testes, e só depois o commit.
