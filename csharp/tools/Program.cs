using System.Text;
using System.Text.Json;
using QrCodeGenerator.Core.Simbologias;

namespace QrCodeGenerator.Tools;

/// <summary>
/// Le uma lista de casos de codigos de barras e escreve os modulos em JSON.
/// </summary>
/// <remarks>
/// <para>Existe para o <c>spec/paridade-csharp.mjs</c>: e' a ponta de C# da
/// comparacao que decide se o C# e o Python produzem a mesma coisa. <b>O
/// comprimento pode ser igual e a silhueta errada</b>, e so a comparacao dos
/// modulos as distingue.</para>
///
/// <para><b>Os casos vao por stdin.</b> Passar JSON num argumento e' fragil: o Git
/// Bash faz expansao de chaves em <c>{"inicio":"B"}</c> e parte o array ao meio,
/// porque a virgula dentro das chaves parece uma lista. Por stdin nao ha shell a
/// mexer no meio.</para>
///
/// <para><b>E o stdout tem de ficar limpo.</b> O script le a resposta e faz
/// <c>JSON.parse</c>, pelo que um aviso do runtime no mesmo sitio parte a leitura
/// com um erro que nao fala de JSON. Por isso e' um projecto de consola e nao uma
/// app Windows, e a saida e' escrita com <see cref="Console"/> sem <c>AttachToParent</c>.</para>
///
/// <para><b>O que nao faz:</b> mandar o ZXing ler o resultado. O ZXing le a
/// matriz, e a matriz e' o que se compara aqui; a leitura esta nos testes, e ai sim
/// e' o encoder que desenha.</para>
/// </remarks>
public static class Program
{
    public static int Main()
    {
        string entrada = Console.In.ReadToEnd();
        var casos = JsonDocument.Parse(entrada).RootElement;

        var saida = new StringBuilder("[");
        bool primeiro = true;

        foreach (var caso in casos.EnumerateArray())
        {
            if (!primeiro)
            {
                saida.Append(',');
            }

            primeiro = false;
            saida.Append(Descrever(CodigoDe(caso)));
        }

        saida.Append(']');

        // **Sem `Console.WriteLine` com UTF-8 explicito.** A saida e' ASCII — sao
        // digitos, virgulas e a legenda, que no maximo tem acentos — e o
        // `Console.Out` ja escreve na codificacao da consola. Passar
        // `new UTF8Encoding(false)` aqui introduzia um BOM que o `JSON.parse` do
        // Node rejeita.
        Console.Out.Write(saida.ToString());
        return 0;
    }

    /// <summary>Um caso e' <c>[tipo, texto, {opcoes}]</c>.</summary>
    private static CodigoDeBarras CodigoDe(JsonElement caso)
    {
        string tipo = caso[0].GetString()!;
        string texto = caso[1].GetString()!;

        // **O objeto de opcoes e' opcional.** O script manda-o sempre, mas uma
        // lista escrita a mao pode nao mandar, e um `caso[2]` sem ele levanta.
        // `GetArrayLength()` em vez de `Length`, que e' o que o `JsonElement` da.
        var opcoes = caso.GetArrayLength() > 2 ? caso[2] : default;

        // **Uma opcao que nao esta e' o valor por omissao, e nao um erro.** E' o
        // que torna a lista de casos partilhavel entre stacks com APIs
        // diferentes: o Kotlin e o Java tem overloads, e aqui um nome que
        // resolve para o valor por omissao do encoder.
        string Opcao(string nome, string porOmissao) =>
            opcoes.ValueKind != JsonValueKind.Object || !opcoes.TryGetProperty(nome, out var v)
                ? porOmissao
                : v.GetString()!;

        bool Bandeira(string nome) =>
            opcoes.ValueKind == JsonValueKind.Object
            && opcoes.TryGetProperty(nome, out var v)
            && v.GetBoolean();

        return tipo switch
        {
            "code39" => Lineares.Code39(texto),
            "itf" => Lineares.Itf(texto),
            "itf14" => Lineares.Itf14(texto),
            "codabar" => Lineares.Codabar(
                texto,
                inicio: Opcao("inicio", "A"),
                paragem: Opcao("paragem", "A"),
                largo: Bandeira("largo")),
            "code128" => Code128.Gerar(texto),
        "code93" => Code93.Codificar(texto),
            _ => throw new ArgumentException("tipo desconhecido: " + tipo),
        };
    }

    /// <summary>
    /// Passa um <see cref="CodigoDeBarras"/> para JSON.
    /// </summary>
    /// <remarks>
    /// <b>Os modulos saem como 0 e 1, e nao como <c>true</c> e <c>false</c>.</b> O
    /// Python devolve <c>bool</c> e o leitor de JSON aceita um numero onde quer um
    /// booleano, mas o outro sentido nao tem garantia: o script compara posicao a
    /// posicao, e um <c>true</c> onde se espera um <c>1</c> contaria como divergencia
    /// num codigo que esta certo. <b>0 e 1 nos dois lados e' o unico valor que nao da
    /// duvida</b>, e nao uma escolha de taste.
    /// </remarks>
    private static string Descrever(CodigoDeBarras codigo)
    {
        var modulos = new StringBuilder("[");
        for (int i = 0; i < codigo.Modulos.Length; i++)
        {
            if (i > 0)
            {
                modulos.Append(',');
            }

            modulos.Append(codigo.Modulos[i] ? '1' : '0');
        }

        modulos.Append(']');

        var guardas = new StringBuilder("[");
        for (int i = 0; i < codigo.Guardas.Length; i++)
        {
            if (i > 0)
            {
                guardas.Append(',');
            }

            guardas.Append(codigo.Guardas[i]);
        }

        guardas.Append(']');

        return $"{{\"modulos\":{modulos},"
            + $"\"legenda\":{JsonSerializer.Serialize(codigo.Legenda)},"
            + $"\"guardas\":{guardas}}}";
    }
}
