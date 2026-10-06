---
name: winforms-design
description: Construir e rever a interface WinForms em C#, com o layout declarado em vez de contagens de píxeis. Usar quando se acrescenta um campo, uma categoria ou um ecrã a uma app WinForms, quando um formulário fica torto ou um campo não aparece, ou quando se revê um `MainForm` — este repositório tem 43 campos numa tabela desenhada à mão e três deles estão fora do ecrã.
---

# Design de app WinForms

Este repositório tem uma app WinForms com **43 campos** e **onze
categorias**, e a interface está inteira escrita à mão em `MainForm.cs` — sem
`.resx`, sem `Designer.cs`, sem `TableLayoutPanel`. **Dois campos são
invisíveis**, e ninguém reparou porque nenhum teste olha para a interface.

Esta skill existe porque esse caso é o mais comum e o mais barato de não ver.
Um bug de layout não dá erro, não falha o build, e não aparece num teste que
só olha para o payload. **Aparece quando alguém usa a app.**

## A regra que resolve quase tudo

**O layout é declarado; a posição é calculada pelo WinForms.**

```csharp
// ERRADO — a posição é aritmética tua, e nada a revê
private int _fieldY;
...
control.Location = new Point(90, _fieldY);
_fieldY += control.Height + 12;
```

```csharp
// CERTO — o WinForms decide onde cada control fica
var linha = new TableLayoutPanel
{
    ColumnCount = 2,
    AutoSize = true,
    Dock = DockStyle.Fill,
    ColumnStyles =
    {
        new ColumnStyle(SizeType.Absolute, 90),
        new ColumnStyle(SizeType.Percent, 100),
    },
};
linha.Controls.Add(rotulo, 0, linha.RowCount);
linha.Controls.Add(campo, 1, linha.RowCount);
linha.RowCount++;
```

A razão não é estilo. É que **`TableLayoutPanel` cresce com o conteúdo** e a
aritmética não, e a diferença entre as duas aparece no primeiro campo a mais.

## Os cinco defeitos, e como cada um se manifesta

Todos medidos em `csharp/desktop-winforms/MainForm.cs`. O diagnóstico completo,
com números, está em `references/diagnostico.md`.

### 1. Um contentor de altura fixa com conteúdo variável

```csharp
_fieldHost = new Panel { Location = new Point(120, 44), Size = new Size(280, 280) };
```

**280 px de altura fixa, sem `AutoScroll`.** A categoria VCard tem 11 campos de
36 px = **396 px**. Os campos 9, 10 e 11 ficam **fora do painel, sem scrollbar
e inalcançáveis**: a pessoa vê 8 campos e não há forma de chegar aos outros 3.

A categoria PIX, com 8 campos, excede em 8 px — o último campo fica cortado ao
meio.

> **Um contentor com altura fixa e conteúdo variável é sempre um bug
> adiado.** Ou o contentor cresce com o conteúdo (`AutoSize`), ou tem
> `AutoScroll`, ou as duas coisas. Não há terceira opção que não falhe.

### 2. Posições absolutas em píxeis

`ClientSize = new Size(940, 600)` com controlos em `new Point(450, 490)` e
`new Size(230, 40)`.

**Não há `Anchor` nem `Dock` em lado nenhum.** Redimensionar a janela não move
nada — o formulário fica com 300 px de margem à direita e o botão "Baixar PNG"
metade fora do ecrã em qualquer portátil com menos de 1600 px de largura.

E como não há `Anchor`, a correção depende de alguém saber que os píxeis estão
ligados uns aos outros. **O número 490 não diz com o que está ligado.**

### 3. A interface inteira em código, sem designer

Não existe `MainForm.Designer.cs` nem `MainForm.resx`.

Consequências que não se vêem mas se pagam:

- **sem pré-visualização em tempo de desenho** — o `MainForm` só pode ser
  aberto a correr;
- **sem metadados de DPI** — o WinForms não sabe a que resolução foi desenhado,
  e numa tela a 150% tudo fica deslocado;
- **sem localização** — todos os textos são literais no código, e traduzir
  passa a ser editar código;
- **sem designer** — quem não souber WinForms não mexe, porque não há
  arrastar-e-soltar.

### 4. O mesmo conjunto escrito duas vezes

As 43 declarações de campo no topo do ficheiro:

