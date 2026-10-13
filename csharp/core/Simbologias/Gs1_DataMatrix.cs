namespace QrCodeGenerator.Core.Simbologias;

using System.Text;

/// <summary>
/// GS1 DataMatrix.
/// </summary>
/// <remarks>
/// <para><strong>O Data Matrix com o FNC1, e nada mais.</strong> E' o que vai na
/// etiqueta de uma ampola de farmacia e de um chip: quadradinho, minusculo, e com a
/// capacidade de um simbolo que se le de longe e de lado.</para>
///
/// <para><b>O que muda em relacao ao Data Matrix</b> sao duas coisas, e as duas sao o
/// FNC1 - o codeword 232:</para>
/// <list type="number">
/// <item><description><b>No inicio</b>, logo no primeiro codeword de dados. E' o que
/// diz ao leitor "isto e' GS1" e nao texto solto.</description></item>
/// <item><description><b>No fim de cada campo de comprimento variavel</b>, menos no
/// ultimo. E' o separador, e e' o que permite ao leitor saber onde acaba
/// <c>(10)LOTE-A1</c> e onde comeca o campo seguinte.</description></item>
/// </list>
///
/// <para><b>Porque isto nao e' "o texto com um 232 a frente"</b>: o 232 e'
/// simultaneamente o FNC1 e o par de digitos "02", porque <c>232 - 130 = 102</c>. So
/// a posicao os distingue: na posicao 0 e' o FNC1, no meio e' um "02" qualquer.
/// Passar pelo <see cref="DataMatrix.Compactar"/> perderia essa estrutura, e o separador
/// no meio do lote seria lido como os digitos "02".</para>
///
/// <para>Por isso o encoder emite codewords e nao texto, e por isso que o
/// <see cref="DataMatrix.GerarDeCodewords"/> existe. Todo o resto - a escolha do
/// simbolo, o enchimento, a correccao de erros, a colocacao - <b>e' o mesmo</b> que o
/// Data Matrix normal, porque uma segunda implementacao de cada uma delas seria uma
/// segunda fonte de verdade sobre a parte que o ZXing verifica.</para>
///
/// <para><b>E a validacao dos AI vem do GS1-128, e nao e' uma copia.</b> A tabela dos
/// 541 AIs, o <c>fixo</c>, o <c>maximo</c> e o <c>regex</c> da GS1 sao os mesmos que o
/// GS1-128 usa, e vem do <see cref="Gs1_128.Analisar"/> com um rotulo. <b>Nao ha uma
/// segunda tabela de AI nem uma segunda notacao</b>: os campos de um GS1 DataMatrix sao
/// os mesmos campos de um GS1-128, e um <c>(10)</c> tem o mesmo comprimento num e no
/// outro.</para>
///
/// <para><b>Nao e' uma copia do Java nem do Kotlin.</b> A <c>AGENTS.md</c> diz que o
/// objectivo nao e' codigo partilhado entre linguagens: sao cinco implementacoes do
/// mesmo formato normalizado, e o que tem de bater e' a spec. Este ficheiro e' o mesmo
/// algoritmo com a sintaxe do C#, e nao uma traducao linha a linha - <b>e a razao de a
/// paridade existir</b>: e' ela que diz que os tres fizeram a mesma coisa, e nao que
/// este ficheiro foi copiado dos outros.</para>
/// </remarks>
public static class Gs1_DataMatrix
{
    /// <summary>O rotulo do formato, para as mensagens de recusa.</summary>
    /// <remarks>
    /// O <see cref="Gs1_128.Analisar"/> e' o mesmo para os dois formatos, e o rotulo diz
    /// qual deles esta' a ser codificado.
    /// </remarks>
    public const string Rotulo = "GS1 DataMatrix";

    /// <summary>O GS que separa os campos, o mesmo byte que o leitor devolve.</summary>
    public const char Gs = Gs1_128.Gs;

    /// <summary>
    /// O modo de digitos: emparelha e soma 130.
    /// </summary>
    /// <remarks>
    /// <para>O Data Matrix tem um modo so para numeros, em que dois digitos cabem num
    /// codeword. O GS1 usa-o para <b>os AI e para os valores numericos</b>, e e' o que
    /// torna o 232 ambiguo: o par "02" da <c>2 + 130 = 132</c>, e o FNC1 e' 232.</para>
    ///
    /// <para>Um digito que fica sem par - o ultimo de um AI com numero impar de digitos -
    /// vai no modo ASCII, o valor mais um. Nao ha outro jeito: o modo de digitos trabalha
    /// aos pares.</para>
    /// </remarks>
    internal static int[] Digitos(string texto)
    {
        var saida = new List<int>(texto.Length);
        int i = 0;

        while (i < texto.Length)
        {
            if (i + 1 < texto.Length)
            {
                saida.Add(int.Parse(texto.Substring(i, 2), System.Globalization.CultureInfo.InvariantCulture) + 130);
                i += 2;
            }
            else
            {
                saida.Add(texto[i] + 1);
                i++;
            }
        }

        return saida.ToArray();
    }

    /// <summary>O modo ASCII: o valor mais um.</summary>
    internal static int[] Ascii(string texto)
    {
        var saida = new int[texto.Length];
        for (int i = 0; i < texto.Length; i++)
        {
            saida[i] = texto[i] + 1;
        }

        return saida;
    }

    /// <summary>
    /// O codigo GS1 DataMatrix.
    /// </summary>
    /// <param name="elementoString">
    /// Os campos na forma humana da GS1, com os AI entre parenteses:
    /// <c>(01)04012345678901(10)LOTE-A1</c>. Igual ao GS1-128, e pela mesma razao - e' a
    /// forma que a GS1 define e a que a pessoa le. Os parenteses nao vao para o simbolo.
    /// </param>
    public static CodigoGs1Matriz Gerar(string elementoString)
    {
        List<CodigoGs1.Campo> campos = Gs1_128.Analisar(elementoString, Rotulo);

        // **Cada campo vai codificado conforme o que e': o AI e os valores numericos no
        // modo de digitos, o resto em ASCII.** Um `(10)LOTE-A1` da o "10" em digitos e o
        // "LOTE-A1" em ASCII, e e' essa mistura que faz o 232 ser ambiguo.
        //
        // **E o `Numerico` decide do AI e nao do valor** - o `01` e' o GTIN e e' numerico
        // por definicao, e o `10` e' o lote e e' alfanumerico.
        var valores = new List<int> { DataMatrix.Fnc1 };

        int ultimo = campos.Count - 1;
        for (int i = 0; i < campos.Count; i++)
        {
            CodigoGs1.Campo campo = campos[i];
            valores.AddRange(Digitos(campo.Ai));

            if (campo.Numerico)
            {
                valores.AddRange(Digitos(campo.Conteudo));
            }
            else
            {
                valores.AddRange(Ascii(campo.Conteudo));
            }

            // O separador vai no fim de cada campo variavel **excepto o ultimo**.
            // **Um separador no fim nao separa de nada**, e o leitor accounta-o como
            // parte do campo seguinte.
            if (campo.Separador && i != ultimo)
            {
                valores.Add(DataMatrix.Fnc1);
            }
        }

        CodigoMatriz codigo = DataMatrix.GerarDeCodewords(valores.ToArray(), Rotulo);

        return new CodigoGs1Matriz
        {
            Codigo = codigo,
            Campos = campos,
            Separadores = valores.Count(x => x == DataMatrix.Fnc1),
            Payload = Gs1_128.Maquina(campos),
            Gs1 = Gs1_128.Legivel(campos),
            Legenda = Gs1_128.Legivel(campos),
        };
    }
}