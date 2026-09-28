# AGENTS.md

Instruções para agentes que trabalham neste repositório.

## Skills

**Lê as skills antes de começar.** São as instruções que o próprio repositório
escreveu para si:

| Skill | Para quê |
|---|---|
| `auto-commit` | Fazer commit do trabalho com mensagem útil, depois de verificar testes, segredos e ficheiros que não devem entrar. **Lê esta antes de commitar.** |
| `opencode` | Como configurar o OpenCode: agentes, permissões, plugins, MCP, providers. |
| `report` | Publicar uma issue no GitHub com diagnósticos. Só quando o pedido for mesmo reportar um bug do OpenCode. |

Carregam-se com a ferramenta `skill`, pelo identificador exato:

```
skill("auto-commit")
```

## O repositório

Um gerador de códigos, em cinco linguagens, que têm de produzir **o mesmo
payload byte a byte**. A regra que governa tudo:

> **Uma spec, cinco clientes.** O que vale é o que está em `docs/TIPOS-QR.md` e
> `spec/vectors.json`, não o que qualquer uma das apps faz.

Código partilhado entre linguagens não é o objetivo — o QR é um formato
normalizado, e a regra é verificável, o que permite implementá-lo cinco vezes
sem divergir.

```
docs/        TIPOS-QR.md (a spec) · IDEIA.md (roadmap) · TODO.md (o que falta)
             COMO-USAR.md (como usar e partilhar cada app)
spec/        vectors.json (vetores partilhados) · gerar-vectors.py (regenera)
csharp/      .NET 8, sem dependências
java/        JDK 21 + JavaFX, sem Maven nem Gradle
python/      a implementação de referência
web/         HTML/CSS/JS sem framework, sem build, sem dependências
kotlin/      ainda por fazer
```

## Regras do repositório

### Idioma

Comentários, documentação, nomes de testes e mensagens de commit em **português
de Portugal**. Os identificadores de código (variáveis, funções, classes) também.
English only where the format demands it: the Conventional Commits type prefix,
and the payload strings themselves, which are wire format.

### Não mexer em ficheiros gerados

- `web/dist/` — o ficheiro único. Gerado por `node web/tools/bundle.mjs`.
  Não está no git e nunca deve entrar.
- `spec/vectors.json` — gerado por `python spec/gerar-vectors.py`. Só muda
  quando muda a implementação de referência, e a alteração de spec e a das
  cinco stacks vão no mesmo commit.

### A paridade não é negociável

Ao mexer num payload, mexe nos cinco e corrige a spec. Um payload que sai
diferente num cliente é um bug, mesmo que o teste desse cliente passe.

O `spec/vectors.json` é o arbrito. Se duas implementações discordarem, quem
está errado é o que não bate com a spec.

Ordem de trabalho ao corrigir um payload:

1. Corrige a spec em `docs/TIPOS-QR.md`.
2. `python spec/gerar-vectors.py` regenera os vetores.
3. Propaga às cinco stacks.
4. Corre os testes das cinco.

### Testes

Os testes correm antes de qualquer commit. Só os das stacks tocadas:

| Stack | Comando |
|---|---|
| `csharp/` | `cd csharp && dotnet test` |
| `java/` | `cd java && ./build.sh test` |
| `python/` | `cd python && python -m pytest tests -q` |
| `web/` | `node --test "web/tests/*.test.mjs"` |

Em Windows o `./build.sh` é `C:\Program Files\Git\bin\bash.exe build.sh test`.

O teste que apanha mais bugs é o de nível 2, no qual se **gera a imagem e
descodifica-a com um leitor independente** (ZXing). Os testes estruturais
passam com bugs que só se veem na leitura: a máscara 4 com `x` e `y` trocados
e as posições dos padrões de alinhamento erradas a partir da versão 7 produziam
QR que "pareciam" certos.

```powershell
node web/tests/cross-check.mjs
python web/tests/descodificar.py

# O mesmo, para os códigos de barras
node web/tests/gerar-lineares.mjs
python web/tests/descodificar-lineares.py
```

Quando escrevas um encoder novo, escreve o teste de leitura ao mesmo tempo. Um
encoder que só passa nos testes próprios não está verificado.

**Um encoder só entra no repositório depois de o ZXing devolver a string certa.**
Não há "quase". Na fase dos códigos de barras, quatro encoders pareceram certos
durante a escrita e não eram: o Code 39 com doze elementos por carácter em vez
de nove, e o Code 128 sem os caracteres de troca de conjunto — que se desenha
perfeito e devolve `ABC,3` em vez de `ABC123`. Ambos só apareceram na leitura.
O que ficou de fora, e porquê, está em `docs/TODO.md` no BLOQUEIO 6.