```csharp
private readonly TextBox _txtUrl = new();
private readonly TextBox _txtText = new();
// ... 46 mais
```

E a lista de volta, 120 linhas abaixo:

```csharp
private IEnumerable<Control> FieldControls()
{
    yield return _txtUrl;
    yield return _txtText;
    // ... 46 mais
}
```

**As duas listas têm de ficar em acordo e nada as liga.** Acrescentar um campo
ao topo e esquecer a lista de baixo dá um campo que existe e nunca é
observado — e o código regenera com o valor antigo, sem dar erro.

> **É a mesma armadilha do selector de formatos do site**, que a `AGENTS.md`
> documenta com o GS1-128: entrou no registo com o encoder, a validação e os
> casos lidos pelo ZXing, e não aparecia no selector. Nenhum sintoma, nenhum
> erro — a aplicação estava certa e a pessoa é que não conseguia escolher.

A forma de não cair: **o campo declara-se uma vez, num dicionário ou numa
lista, e tudo o resto lê essa lista.**

### 5. Nem nome acessivel nem ordem de tabulacao

Não há um único `AccessibleName`, e o `TabIndex` nunca é atribuído — a ordem de
tabulação é a ordem de adição ao `Controls`, que funciona por acaso e passa a
errada no primeiro campo inserido ao contrário.

Uma app que gera QR codes é usada por quem imprime etiquetas em produção, e
isso é trabalho com teclado e com leitores de ecrã. **Faltam os dois.**

## Fontes e cores: o que seguir

```csharp
// ERRADO — uma fonte fixa não segue quem aumentou o texto do sistema
Font = new Font("Segoe UI", 9F);
BackColor = SystemColors.Control;
```

```csharp
// CERTO — a app segue o sistema, e quem o configurou aparece como o
// configurou
Font = SystemFonts.MessageBoxFont ?? SystemFonts.DefaultFont;
```

A `AGENTS.md` é explícita sobre as cores: **o código é sempre preto sobre
branco, em qualquer tema.** Um `BackColor` que segue o sistema serve para a
caixa de diálogo, **não para o canvas do QR**.

## Como se prova que o layout está certo

Um bug de layout **não aparece em nenhum teste de payload**. A verificação é de
outra natureza, e há dois níveis que valem:

**Nível 1 — o contentor cresce.** Abrir cada categoria e afirmar que a
altura necessária cabe na disponível:

```csharp
foreach (var categoria in Todas)
{
    Abrir(categoria);
    var necessario = SomarAlturasDosCampos();
    Assert.That(necessario, Is.LessThanOrEqualTo(Disponivel),
        $"{categoria} precisa de {necessario} px e tem {Disponivel}");
}
```

**Nível 2 — a captura.** Correr a app, pôr cada categoria, e guardar um PNG
por categoria. Sem isso, o nível 1 passa com o formulário bonito e o campo
invisível — **que é exactamente o que aconteceu aqui**, e a razão de os dois
níveis irem juntos.

> **O teste tem de ser sobre cada categoria, e não sobre a que está aberta
> por omissão.** A app abre em `Link`, que tem um campo e cabe sempre. O
> problema está na décima categoria, e nenhuma abertura manual a encontra.

## O que não fazer

| Não | Porquê |
|---|---|
| Altura fixa num contentor de conteúdo variável | Corta campos, sem aviso |
| `Location` em píxeis | Não acompanha o redimensionamento |
| `int _campoY` para empilhar | É um motor de layout sem testes |
| O mesmo conjunto em duas listas | Divergem em silêncio |
| Fonte fixa | Ignora quem aumenta o texto do sistema |
| `AutoSize` numa `Label` ao lado de um campo em `x` fixo | O rótulo cresce por cima do campo |
| Texto literal em código | Não há tradução nem designer |
| Verificar só a interface no `Debug` | O problema aparece em DPI alto |

## Ao acrescentar um campo

1. Declara-o **num só sítio** — o registo único, não duas listas.
2. Põe o `AccessibleName` **e** o `AccessibleDescription`.
3. **Não lhe dês posição.** O `TableLayoutPanel` põe.
4. Corre a app e **abre essa categoria** e vê o campo.
5. Se a categoria ficou mais alta, **o painel tem de ter crescido** — e se não
   cresceu, é porque tem altura fixa, e o campo está fora.

O ponto 5 é o que teria apanhado os dois campos invisíveis, e custa dez
segundos.