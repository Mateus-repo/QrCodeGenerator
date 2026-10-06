# Diagnóstico de `csharp/desktop-winforms/MainForm.cs`

Medido em 2026-10-06, com `dotnet` disponível. **Nenhum destes números é
estimado** — todos saem de ler o código e de contar.

## O resumo

| | |
|---|---|
| Linhas em `MainForm.cs` | 498 |
| Campos declarados | **43** |
| Categorias | 11 |
| `.Designer.cs` | **não existe** |
| `.resx` | **não existe** |
| `TableLayoutPanel` / `FlowLayoutPanel` | **nenhum** |
| `Anchor` / `Dock` | **nenhum** |
| `AutoScroll` | **nenhum** |
| `AccessibleName` | **nenhum** |
| `SuspendLayout` | **nenhum** |
| **Campos fora do ecrã** | **3 de 43** |

## O defeito que custa dados ao utilizador

### O contentor tem altura fixa e não tem scroll

```csharp
// MainForm.cs:72
_fieldHost = new Panel { Location = new Point(120, 44), Size = new Size(280, 280) };
```

E a altura de cada campo é calculada em `RebuildFields`:

```csharp
// MainForm.cs:372-375
int height = control is TextBox { Multiline: true } m
    ? (ReferenceEquals(m, _txtText) ? 150 : 64)
    : 24;
_fieldY += height + 12;
```

**24 + 12 = 36 px por campo**, contra **280 px** disponíveis:

A coluna do meio é a soma, que inclui o espaço depois do último campo. **A
coluna que decide é a do fundo**: é onde o último campo acaba, e um campo só
sai do painel quando o **topo** passa os 280 px.

| Categoria | Campos | Soma | Fundo do último | Estado |
|---|---:|---:|---:|---|
| Link | 1 | 36 px | 24 px | cabe |
| Texto | 1 | 36 px | 24 px | cabe |
| Email | 3 | 108 px | 96 px | cabe |
| Telefone | 2 | 72 px | 60 px | cabe |
| SMS | 3 | 108 px | 96 px | cabe |
| WhatsApp | 3 | 108 px | 96 px | cabe |
| Evento | 5 | 180 px | 168 px | cabe |
| Localização | 2 | 72 px | 60 px | cabe |
| WiFi | 4 | 144 px | 132 px | cabe |
| **VCard** | **11** | **396 px** | **384 px** | **3 campos invisíveis** |
| PIX | 8 | 288 px | 276 px | cabe, sobra 4 px |

**Só o VCard perde campos.** O PIX tem a soma mais apertada de todas as
categorias que cabem — 4 px de folga — e por isso parece o caso perigoso. Não é.

**Num `Panel` sem `AutoScroll`, os filhos fora dos limites são cortados.** Não
há como lhes chegar com o rato nem com o teclado.

**O VCard perde os campos 9, 10 e 11.** A pessoa escreve o nome, o telefone e
o e-mail, vê o formulário calado, e conclui que o nome do campo estava
errado. Não está — está 116 px abaixo do fundo.

> **Reparar isto é `AutoScroll = true`, e foram quinze segundos.** *Só*
> `AutoScroll`: o `Dock = DockStyle.Fill` que a primeira versão desta nota
> sugeria **taparia os botões**, porque o formulário é todo de posições
> absolutas e os botões estão em `y = 490`. A receita estava certa no
> diagnóstico e a meio caminho na correcção, e é por isso que se segue o código.

## O que foi feito, e o que a medição passou a ser

**Corrigido, e a medição passou a ser um teste** — o `InterfaceTestes`, nos
testes do C#. Um teste que abre a janela e mede os controlos foi o que
descobriu o terceiro defeito, e não havia receita que o apanhasse.

| Defeito | Onde | O que se fez |
|---|---|---|
| Painel de 280 px sem barra | `_fieldHost` | `AutoScroll`, e a altura subiu para os 436 px livres até aos botões |
| Coluna dos campos em `x = 90` | `RebuildFields` | A coluna passa a ser a do rótulo mais largo, medida |
| Etiqueta da `CheckBox` duplicada | `RebuildFields` | Uma caixa não recebe etiqueta: traz o próprio texto |

**O do `x = 90` é o mesmo defeito do painel, noutra dimensão.** Um contentor
com altura fixa e conteúdo variável corta campos; uma coluna com largura fixa
e rótulos variáveis tapa-os. **Os dois se resolvem da mesma maneira: medir em
vez de contar**, que é a regra que o `lineares.py` dos códigos de barras também
usa para as guardas.

**E o `90` estava errado por margem larga:** "Nome do recebedor", no `Pix`,
mede 115 px. O texto entrava no campo.

**A medição é `TextRenderer.MeasureText` e não `Graphics.MeasureString`,** e a
diferença não é de gosto: `MeasureString` é GDI+, e um `Label` desenha-se com
as métricas do GDI. Os dois medem o mesmo texto e dão números diferentes, e
**medir com a métrica errada é pior do que não medir.**

**Fica por fazer** a receita que a skill descreve: `TableLayoutPanel` em vez
da contagem de pixeis, um registo único dos 43 campos, `AccessibleName` em
todos, e passar ao designer. Nenhum dos três defeitos acima se resolve sozinho
com isso — mas nenhum volta a aparecer depois.

## Os outros quatro, por gravidade

### Nada se adapta ao redimensionamento

`ClientSize = new Size(940, 600)` e controlos em coordenadas absolutas:

```csharp
_btnRefresh.Location = new Point(450, 490);   // 230 x 40
_btnSave.Location    = new Point(696, 490);   // 230 x 40
_preview.Location    = new Point(450, 14);    // 476 x 470
```

