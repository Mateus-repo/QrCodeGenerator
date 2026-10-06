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
kotlin/      core JVM + app Android, com o Gradle wrapper versionado
go/          a pasta e o README; sem código, e por último
```

**A app em Go é a última, e é uma decisão de ordem e não de dificuldade.**
O Go não é uma das linguagens mais adequadas a isto — não tem `char` nem
aritmética de `String`, e cada cadeia é uma questão de UTF-8 — mas compila
para um binário só, sem runtime, que é o que se quer de um programa para
distribuir. A ordem é: **Java → mobile → C# → Python → e Go no fim**, porque
cada uma aprovecha o que a anterior deixou feito, e porque o `go/` só compensa
depois de haver uma spec madura que não dê para improvisar.

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
| `kotlin/core/` | `cd kotlin && gradlew.bat :core:test` |

O `gradlew` não precisa de Gradle instalado — descarrega a versão fixada em
`kotlin/gradle/wrapper/`. O toolchain está fixado em **Java 21**, e isso importa
porque o Android Studio corre o Gradle com o JBR dele, que pode ser outro: sem a
fixação compila numa máquina e falha na outra, e a mensagem de erro é sempre a de
uma dependência que desceu de versão.

**O `gradle-wrapper.jar` entra no repositório apesar de ser um binário, e o
preflight avisa contra isso.** Tem razão em geral e engana-se aqui: sem o jar o
`gradlew` existe e não executa, com um `Could not find or load main class` que
não fala de um ficheiro em falta. A excepção está escrita no `.gitignore` com a
razão, e não numa excepção na memória de alguém.

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

**E uma armadilha que é mais do que parece:** a zona apagada do FrameQR é dada
em coordenadas do *código*, e o canvas desenha a partir da *margem*. São a mesma
grelha com origens diferentes. O logotipo saiu 4 módulos à esquerda, o QR
**continuou a ler** — nenhum teste falhou, porque o código estava certo — e o
único sintoma era um desenho torto. É a razão de o nível 3 existir mesmo quando
o encoder não mudou: o que se exporta tem de se ler **e** estar no sítio.

**E o mesmo bug voltou, com outro nome, depois de estar corrigido.** A causa era
o *nome de um argumento*: `desenharLogotipo` recebia `offset` e a chamada
passava `margem`. O `offset` ficava no zero do valor por omissão e o logotipo
saía 4 módulos para a esquerda — a mesma falha, outro ficheiro, outra altura.
Duas lições que valem mais do que o bug:

**Uma função que ignora uma opção desconhecida é a pior forma de bug** — a
assinatura promete e o corpo ignora. `desenharLogotipo` recusa `margem` com um
erro que diz o nome certo, e o erro sai **no browser**, porque `offset` a zero é
um valor legítimo e um valor de esquecimento e nada no desenho os distingue.

**E um teste que prova que uma peça está boa não prova que a máquina liga.** Os
cinco primeiros testes do ficheiro `frameqr-centragem.test.mjs` testavam a
função e **passavam com o bug e sem ele** — verificado, reintroduzindo o erro.
Importavam `frameqr.js` e não `app.js`, e o bug estava na *chamada*. O teste que
o apanha é o que lê o fonte e procura a linha. É uma defesa imperfeita — não
executa a aplicação, que nem se pode importar porque ela toca no DOM ao
carregar — mas é a única que apanha um erro de nome numa chamada, e o erro de
nome é precisamente o que nenhuma das outras peças vê.

**E um `ComboBox` cheio de cadeias ignora um `SelectedItem` de outro tipo, em
silêncio.** O teste da interface do C# punha a categoria com
`SelectedItem = QrCategory.VCard`, e o combo está preenchido com
`QrCategoryNames.All`, que são **cadeias**. Não corresponde a nenhum item, o
WinForms não dá erro, o `SelectedIndex` fica no **0** — que é `Link`, um campo,
que cabe sempre — e o teste passou a medir a categoria errada nas onze
iterações. Com os campos do VCard perdidos, **236 testes a verde**.

**A diferença entre passar e não passar foi reintroduzir o bug**, que é o
único jeito de saber se um teste afirma alguma coisa. Passou com o bug, passou
sem ele, e portanto não afirmava nada: foi a segunda vez que um teste deste
repositório saía vazio, e a primeira foi o `frameqr-centragem.test.mjs`, que
importava a função e não a aplicação. **As duas têm a mesma raiz** — o teste
correu, e o que ele exercita não era a coisa defeituosa.

A correcção é pôr a categoria pelo **índice** — que é como o `RebuildFields` a
lê, `(QrCategory)_cmbCategory.SelectedIndex` — e **afirmar que ela ficou posta**.
Se o combo deixar de estar sincronizado com o enum, o teste passa a dizer
isso, em vez de medir a categoria anterior e dar verde.

**E o mesmo ficheiro estava partido noutra dimensão:** a coluna dos campos
estava num `x = 90` escrito à mão, e o rótulo "Nome do recebedor" do Pix mede
115 px. **É o defeito do painel de altura fixa, outra vez** — um contentor com
medida fixa e conteúdo variável corta campos, uma coluna com medida fixa e
rótulos variáveis tapa-os — e resolve-se igual: **medindo**. A coluna passa a
ser a do rótulo mais largo, medido com `TextRenderer.MeasureText` e não com
`Graphics.MeasureString`, porque o `Label` desenha-se com as métricas do GDI e
**medir com a métrica errada é pior do que não medir**.

**E o terceiro defeito só apareceu porque o teste abre a janela:** a etiqueta de
uma `CheckBox` era desenhada em `x = 0`, uma linha abaixo da própria caixa, e o
texto via-se duas vezes. Não há receita que apanhe isso, e a receita
`winforms-design` deste repositório não apanhava. **Há um teste que abre o
formulário e mede os controlos.**

**E um `Form` precisa de um `STAThread`,** que o runner do xUnit não é. O
corpo do teste corre numa thread dedicada, e é por isso que o ficheiro tem três
`Fact` e não um `Theory` por categoria: **a construção do formulário é mais cara
do que o teste**, e abrir catorze vezes a mesma janela não é testar catorze
coisas.

**E o teste de interface tem de medir em duas dimensões.** A primeira versão
afirmava `rotulo.Right <= campo.Left` e deu um falso positivo com o WiFi — dois
controlos que **partilham a coluna e estão em linhas diferentes** não se
sobrepõem. Sobrepor é `a.Right > b.Left && a.Left < b.Right && a.Bottom >
b.Top && a.Top < b.Bottom`, e o eixo que falta é sempre o que dá o falso
positivo.

**E o `Dock = DockStyle.Fill` que a skill sugeria não servia** — o formulário é
todo de posições absolutas, com os botões em `y = 490`, e um `Fill` no painel
tapava-os. **A skill estava certa no diagnóstico e a meio caminho na receita,**
que é a razão de se seguir o código e não a receita.

**E sobre o limite em píxeis do logotipo:** não é um número fixo, depende da
escala, e a escala muda com o tamanho pedido e com a versão do QR. A mensagem
tem de dizer a caixa nos dois termos — N×N **módulos** e N×escala **píxeis** —
e o aviso é só para a imagem **pequena**: acima do ideal o browser reduz sem
perda visível, e dizer que há um máximo seria inventar uma restrição que não
existe.

**E um ficheiro exportado tem de sair igual ao que está no ecrã.** Aconteceu
com o QR com logótipo — o PNG saía com o logótipo e o SVG sem ele, dois ficheiros
com o mesmo nome e conteúdos diferentes, sem nenhum aviso. A regra é passar a
mesma matriz aos dois, e vale para o SVG e para o PNG de qualquer formato.

**E duas listas do mesmo conjunto divergem em silêncio.** O selector de formatos
vive no `index.html` e o registo das simbologias vive no módulo. São o mesmo
conjunto escrito duas vezes, e nada as ligava: o GS1-128 entrou no registo com o
encoder, a validação, a altura e os 8 casos lidos pelo ZXing — e **não aparecia
no selector**. Sem sintoma e sem erro; a aplicação é que está certa e a pessoa é
que não o consegue escolher. O `formatos.test.mjs` compara as duas, nos dois
sentidos: um `<option>` sem registo rebenta ao desenhar (erro visível), e um
registo sem `<option>` é invisível (erro que não se vê). O mesmo se aplica à
lista de AIs e à de tipos de QR.

**E o service worker servia a versão antiga para sempre.** Com um nome de cache
fixo e a estratégia "cache primeiro", quem abrisse o site ficava com a versão de
ontem — e o sintoma é o mais confuso possível: o encoder está no disco, o registo
tem a entrada, o servidor responde certo, e a aplicação diz "Formato
desconhecido" porque tem em memória o módulo de antes. O `sw.js` passou a levar a
versão no nome do cache, e a lista de recursos passou a ser explícita e
completa. **Ao acrescentar um módulo, acrescentá-lo à lista**, ou o site não
funciona offline.

**E um filtro de nome de classe em inglês salta os testes em português, sem
aviso nenhum.** O `SimbologiasTestes.java` esteve compilado no directório de
classes durante uma sessão inteira sem correr uma vez, e foi por isso que os
três bugs que ele apanha lá estavam: a largura do ITF decidida pela caixa da
letra, o Code 128 a contar a corrida pelo índice errado, e as guardas a marcar
colunas de dados.

**Onde isso acontece é no `java/build.sh`, e só lá.** O console launcher do JUnit,
com `--select-package`, filtra os nomes por `.*Tests?$` — `Test` ou `Tests` — e
uma classe chamada `SimbologiasTestes` **não bate**: não é descoberta, não corre,
e o build passa. Não há aviso, não há falha, o número de testes é que é menor e
ninguém compara.

**O `gradlew :core:test` não sofre disto**, porque o Gradle procura por métodos de
teste e não pelo nome da classe — medido, os 37 testes do `SimbologiasTestes`
correm em Kotlin sem nenhum filtro. **É por isso que o filtro se põe no
`build.sh` e não em lado nenhum:** a regra é do launcher, e uma regra escrita
onde o problema não está manda o próximo procurar no sítio errado.

A `AGENTS.md` manda que os testes se chamem em português, por isso o `build.sh`
passa a dizer as duas formas:
`--include-classname='.*(Test|Tests|Teste|Testes)$'`. **Ao acrescentar um ficheiro
de testes em Java, confirmar que o número de testes subiu.**

**E um comentário que descreve a regra ao contrário é pior do que nenhum
comentário.** O dígito de controlo do Code 39 chegou a parecer um bug em três
stacks por causa disso: o comentário da classe Java afirmava que a regra do
formato é «a letra que torna a soma múltipla de 43» e que o repositório se
desviava dela. O código estava certo e o comentário estava errado — a regra é o
**resto** da divisão por 43, como a Zebra dá no exemplo trabalhado do ZPL
(`12345ABCDE/` soma 115, resto 29, letra `T`) e como o `Code39Reader(true)` do
ZXing confirma ao validar. O comentário do Python descrevia a regra complementar
e o código fazia a outra, no mesmo ficheiro.

Um comentário errado não dá erro: **convida a «corrigir»**, e a correcção quebra
três stacks para um problema que não existe. Custa mais do que o silêncio.

> **A mesma razão pela qual as tabelas dos códigos de barras vêm de um
> gerador.** Uma regra que se sabe de cor merece um exemplo publicado que a
> confirme. O `SimbologiasTestes` afirma agora o exemplo da Zebra, e a regra
> complementar faz o teste falhar — verificado reintroduzindo-a.

E a armadilha de raciocinar por analogia: «o dígito de controlo torna a soma
múltipla de N» é a regra do **EAN-13** e do **ITF-14**, e é `(10 - soma % 10) % 10`.
O Code 39 é `soma % 43`, o oposto, e o Code 128 também é o resto, módulo 103.
**Três simbologias, três fórmulas, e a do Code 39 é a contrária das outras
duas.**

**E os testes de leitura têm de ser do encoder, não da biblioteca.** O
`RenderTests` desenha o QR com o ZXing e lê com o ZXing, e o próprio ficheiro
reconhece que isso é mais fraco: um erro comum aos dois passos passa. Nas
simbologias o teste faz o inverso — **o Java desenha e o ZXing lê** — e é essa a
versão que apanha a largura errada e o elemento errado. Um encoder que só passa
nos testes próprios não está verificado.

**E um script que reescreve a documentação estraga-a melhor do que a mão.** O
`docs/TODO.md` passou de 612 para 32 958 linhas num `git diff --stat`, e a
razão foi `"\n".join(uma_cadeia)`, que junta **cada caractere** com uma quebra
de linha. A defesa óbvia — contar as linhas de um caractere só antes de
escrever — **não chega**: na segunda tentativa o ficheiro ficou com 670 linhas,
um tamanho perfeitamente plausível, e mesmo assim tinha quatro blocos
duplicados, uma frase sem a primeira metade e um item que dizia uma coisa e
meio. **O número de linhas não diz nada sobre o ficheiro estar bem.** A regra
que ficou é: um script que edita `docs/` substitui **blocos inteiros** — do
cabeçalho do item ao fim dele —, declara o texto novo por inteiro, e no fim
relê o resultado em memória para confirmar que cada título aparece **uma vez
só**. E se a procura do texto a substituir falhar, o script não escreve nada.

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
