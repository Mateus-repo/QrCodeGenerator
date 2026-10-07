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
    public static int Main(string[] args)
    {
        // **O modo vem num argumento, e nao de um ficheiro de configuracao.**
        // Ha dois formatos com formas de saida diferentes - a lista plana dos 1D e
        // a matriz do 2D - e um ficheiro de configuracao seria um segundo sítio
        // onde o `spec/` teria de acertar.
        //
        // **E o `--datamatrix` e' um argumento a parte, e nao mais um `tipo` nos
        // casos**, porque um Data Matrix devolve uma matriz e nao uma lista de
        // modulos: ver a nota do `DescreverMatriz`.
        // **A guarda e' estrita, e o motivo e' concreto.** O `--nologo` nao e' uma
        // opcao do `dotnet run` - e' uma do `dotnet build` - e por isso que o
        // `dotnet run` a repassa ao programa como se fosse argumento dele. Um
        // programa que le `args[0]` sem verificar recebia `--nologo` e achava que
        // o modo pedido era `--nologo`.
        //
        // **Aceitar o que nao se reconhece e' a pior forma de bug**, que a
        // `AGENTS.md` regista com o `offset` do `desenharLogotipo`: a assinatura
        // promete e o corpo ignora. Um `--datamatrx` com uma letra trocada dava
        // a saida dos 1D, que e' uma lista de modulos em vez de uma matriz - e o
        // script que o consome falhava a ler, longe do erro.
        if (args.Length > 1 || (args.Length == 1 && args[0] != ModoMatriz))
        {
            // **Os argumentos que chegaram vem na mensagem.** Um `uso:` que repete
            // o que ja se leu na linha de comando nao ajuda ninguem.
            Console.Error.WriteLine(
                $"uso: Program [--datamatrix]  (casos em JSON por stdin); "
                    + $"recebi: [{string.Join(", ", args)}]");
            return 2;
        }

        bool matriz = args.Length == 1;

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
            saida.Append(matriz ? DescreverMatriz(MatrizDe(caso)) : Descrever(CodigoDe(caso)));
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

    /// <summary>O argumento que pede a saida em matriz.</summary>
    /// <remarks>
    /// <b>E' uma constante e nao um literal repetido</b> - o nome aparece na
    /// comparacao, na mensagem de uso e no script do <c>spec/</c>, e tres sitios
    /// com a mesma cadeia e' tres sitios onde trocar um nome deixa dois a falar de
    /// coisas diferentes.
    /// </remarks>
    private const string ModoMatriz = "--datamatrix";

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
    /// Um caso de Data Matrix, que e' <c>[tipo, texto, {opcoes}]</c> como os
    /// outros e devolve uma coisa diferente.
    /// </summary>
    /// <remarks>
    /// <para><b>O <c>tipo</c> existe mesmo com so um Data Matrix.</b> E' a mesma
    /// forma que a lista partilhada usa para os 1D, e um dia entra aqui o GS1 Data
    /// Matrix - que nao e' um encoder novo, e' o mesmo com uma lista de codewords
    /// em vez de um texto.</para>
    /// </remarks>
    private static CodigoMatriz MatrizDe(JsonElement caso)
    {
        string tipo = caso[0].GetString()!;

        if (tipo == "datamatrix")
        {
            return DataMatrix.Gerar(caso[1].GetString()!);
        }

        if (tipo == "gs1-datamatrix")
        {
            var opcoes = caso.GetArrayLength() > 2 ? caso[2] : default;

            if (opcoes.ValueKind != JsonValueKind.Object
                || !opcoes.TryGetProperty("codewords", out var brutos))
            {
                throw new ArgumentException("o caso gs1-datamatrix nao traz 'codewords'");
            }

            var codewords = new int[brutos.GetArrayLength()];
            int i = 0;
            foreach (var bruto in brutos.EnumerateArray())
            {
                codewords[i++] = bruto.GetInt32();
            }

            string nome = opcoes.TryGetProperty("nome", out var n) ? n.GetString()! : "GS1 Data Matrix";
            return DataMatrix.GerarDeCodewords(codewords, nome);
        }

        throw new ArgumentException("tipo desconhecido: " + tipo);
    }

    /// <summary>
    /// Passa um <see cref="CodigoMatriz"/> para JSON.
    /// </summary>
    /// <remarks>
    /// <para><b>Os modulos saem como 0 e 1</b>, pelo mesmo motivo que em
    /// <see cref="Descrever"/>: o script compara posicao a posicao.</para>
    ///
    /// <para><b>A matriz sai como lista de linhas, e nao achatada.</b> E' o que
    /// separa um <c>datamatrix</c> de um <c>DataMatrix</c>: no achatado o script
    /// nao sabe onde muda a linha, e uma divergencia dizia "o modulo 137" em vez
    /// de dizer "(linha 8, modulo 9)" - que e' onde o problema esta'. <b>Um formato
    /// que nao descreve a coisa faz o teste medir outra coisa</b>, que e' o que a
    /// <c>AGENTS.md</c> regista com o <c>ComboBox</c> do C#.</para>
    /// </remarks>
    private static string DescreverMatriz(CodigoMatriz codigo)
    {
        var linhas = new StringBuilder("[");
        for (int y = 0; y < codigo.Linhas; y++)
        {
            if (y > 0)
            {
                linhas.Append(',');
            }

            var modulos = new StringBuilder("[");
            for (int x = 0; x < codigo.Colunas; x++)
            {
                if (x > 0)
                {
                    modulos.Append(',');
                }

                modulos.Append(codigo.Modulos[y, x] ? '1' : '0');
            }

            modulos.Append(']');
            linhas.Append(modulos);
        }

        linhas.Append(']');

        return $"{{\"modulos\":{linhas},"
            + $"\"colunas\":{codigo.Colunas},"
            + $"\"linhas\":{codigo.Linhas},"
            + $"\"dados\":{codigo.Dados},"
            + $"\"correccao\":{codigo.Correccao},"
            + $"\"usado\":{codigo.Usado}}}";
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
