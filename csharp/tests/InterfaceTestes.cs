using System.Drawing;
using System.Windows.Forms;
using QrCodeGenerator.Core;
using QrCodeGenerator.Core.Simbologias;
using Xunit;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nível 2 da interface: <b>a app é aberta, cada categoria é posta, e
/// afirma-se que nenhum campo fica fora do alcance.</b>
/// </summary>
/// <remarks>
/// <para><b>Este teste é o que teria apanhado os três campos do VCard.</b> Eram
/// inalcançáveis — por baixo do fundo de um painel de 280 px, sem barra e sem
/// atalho — e ninguém reparou porque <b>os 188 testes existentes só olham para o
/// payload</b>. O código estava certo, o desenho estava errado, e nenhum teste
/// desenhava.</para>
///
/// <para><b>O invariante não é "o painel tem `AutoScroll`".</b> Esse seria testar
/// uma propriedade, e passaria mesmo que o conteúdo não coubesse e não houvesse
/// barra nenhuma. O invariante é o que interessa: <b>se o conteúdo não cabe, tem
/// de haver forma de lá chegar</b>. É esse que se afirma, e o `AutoScroll` é a
/// consequência.</para>
///
/// <para><b>Um `Form` precisa de um `STAThread`</b>, e o runner do xUnit é
/// `MTA`. Por isso o corpo corre numa thread dedicada — e é por isso que este
/// ficheiro tem um `Com` em vez de uma theory: <b>a construção do formulário é
/// mais cara do que o teste</b>, e fazê-la por categoria seria abrir catorze
/// vezes a mesma janela.</para>
/// </remarks>
public class InterfaceTestes
{
    /// <summary>
    /// Corre o teste num thread de interface, e é o que torna o `Form` legal.
    /// </summary>
    private static void NumaThreadDeInterface(Action accao)
    {
        Exception? falha = null;

        var thread = new Thread(() =>
        {
            try
            {
                accao();
            }
            catch (Exception e)
            {
                falha = e;
            }
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (falha is not null)
        {
            throw falha;
        }
    }

    [Fact]
    public void NenhumCampoFicaForaDoAlcance()
    {
        NumaThreadDeInterface(() =>
        {
            using var form = new QrCodeGenerator.MainForm();
            var host = HostDosCampos(form);

            foreach (QrCategory categoria in Enum.GetValues<QrCategory>())
            {
                MudarCategoria(form, categoria);

                int necessario = 0;
                int maiorCampo = 0;

                foreach (Control campo in host.Controls)
                {
                    // **O fundo do campo, e nao a sua posicao.** Um campo que
                    // comece acima do fundo e acabe abaixo é cortado ao meio e
                    // lê-se a metade.
                    int fundo = campo.Bottom;
                    necessario = Math.Max(necessario, fundo);
                    maiorCampo = Math.Max(maiorCampo, campo.Height);
                }

                Assert.True(
                    maiorCampo > 0,
                    $"{categoria}: a categoria nao pôs nenhum campo");

                // **O invariante.** Não cabe e não há forma de chegar lá, é um
                // campo que a pessoa não consegue preencher, e é um bug de dados
                // perdido sem nenhuma mensagem.
                Assert.True(
                    necessario <= host.ClientSize.Height || host.AutoScroll,
                    $"{categoria}: precisa de {necessario} px e o painel tem "
                    + $"{host.ClientSize.Height}, sem `AutoScroll`. "
                    + "Os campos de baixo são inalcançáveis.");
            }
        });
    }

    [Fact]
    public void AVcardCabeSemBarra()
    {
        // **A categoria maior é a que ustou a ter o problema, por isso é a que
        // este teste afirma com número.** VCard tem 11 campos de 36 px.
        NumaThreadDeInterface(() =>
        {
            using var form = new QrCodeGenerator.MainForm();
            var host = HostDosCampos(form);

            MudarCategoria(form, QrCategory.VCard);

            int necessario = 0;
            foreach (Control campo in host.Controls)
            {
                necessario = Math.Max(necessario, campo.Bottom);
            }

            Assert.True(
                necessario <= host.ClientSize.Height,
                $"VCard precisa de {necessario} px e o painel tem "
                + $"{host.ClientSize.Height}: a barra de scroll entra mesmo "
                + "para uma categoria que não precisa dela.");
        });
    }

    [Fact]
    public void OsLabelsNaoInvademOCampo()
    {
        // **O outro defeito do mesmo ficheiro:** os rótulos estão em `x = 0` e os
        // campos em `x = 90`. Um "País" tem 25 px e sobra 65; um "Código postal"
        // tem 80 e quase encosta. Aqui o que se afirma é que nenhum rótulo passa
        // do início do campo — que é a condição para os dois não se sobreporem.
        NumaThreadDeInterface(() =>
        {
            using var form = new QrCodeGenerator.MainForm();
            var host = HostDosCampos(form);

            foreach (QrCategory categoria in Enum.GetValues<QrCategory>())
            {
                MudarCategoria(form, categoria);

                foreach (Control rotulo in host.Controls)
                {
                    if (rotulo is not Label)
                    {
                        continue;
                    }

                    foreach (Control campo in host.Controls)
                    {
                        // **O rotulo so colide com o campo, nunca com outro
                        // rotulo.** Os dois estao na mesma coluna de `x = 0`, e
                        // comparar um com o outro dava sempre um falso positivo:
                        // acabava em 26 e o seguinte comecava em 0.
                        if (campo is Label || campo == rotulo)
                        {
                            continue;
                        }

                        // **Sobrepor é uma pergunta de duas dimensões.** Dois
                        // controlos que partilham `x = 0` mas estão em linhas
                        // diferentes não se cruzam, e o WiFi tem esse caso: o
                        // rótulo do primeiro campo e a caixa do último.
                        //
                        // Só comparar os X dava um falso positivo por uma
                        // categoria que estava bem.
                        bool cruzam =
                            rotulo.Right > campo.Left && rotulo.Left < campo.Right
                            && rotulo.Bottom > campo.Top && rotulo.Top < campo.Bottom;

                        Assert.True(
                            !cruzam,
                            $"{categoria}: o rótulo \"{rotulo.Text}\" ocupa "
                            + $"({rotulo.Left},{rotulo.Top})-({rotulo.Right},{rotulo.Bottom})"
                            + $" e o campo ocupa ({campo.Left},{campo.Top})-"
                            + $"({campo.Right},{campo.Bottom}) — cruzam.");
                    }
                }
            }
        });
    }

    // --- o queprecisa de saber o formulário -------------------------------

    /// <summary>
    /// O painel que tem os campos.
    /// </summary>
    /// <remarks>
    /// Procura-se pelo <b>tipo de painel com mais do que um filho depois de uma
    /// categoria estar posta</b>, e não por um nome — que o formulário é uma
    /// classe privada e o seu campo é privado. Um teste que reacha por reflexão
    /// para o campo `_fieldHost` parte no dia em que o campo muda de nome, e a
    /// forma de o procurar não parte amanhã.
    /// </remarks>
    private static Panel HostDosCampos(Form form)
    {
        foreach (Control control in form.Controls)
        {
            if (control is Panel painel && painel.Controls.Count > 1)
            {
                return painel;
            }
        }

        throw new InvalidOperationException(
            "não encontrei o painel dos campos: o formulário põe "
            + $"{form.Controls.Count} controlos no topo.");
    }

    /// <summary>
    /// Põe a categoria, e é preciso ser pelo índice.
    /// </summary>
    /// <remarks>
    /// <b>`SelectedItem` não serve aqui.</b> O combo está preenchido com
    /// `QrCategoryNames.All`, que são <b>cadeias</b>, e atribuir um enum não
    /// corresponde a nenhum item — o WinForms ignora em silêncio e o índice fica
    /// no 0. O teste corria então sobre `Link` nas onze iterações, com um campo
    /// que cabe sempre, e o <c>AutoScroll</c> nunca era posto a prova.
    /// <para>
    /// <b>É pelo índice porque é assim que o formulário lê:</b> o
    /// `RebuildFields` faz <c>(QrCategory)_cmbCategory.SelectedIndex</c>, e o
    /// índice é o valor do enum.
    /// </para>
    /// </remarks>
    private static void MudarCategoria(Form form, QrCategory categoria)
    {
        var combo = (ComboBox)form.Controls.OfType<ComboBox>()
            .First(c => c.Items.Count == Enum.GetValues<QrCategory>().Length);

        combo.SelectedIndex = (int)categoria;

        Assert.True(
            combo.SelectedIndex == (int)categoria,
            $"a categoria {categoria} nao ficou posta — sem o "
            + "`RebuildFields`, o teste passa a olhar para a categoria anterior.");
    }
}
