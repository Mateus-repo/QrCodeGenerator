# WinForms: construir o formulário

Como substituir a contagem de píxeis por um layout que cresce com o conteúdo, e
o mínimo de acessibilidade que uma app de produção precisa.

O diagnóstico do que está errado hoje está em `diagnostico.md`. Este ficheiro é
o outro lado: **o que fazer em vez disso.**

## O esqueleto

Um formulário com duas colunas e uma linha por campo:

```csharp
var raiz = new TableLayoutPanel
{
    ColumnCount = 2,
    RowCount = 1,
    Dock = DockStyle.Fill,
    Padding = new Padding(16),
    AutoSize = true,
    ColumnStyles =
    {
        // **Absoluto para a coluna dos rótulos, e a razão está no texto.**
        new ColumnStyle(SizeType.Absolute, 110),
        new ColumnStyle(SizeType.Percent, 100),
    },
};
raiz.Controls.Add(rotuloCategoria, 0, 0);
raiz.Controls.Add(comboCategoria, 1, 0);
raiz.RowCount++;
```

Duas decisões que merecem explicação:

**`SizeType.Absolute` na primeira coluna.** Um rótulo longo como "Código postal"
precisa de 110 px; um curto como "Nome" desperdiça o resto. **Com `AutoSize` a
largura é do texto e as linhas ficam irregulares** — e é o que acontece hoje, em
que os rótulos estão em `x = 0` e os campos em `x = 90`: um "País" tem 25 px e
sobra 65, e um "Código postal" tem 80 e quase encosta.

**`SizeType.Percent` na segunda.** A coluna dos campos acompanha a janela, que é
o que `ClientSize = new Size(940, 600)` não faz — porque as posições não têm
`Anchor` e portanto não acompanham nada.

## Acrescentar uma linha

```csharp
static void AcrescentarLinha(TableLayoutPanel painel, Label rotulo, Control campo)
{
    rotulo.AutoSize = true;
    rotulo.Anchor = AnchorStyles.Left;
    rotulo.Text = rotulo.Text.TrimEnd(':');   // ver "os dois pontos" abaixo

    campo.Dock = DockStyle.Fill;
    campo.Margin = new Padding(0, 3, 0, 3);

    painel.Controls.Add(rotulo, 0, painel.RowCount);
    painel.Controls.Add(campo, 1, painel.RowCount);
    painel.RowCount++;
}
```

**`RowCount++` no fim e nunca mais mexer.** É a diferença entre isto e
`_fieldY`: aqui não há um inteiro que alguém tem de和维护, e a ordem de
inserção é a ordem visual.

### Os dois pontos

```csharp
// ERRADO — o ':' está no texto, e o `TrimEnd` desfaz o que o `:` fez
rotulo.Text = "Nome:";

// CERTO — o `:` é o `Label` que o desenha, e desaparece com ele
rotulo.Text = "Nome";
rotulo.UseMnemonic = false;
```

Com `UseMnemonic = true`, que é o omissão, o `&` do texto vira accelerators e
o Windows sublinha a letra seguinte. **Num formulário com 43 campos isso faz o
texto piscar nos pontos de interrogação de OUTROS campos.** É o defeito mais
visível de uma app WinForms feita à pressa, e não aparece em nenhum teste.

## Áreas que crescem

O `Panel` de altura fixa é a causa dos campos perdidos. As duas saídas:

```csharp
// A — o contentor cresce com o conteúdo
var painel = new TableLayoutPanel
{
    ColumnCount = 2,
    AutoSize = true,
    AutoSizeMode = AutoSizeMode.GrowAndShrink,
    Dock = DockStyle.Top,
};
painel.Padding = new Padding(0, 0, 0, 12);

// B — o contentor tem tamanho fixo e rola
var painel = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
```

**A é melhor** quando o formulário inteiro cresce com a janela. **B é necessária**
quando o formulário é mais alto do que o ecrã — e aí a pergunta é se não deve
ser `B` desde o início, porque o número de campos **cresce**.

> **Escolher pela contagem, e não pelo estética.** Com 43 campos e uma
> categoria com 11, a resposta é `B`. Num formulário com 4 campos, é `A`.

## Datas e números

`DateTimePicker` e as máscaras de telefone estão fora do que o WinForms faz
sozinho, e são a origem de dois bugs que só aparecem no payload:

```csharp
// A data é um DateTime local, e o QR tem de levar a hora flutuante.
var inicio = _dtpInicio.Value;
```

**O `AGENTS.md` regista este bug duas vezes**, em C# e em Java: o código
convertia a hora para UTC e escrevia o `Z`, e o resultado tinha **uma hora de
diferença** entre o que a pessoa preencheu e o que o telemóvel leu. O sintoma é
um evento que aparece à hora errada, e nenhum teste estrutural o vê — porque o
teste afirmava o bug.

Ver `csharp/core/QrPayloadBuilder.cs`, que tem `stamp()` sem `Z` e um
`semFuso()`.

## Acessibilidade: o mínimo

```csharp
foreach (Control c in TodosOsCampos())
{
    c.TabStop = true;              // mesmo que verdadeiro, explícito
    c.AccessibleName = RotuloDe(c); // o que o leitor de ecrã anuncia
    c.AccessibleDescription = AjudaDe(c);
}
```

**`TabIndex` explícito, pela ordem visual.** Sem isso a ordem é a ordem de
adição ao `Controls`, que funciona até alguém inserir um campo ao contrário.

E `AccessibleName` não é um extra: **uma app que imprime etiquetas é usada por
quem trabalha em produção**, e isso é teclado e leitor de ecrã.

## Fontes: seguir o sistema

```csharp
// ERRADO — não segue quem aumentou o texto por reasons de acessibilidade
Font = new Font("Segoe UI", 9F);

// CERTO
Font = SystemFonts.MessageBoxFont ?? SystemFonts.DefaultFont;
```

E **o `AutoScaleMode` fica explícito**, mesmo tendo um valor por omissão:

```csharp
AutoScaleMode = AutoScaleMode.Font;
AutoScaleDimensions = new SizeF(96F, 12F);
```

Sem o `AutoScaleDimensions`, o WinForms não sabe a que resolução o formulário
foi desenhado e **numa tela a 150% os controlos não escalam** — ficam pequenos
dentro de um formulário maior, que é o oposto do que se queria.

## Cores

```csharp
// O canvas é sempre preto sobre branco, em qualquer tema.
_preview.BackColor = Color.White;

// O resto da janela segue o sistema.
BackColor = SystemColors.Control;
```

A `AGENTS.md` é explícita: **o QR é sempre preto sobre branco**, e há um teste
que falha se um tema tocar nas cores do canvas. Um `BackColor` que segue o
sistema **para a moldura é correcto e para o canvas não é**.

## Ao rever um formulário: as perguntas

1. **Todos os campos chegam?** Abrir cada categoria e ver o último campo. Não
   só a primeira.
2. **Isto cresce com o conteúdo?** Se o número de campos pode aumentar, o
   contentor também pode.
3. **Isto acompanha a janela?** Redimensionar e ver se algo fica fora.
4. **Isto tem nome acessível?** Percorrer com o leitor de ecrã.
5. **Isto segue a fonte do sistema?** Aumentar o texto do sistema e ver.
6. **Os `&` não estão a piscar?** Fazer `Tab` pelo formulário e ver se algum
   texto fica sublinhado ao acaso.