**Soma: 696 + 230 = 926**, e a largura útil é 940. Cabe com 14 px de folga — e
**não há `Anchor` em lado nenhum**, por isso redimensionar a janela não move
nada. Num portátil de 1366 px de largura com a janela maximizada, o botão
"Baixar PNG" fica cortado.

E o número não diz com o que está ligado: `490` é a mesma coordenada para dois
botões que **não** devem estar encostados um ao outro. Mover um obriga a
mexer no outro, e nada avisa.

### O mesmo conjunto escrito duas vezes

43 declarações no topo (até `MainForm.cs:60`) e 39 `yield return` em
`FieldControls()` (a partir de `MainForm.cs:223`) — **163 linhas de distância**.

**E não são a mesma lista:** 43 declarados, 39 na lista. Os quatro que faltam
são os controlos que não são campos (`_cmbCategory`, `_cmbSize`, `_cmbEcc`,
`_chkAuto`), que ficam de fora de propósito. É essa diferença que torna a
armadilha mais fácil de não notar: as listas *parecem* iguais, e por isso
ninguém as confere.

**Nada liga as duas listas.** Acrescentar um campo em cima e esquecer a lista de
baixo dá um campo que existe, nunca é observado, e **o código regenera com o
valor antigo sem dar erro nenhum** — que é a mesma armadilha do selector do
site que a `AGENTS.md` documenta com o GS1-128.

### `RowsFor` tem 82 linhas de `switch` com uma conversão por linha

```csharp
QrCategory.Link => new[] { ("Link", (Control)_txtUrl) },
QrCategory.Email => new[] { ... (Control)_txtMailTo, ... },
```

O `(Control)` em cada linha é a pista de que os tipos não batem sozinhos, e
**cada `(Control)` é um ponto onde o compilador deixa passar um tipo
diferente do que a linha de cima queria**.

### A interface não tem designer

Sem `MainForm.Designer.cs` e sem `MainForm.resx`:

- **sem pré-visualização** — o formulário só abre a correr;
- **sem metadados de DPI** — numa tela a 150% os controlos não escalam;
- **sem localização** — todos os textos são literais no código;
- **sem designer** — quem não souber WinForms não mexe.

## O que não está errado, e convém não partir

- **`QrRenderer.cs` tem 100 linhas e está limpo.** Separa o desenho da
  interface, e é a razão de o código de barras não estar espalhado pelo
  formulário.
- **O `core` não tem nada a ver com isto.** `csharp/core/` é independente de
  WinForms, e os testes do payload não desenham nada — que é precisamente o que
  este diagnóstico vem mostrar.
- **As cores estão certas.** Não há tema escuro nem cor de fundo no canvas, e a
  `AGENTS.md` exige preto sobre branco em qualquer tema. **Não mexer.**

## A ordem que faz sentido

1. ~~**`AutoScroll` no `_fieldHost`**~~ — **feito.** Quinze segundos, e acabou
   com os campos perdidos. É o que causava dano ao utilizador.
2. **`TableLayoutPanel` em vez de `_fieldY`** — o que garante que o passo 1 não
   volta a ser preciso quando aparecer uma categoria nova.
3. **Um registo único dos 43 campos**, e as duas listas a lêrem dele.
4. **`AccessibleName` em todos os 48** e `TabIndex` explícito.
5. **`Anchor`/`Dock`**, para o formulário acompanhar a janela.
6. **Passar ao designer**, com o `resx`, o que dá pré-visualização, DPI e
   tradução de uma vez.

## Como se prova cada passo

**Nenhum se prova num teste de payload.** O que prova é um teste que **abre a
janilha** — o `InterfaceTestes`, nos testes do C# — e isto:

```csharp
// Não cabe E não há forma de lá chegar = um campo que a pessoa
// não consegue preencher. É um bug de dados perdidos sem mensagem.
Assert.True(
    necessario <= host.ClientSize.Height || host.AutoScroll,
    $"{categoria} precisa de {necessario} px e o painel tem "
    + $"{host.ClientSize.Height}, sem `AutoScroll`.");
```

**O `|| host.AutoScroll` é o ponto todo, e a versão anterior deste ficheiro não
o tinha.** Um teste que afirma só "o conteúdo cabe" é um teste que obriga a
crescer o contentor para sempre; um teste que afirma "se não cabe, há forma de
chegar lá" aceita a barra de scroll como resposta. **O primeiro transforma cada
categoria nova numa alteração de código; o segundo transforma-a só num número
que se lê.**

**E a sobreposição se prova com dois eixos, não um.** Compara-se o rectângulo
inteiro:

```csharp
bool cruzam = rotulo.Right > campo.Left && rotulo.Left < campo.Right
           && rotulo.Bottom > campo.Top && rotulo.Top < campo.Bottom;
```

Só os X dão falsos positivos por controlos que **partilham a coluna e estão
em linhas diferentes** — e foi o que aconteceu da primeira vez, com o `WiFi`.

> **O teste tem de percorrer as onze categorias.** Abrir a que está por omissão
> dá `Link`, um campo, e verde. O problema é na décima, e nenhuma abertura
> manual a encontra.
>
> **E tem de ser pelo índice, não pelo item.** O combo está preenchido com
> `QrCategoryNames.All`, que são cadeias; `SelectedItem = QrCategory.VCard` não
> corresponde a nenhum item e o WinForms ignora em silêncio — o `SelectedIndex`
> fica no 0 e o teste passa a olhar para o `Link` em todas as iterações. **Foi
> exactamente o que aconteceu, e o teste deu verde com o bug presente.**

**E uma captura por categoria, porque um teste de altura passa com o
formulário bonito e o campo invisível.**