**E um terceiro nível, que é o que apanha o que os outros dois não apanham:** os
ficheiros que o browser exporta, lidos pelo ZXing. A legenda do EAN-13 estava
cortada dos dois lados — o código varria bem, os dois níveis de teste passavam,
e a etiqueta é que não se lia. Se mexeres no desenho de um código, exporta pelo
browser e manda o ficheiro ao leitor.

**E um nível zero, que é o mais barato e o que mais apanha:** as tabelas dos
códigos de barras **nunca se escrevem de memória**. Vêm do `python-barcode` (Python
puro, com as tabelas no código-fonte legíveis) e o `tests/tabelas.test.mjs`
compara-as com as tuas, entrada a entrada. Escrever a tabela do Code 39 de
memória deu doze elementos por carácter em vez de nove, e a do ITF deu dois
elementos na moldura de paragem em vez de três. Nenhum teste estrutural apanha
uma tabela errada.

```powershell
python -m pip install python-barcode   # só para os testes
python web/tests/extrair-tabelas.py
```

**E um padrão de bug que apareceu três vezes:** o separador entre caracteres. O
Code 39, o ITF e o Codabar têm um caractere de início que **acaba numa barra**, e
o primeiro carácter de dados **começa noutra**. Sem um espaço entre eles, as duas
somam-se numa barra larga a mais. O código tem o aspecto certo e o leitor não lê
nada. Se um código de barras "não lê" e a tabela está certa, é este.

**E uma armadilha numérica que custou um dia:** a percentagem de correcção de
erros do QR (4% a L, 24% a H) **não é uma percentagem de área**. É de
*codewords errados*, e só vale com os erros espalhados por vários blocos. Num QR
pequeno há poucos — a versão 2 a nível M tem um só bloco — e uma mancha de
logótipo é contígua, pelo que toca muitos codewords de uma vez. Medido com o
ZXing, a teórica é 4 a 6 vezes o que um QR pequeno aguenta. Os valores em
`frameqr.js` são medidos, não teóricos, e `analisar-frameqr.py` é quem os mede.
Não voltes a pôr a percentagem da norma.

**E a regra do que entra no repositório, que é mais forte do que parece:** um
encoder só entra depois de o ZXing devolver a string certa. Não há "quase" —
nada de parcial, nada de "está quase certo". E um `frameqr.js` sem
`descodificar-frameqr.py` a dizer que os logótipos recomendados leem-se é
código não verificado, por muito que passe nos testes de estrutura.

### O QR code é sempre preto sobre branco

Nas cinco apps, e em qualquer tema ou cor. Um código tem de se ler e não há
como consertar depois de impresso. No cliente web isto é fixo no CSS e há um
teste que falha se algum tema tocar nas cores do canvas.

### Documentação

`docs/` e os READMEs por pasta mantêm-se actualizados **na mesma alteração** que
o código que descrevem. Não é trabalho para o fim: se a mudança altera o
comportamento, a documentação muda com ela, no mesmo commit.

`docs/TODO.md` é a lista do que falta. Se a tua tarefa for um item desse
ficheiro, risca-o.

## Commitar

Lê a skill `auto-commit` antes de commitar. Em resumo:

```powershell
powershell -NoProfile -File .opencode/skills/auto-commit/scripts/preflight.ps1
```

O script diz o que mudou, avisa sobre segredos, assinala ficheiros que não
devem entrar na raiz, e indica que stacks foram tocadas para saber que testes
correr.

Depois:

- Um assunto por commit. Se o bloco de trabalho tem 3 assuntos, são 3 commits.
- Conventional Commits, com o **assunto em português**: `fix(pix): não destruía
  nomes com espaço no BR Code`. O prefixo de tipo fica em inglês porque é o que
  as ferramentas leem.
- O corpo explica o **porquê**. O diff já diz o quê.
- **Nunca `git push`.** O commit é local; publicar é uma acção separada, pedida
  à parte.

## Coisas que já trippedaste, para não repetir

- **O `localStorage` do tema guarda `familia:modo`.** Ao mudar de formato,
  ler o valor antigo tem de continuar a funcionar.
- **Os acentos em `.ps1` exigem UTF-8 com BOM.** O Windows PowerShell 5.1 lê
  scripts sem BOM como ANSI e escreve `Ãº` no terminal.
- **Módulos ES são bloqueados em `file://` pelo Chrome.** Daí existirem duas
  formas de servir o cliente web.
- **`jpackage` só compila no SO de destino.** Um instalador para Windows só sai
  em Windows.
- **A lista de tipos do cliente web e a da spec têm de bater.** Está no
  `tests/themes.test.mjs` e nos testes de payload.
