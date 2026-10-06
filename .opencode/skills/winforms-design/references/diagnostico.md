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

| Categoria | Campos | Altura | Estado |
|---|---:|---:|---|
| Link | 1 | 36 px | cabe |
| Texto | 1 | 36 px | cabe |
| Email | 3 | 108 px | cabe |
| Telefone | 2 | 72 px | cabe |
| SMS | 3 | 108 px | cabe |
| WhatsApp | 3 | 108 px | cabe |
| Evento | 5 | 180 px | cabe |
| Localização | 2 | 72 px | cabe |
| WiFi | 4 | 144 px | cabe |
| **VCard** | **11** | **396 px** | **excede 116 px** |
| **PIX** | **8** | **288 px** | **excede 8 px** |

**Num `Panel` sem `AutoScroll`, os filhos fora dos limites são cortados.** Não
há como lhes chegar com o rato nem com o teclado.

**O VCard perde os campos 9, 10 e 11.** A pessoa escreve o nome, o telefone e
o e-mail, vê o formulário calado, e concludes que o nome do campo estava
errado. Não está — está 116 px abaixo do fundo.

> **Reparar isto é `AutoScroll = true` mais `Dock = DockStyle.Fill`, e são
> quinze segundos.** O que custa é descobri-lo: a app abre em `Link`, que tem um
> campo e cabe sempre, e a primeira categoria com problema é a décima.

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

43 declarações no topo (`MainForm.cs:9-58`) e 39 `yield return` em
`FieldControls()` (`MainForm.cs:223-264`).

**Nada liga as duas listas.** Acrescentar um campo em cima e esquecer a lista de
baixo dá um campo que existe, nunca é observado, e **o código regenera com o
valor antigo sem dar erro nenhum** — que é a mesma armadilha do selector do
site que a `AGENTS.md` documenta com o GS1-128.

### `RowsFor` tem 80 linhas de `switch` com uma conversão por linha

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

- **`QrRenderer.cs` tem 92 linhas e está limpo.** Separa o desenho da
  interface, e é a razão de o código de barras não estar espalhado pelo
  formulário.
- **O `core` não tem nada a ver com isto.** `csharp/core/` é independente de
  WinForms e tem 188 testes — e nenhum deles falha por causa da interface, que
  é precisamente o que este diagnóstico vem mostrar.
- **As cores estão certas.** Não há tema escuro nem cor de fundo no canvas, e a
  `AGENTS.md` exige preto sobre branco em qualquer tema. **Não mexer.**

## A ordem que faz sentido

1. **`AutoScroll` no `_fieldHost`** — quinze segundos, e acaba com os campos
   perdidos. É o que causa dano ao utilizador.
2. **`TableLayoutPanel` em vez de `_fieldY`** — o que garante que o passo 1 não
   volta a ser preciso quando aparecer uma categoria nova.
3. **Um registo único dos 43 campos**, e as duas listas a lêrem dele.
4. **`AccessibleName` em todos os 48** e `TabIndex` explícito.
5. **`Anchor`/`Dock`**, para o formulário acompanhar a janela.
6. **Passar ao designer**, com o `resx`, o que dá pré-visualização, DPI e
   tradução de uma vez.

## Como provar cada passo

**Nenhum destes se prova num teste de payload.** O que prova:

```csharp
// O contentor cresce com o conteúdo.
foreach (var categoria in Todas)
{
    Abrir(categoria);
    var necessario = SomarAlturas();
    Assert.That(necessario, Is.LessThanOrEqualTo(_fieldHost.ClientSize.Height),
        $"{categoria} precisa de {necessario} px e o painel tem {_fieldHost.ClientSize.Height}");
}
```

E depois, **uma captura por categoria** — porque um teste de altura passa com o
formulário bonito e o campo invisível.

> **O teste tem de percorrer as onze categorias.** Abrir a que está por omissão
> dá `Link`, um campo, e verde. O problema é na décima, e nenhuma abertura
> manual a encontra.