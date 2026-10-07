namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// O resultado de uma simbologia <strong>bidimensional</strong>.
/// </summary>
/// <remarks>
/// <para><strong>E' um tipo a parte, e nao <see cref="CodigoDeBarras"/> com a
/// matriz achatada.</strong> Nao e' por haver mais um campo: e' porque as duas
/// coisas que os separam nao sao opcoes.</para>
///
/// <para><b>As guardas nao existem.</b> Num codigo de barras as guardas sao os
/// <em>indices de modulo</em> das barras que descem abaixo do corpo, e sao a ancora
/// de um leitor de mao. Num codigo 2D <strong>a orientacao vem das guias em L nas
/// pontas</strong> - uma cheia em baixo e a esquerda, outra tracejada em cima e a
/// direita - e essas guias ja estao nos modulos que o encoder devolveu. Nao ha
/// nada a acrescentar, e um <c>Guardas</c> vazio seria um campo que o desenho le e
/// nao usa.</para>
///
/// <para><b>A legenda nao existe.</b> Um EAN-13 tem os dois digitos impressos por
/// baixo do codigo, e este repositorio ja apanhou o custo de os perder: o leitor
/// funciona e a folha impressa nao bate com o que esta inscrito. Um codigo 2D nao
/// tem texto impresso por baixo.</para>
///
/// <para><strong>Um campo que existe e esta sempre vazio e' pior do que um campo
/// que nao existe</strong>, porque quem o le nao sabe se o encoder se esqueceu ou
/// se e' verdade.</para>
///
/// <para><b>A igualdade e' escrita a mao</b>, pelo mesmo motivo que o
/// <see cref="CodigoDeBarras"/> a escreve: um <c>bool[]</c> ou um
/// <c>bool[,]</c> compara por referencia, e duas matrizes identicas dariam
/// <c>false</c> na igualdade - o defeito classico de um registo com array, e um
/// teste que os comparasse falhava sem razao.</para>
/// </remarks>
public sealed class CodigoMatriz
{
    /// <param name="simbologia">O nome pedido, como <c>Data Matrix</c>.</param>
    /// <param name="modulos">
    /// A grelha, <c>modulos[y, x]</c>, com <c>true</c> onde o modulo e' escuro.
    /// </param>
    /// <param name="codewords">Os codewords de dados que o texto ocupa.</param>
    /// <param name="dados">A capacidade do simbolo escolhido, em codewords.</param>
    /// <param name="correccao">Quantos codewords de correccao o simbolo tem.</param>
    public CodigoMatriz(
        string simbologia,
        bool[,] modulos,
        int[] codewords,
        int dados,
        int correccao)
    {
        this.Simbologia = simbologia;
        this.Modulos = modulos;
        this.Codewords = codewords;
        this.Dados = dados;
        this.Correccao = correccao;
    }

    /// <summary>O nome da simbologia, como a pessoa a pede.</summary>
    public string Simbologia { get; }

    /// <summary>A grelha: <c>Modulos[y, x]</c>, <c>true</c> onde e' escuro.</summary>
    public bool[,] Modulos { get; }

    /// <summary>Os codewords de dados que o texto ocupa, antes do enchimento.</summary>
    public int[] Codewords { get; }

    /// <summary>A capacidade do simbolo escolhido, em codewords de dados.</summary>
    public int Dados { get; }

    /// <summary>Quantos codewords de correccao de erros o simbolo tem.</summary>
    public int Correccao { get; }

    /// <summary>Quantos codewords de dados o texto ocupa.</summary>
    public int Usado => Codewords.Length;

    /// <summary>O numero de colunas da grelha, guias incluidas.</summary>
    public int Colunas => Modulos.GetLength(1);

    /// <summary>O numero de linhas da grelha, guias incluidas.</summary>
    public int Linhas => Modulos.GetLength(0);

    /// <summary>
    /// A igualdade estrutural, que o registo nao da.
    /// </summary>
    public override bool Equals(object? other)
    {
        if (ReferenceEquals(this, other))
        {
            return true;
        }

        if (other is not CodigoMatriz outra)
        {
            return false;
        }

        if (Simbologia != outra.Simbologia || Dados != outra.Dados || Correccao != outra.Correccao)
        {
            return false;
        }

        if (!Codewords.AsSpan().SequenceEqual(outra.Codewords))
        {
            return false;
        }

        if (Linhas != outra.Linhas || Colunas != outra.Colunas)
        {
            return false;
        }

        for (int y = 0; y < Linhas; y++)
        {
            for (int x = 0; x < Colunas; x++)
            {
                if (Modulos[y, x] != outra.Modulos[y, x])
                {
                    return false;
                }
            }
        }

        return true;
    }

    public override int GetHashCode()
    {
        int resultado = Simbologia.GetHashCode();
        resultado = 31 * resultado + Dados;
        resultado = 31 * resultado + Correccao;
        foreach (int codeword in Codewords)
        {
            resultado = 31 * resultado + codeword;
        }
        for (int y = 0; y < Linhas; y++)
        {
            for (int x = 0; x < Colunas; x++)
            {
                resultado = 31 * resultado + (Modulos[y, x] ? 1 : 0);
            }
        }
        return resultado;
    }

    /// <summary>
    /// A grelha em texto, com <c>#</c> no escuro e <c>.</c> no claro.
    /// </summary>
    /// <remarks>
    /// <b>ASCII, e nao os blocos do terminal.</b> Um ficheiro C# com caracteres de
    /// desenho nao se abre igual em todo o lado, e a fonte da consola decide o que
    /// aparece - que e' a pior coisa para uma representacao que existe
    /// precisamente para se ver.
    ///
    /// <para><b>E' para meter na mensagem de um teste que falhou</b>, e por isso
    /// devolve uma linha por linha da grelha: um modulo solto dizia "o modulo 137"
    /// quando o que interessa e' "(linha 8, modulo 9)".</para>
    /// </remarks>
    public string ComoTexto()
    {
        var saida = new System.Text.StringBuilder((Linhas + 1) * Colunas);
        for (int y = 0; y < Linhas; y++)
        {
            for (int x = 0; x < Colunas; x++)
            {
                saida.Append(Modulos[y, x] ? '#' : '.');
            }
            saida.Append('\n');
        }
        return saida.ToString();
    }
}