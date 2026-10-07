using System.Reflection;
using QrCodeGenerator.Core.Simbologias;
using Xunit;

namespace QrCodeGenerator.Tests;

/// <summary>
/// A codificacao do texto, e por que este teste existe.
/// </summary>
/// <remarks>
/// <para><strong>Um encoder so entra no repositorio depois de o ZXing devolver a
/// cadeia certa</strong> - e o ZXing le-o, sem este teste. Este mede outra coisa,
/// que o leitor nao mede: <b>o que o codigo diz, e nao o que ele produz nesta
/// maquina.</b></para>
///
/// <para><b>Porque um teste de leitura nao chega aqui.</b>
/// <c>Encoding.Default</c> num .NET Framework e' a codificacao do sistema, e a
/// mesma cadeia dava um codigo diferente numa maquina portuguesa e numa
/// americana. Introduziu-se o bug de proposito e o teste de leitura <b>nao o
/// apanhou</b>: com o runtime moderno o default ja e' UTF-8, e o resultado nesta
/// maquina e' o certo. Numa maquina com outra default o encoder produzia um
/// codigo diferente - que e' a forma mais cara de divergencia que existe, porque
/// so aparece em producao e so num sistema.</para>
///
/// <para><b>Porque a defesa e' ler o fonte.</b> Este teste nao executa o encoder:
/// le a fonte e procura a chamada sem argumento. E' uma defesa imperfeita - uma
/// refatoracao pode mudar a forma da chamada sem mudar o que se procura - <b>e e' a
/// unica que apanha um erro de argumento numa chamada</b>. Um teste que executa mede
/// o resultado, e o resultado nesta maquina e' o certo.</para>
///
/// <para>A <c>AGENTS.md</c> regista o mesmo padrao no <c>frameqr-centragem</c> do
/// web: um teste que prova que uma peca esta boa nao prova que a maquina liga. O
/// bug vivia na <em>chamada</em>, e nenhum teste que executasse a peca a via.</para>
///
/// <para><b>As stacks Java e Kotlin tem este teste com o mesmo nome e a mesma
/// razao</b>, e e' a terceira vez que o mesmo bug aparece em tres stacks.</para>
/// </remarks>
public class CodificacaoDataMatrixTests
{
    /// <summary>
    /// O caminho da fonte do encoder.
    /// </summary>
    /// <remarks>
    /// <b>Procurado a subir, e nao escrito.</b> O runner pode correr na raiz do
    /// repositorio, em <c>csharp/</c> ou na pasta de saida, e um caminho escrito a
    /// mao passava num sitio e falhava no outro - que e' o tipo de teste que se
    /// apaga por estar a dar trabalho sem dizer nada.
    /// </remarks>
    private static string FonteDoEncoder()
    {
        string[] relativo =
        {
            Path.Combine("csharp", "core", "Simbologias", "DataMatrix.cs"),
            Path.Combine("core", "Simbologias", "DataMatrix.cs"),
        };

        var pasta = new DirectoryInfo(
            Directory.GetCurrentDirectory().TrimEnd(Path.DirectorySeparatorChar));

        while (pasta is not null)
        {
            foreach (string caminho in relativo)
            {
                string completo = Path.Combine(pasta.FullName, caminho);
                if (File.Exists(completo))
                {
                    return completo;
                }
            }

            pasta = pasta.Parent;
        }

        throw new InvalidOperationException(
            $"nao encontrei DataMatrix.cs a subir de {Directory.GetCurrentDirectory()}");
    }

    /// <summary>
    /// As linhas do encoder <b>sem os comentarios</b>.
    /// </summary>
    /// <remarks>
    /// <b>Sem isto o teste falha contra si proprio</b>, e falhou nas stacks Java e
    /// Kotlin: a nota que explica porque o <c>GetBytes()</c> sem argumento e'
    /// errado esta escrita em cima da linha do <c>GetBytes()</c>, e a busca
    /// encontra a nota. Um teste de fonte que le comentarios apanha o que o
    /// comentario diz e nao o que o codigo faz - <b>e o pior dos dois erros</b>,
    /// porque a correccao natural e' reescrever o comentario, que e' mudar a
    /// documentacao para o teste passar.
    /// </remarks>
    private static List<string> LinhasDeCodigo() =>
        File.ReadAllLines(FonteDoEncoder(), System.Text.Encoding.UTF8)
            .Select(linha =>
            {
                int comentario = linha.IndexOf("//", StringComparison.Ordinal);
                return comentario >= 0 ? linha[..comentario] : linha;
            })
            .Where(linha =>
            {
                string limpa = linha.Trim();
                return !limpa.StartsWith("//")
                    && !limpa.StartsWith("*")
                    && !limpa.StartsWith("/*");
            })
            .ToList();

    [Fact]
    public void OEncoderPedeUtf8PeloNomeENaoACodificacaoDaPlataforma()
    {
        var semArgumento = LinhasDeCodigo()
            .Where(l => l.Contains("GetBytes()", StringComparison.Ordinal))
            .ToList();

        Assert.True(
            semArgumento.Count == 0,
            "o encoder chama GetBytes() sem argumento, e isso usa a codificacao da "
            + "plataforma. Com o runtime moderno o resultado e' o mesmo nesta maquina "
            + "- e noutra maquina nao e'. As linhas sao:\n"
            + string.Join("\n", semArgumento));
    }

    [Fact]
    public void OEncoderPassaUtf8DeFormaExplicitaAoCompactar()
    {
        string fonte = File.ReadAllText(FonteDoEncoder(), System.Text.Encoding.UTF8);

        Assert.True(
            fonte.Contains("Encoding.UTF8", StringComparison.Ordinal),
            "o DataMatrix.cs nao menciona Encoding.UTF8 em lado nenhum. Se o "
            + "GetBytes() sem argumento desapareceu por outra via, esta e' a prova "
            + "de que o UTF-8 explicito foi perdido com ele.");
    }
}