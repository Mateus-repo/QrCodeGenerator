namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// Code 128, com os conjuntos escolhidos pelo encoder.
/// </summary>
/// <remarks>
/// <para><b>O que torna este formato diferente dos outros tres:</b> tem tres
/// conjuntos, e o encoder escolhe qual usar. Nos outros a tabela e' uma e nao ha
/// escolha; aqui a mesma letra pode valer uma coisa no conjunto A e outra no B, e
/// o codigo pode comutar a meio. E' essa liberdade que o torna compacto, e e' ela
/// que traz os caracteres de comuta.</para>
///
/// <para><b>Sem os caracteres de comuta o codigo desenha-se perfeito e o leitor
/// devolve outra coisa.</b> Foi assim que o bug apareceu da primeira vez:
/// <c>ABC123</c> voltava como <c>ABC,3</c>, porque o <c>,</c> e' o caracter de
/// comuta lido como dado. <b>Nenhum teste estrutural o apanha</b> — o codigo tem o
/// comprimento certo e a silhueta certa, e so a leitura diz.</para>
///
/// <para><b>E o digito de verificacao e' modulo 103</b>, sobre a soma ponderada: o
/// valor de inicio mais o valor de cada caracter multiplicado pela sua posicao.
/// E' o <b>resto</b> da divisao, e nao o que falta para dar inteiro — o contrario
/// do EAN-13 e do ITF-14, que sao <c>(10 - soma % 10) % 10</c>. Tres
/// simbologias, tres formulas, e a do Code 128 e' contraria das outras duas. E' por
/// isso que aqui se escreve a conta: um comentario que descreve a regra ao
/// contrario convida a "corrigir" tres stacks.</para>
/// </remarks>
public static class Code128
{
    /// <summary>Os valores de inicio, por conjunto: A, B, C.</summary>
    private static readonly int[] Inicio = { 0, 103, 104, 105 };

    /// <summary>Os valores que mudam de conjunto a meio da leitura.</summary>
    private static readonly int[] IrPara = { 0, 101, 100, 99 };

    /// <summary>O valor da paragem, que nao e' um dado.</summary>
    private const int Paragem = 106;

    /// <summary>
    /// Code 128, com os conjuntos escolhidos pelo encoder.
    /// </summary>
    /// <remarks>
    /// <b>O metodo chama-se <c>Gerar</c> e nao <c>Code128</c></b>, e a razao e'
    /// uma regra do C#: <c>CS0542</c> diz que um membro nao pode ter o nome do
    /// tipo que o enclose. O Java e o Kotlin deixam <c>Code128.code128</c> porque
    /// distinguem por maiuscula e minuscula, e nao pelo nome.
    /// <para>
    /// E' um verbo, como o <c>QrValidator.Validate</c> da mesma pasta: o nome da
    /// classe ja diz a que formato e' e o metodo diz o que faz.
    /// </para>
    /// </remarks>
    public static CodigoDeBarras Gerar(string valor) => Construir(valor, 0);

    /// <summary>Code 128, com o conjunto forcado.</summary>
    /// <param name="conjuntoForcado">`1`, `2` ou `3`; `0` deixa o encoder escolher.</param>
    public static CodigoDeBarras Gerar(string valor, int conjuntoForcado)
    {
        if ((conjuntoForcado != 0 && conjuntoForcado < 1) || conjuntoForcado > 3)
        {
            throw new SimbologiaException("Code 128: o conjunto tem de ser A, B ou C.");
        }

        return Construir(valor, conjuntoForcado);
    }

    /// <summary>
    /// O valor de um caracter ASCII dentro de um conjunto.
    /// </summary>
    /// <remarks>
    /// <b>No A, os valores 0 a 63 sao o proprio ASCII e os 64 a 95 sao as maiusculas
    /// com 32 subtraidos</b> — e' a diferenca entre o conjunto A e o B. <c>A</c>
    /// vale 33 no A e 65 no B, e e' essa diferenca que torna a troca de conjunto
    /// obrigatoria em vez de opcional.
    /// </remarks>
    private static int ValorNoConjunto(char c, int conjunto)
    {
        int codigo = c;
        return conjunto == 1
            ? (codigo <= 63 ? codigo : codigo - 32)
            : codigo - 32;
    }

    private static bool EhDigito(char c) => c >= '0' && c <= '9';

    /// <summary>
    /// O conjunto em que vale a pena codificar a partir desta posicao.
    /// </summary>
    /// <remarks>
    /// <b>Dois digitos seguidos vao em C</b>, porque dois caracteres cabem num so
    /// valor de 0 a 99. <b>Um digito isolado nao:</b> sair de B para C e voltar
    /// custa tres caracteres para gravar um, e o codigo fica maior sem ganho.
    /// </remarks>
    private static int MelhorConjunto(string texto, int i)
    {
        if (i + 1 < texto.Length && EhDigito(texto[i]) && EhDigito(texto[i + 1]))
        {
            return 3;
        }

        return texto[i] < 32 ? 1 : 2;
    }

    /// <summary>Com que conjunto se comeca.</summary>
    /// <remarks>
    /// <b>So o C vale a pena quando ha quatro digitos seguidos</b> — ai cada par
    /// gasta um caracter em vez de dois, e o ganho paga a troca. Com dois digitos o C
    /// poupa um caracter e a troca custa um: fica igual, e nao vale a pena.
    /// <para>
    /// <b>O A so quando o texto comeca por um controlo.</b> As maiusculas vivem em A e
    /// em B com o mesmo valor, e o B tambem transporta os minusculos, portanto
    /// comecar em A para uma letra nao traria nada.
    /// </para>
    /// </remarks>
    private static int ConjuntoInicial(string texto)
    {
        if (texto[0] < 32)
        {
            return 1;
        }

        for (int i = 0; i + 3 < texto.Length; i++)
        {
            bool quatro = true;
            for (int k = 0; k < 4; k++)
            {
                if (!EhDigito(texto[i + k]))
                {
                    quatro = false;
                    break;
                }
            }

            if (quatro)
            {
                return 3;
            }
        }

        return 2;
    }

    /// <summary>
    /// O texto na lista de valores, ja com as trocas de conjunto.
    /// </summary>
    /// <remarks>
    /// A cada posicao pergunta-se qual e' o melhor conjunto para o que vem a
    /// seguir, e se for diferente do em que estamos emite-se o caracter de troca.
    /// </remarks>
    private static int[] Valores(string texto, int conjuntoForcado)
    {
        int conjunto = conjuntoForcado > 0 ? conjuntoForcado : ConjuntoInicial(texto);
        var saida = new List<int> { Inicio[conjunto] };

        int i = 0;
        while (i < texto.Length)
        {
            int desejado = conjuntoForcado > 0 ? conjuntoForcado : MelhorConjunto(texto, i);

            if (desejado != conjunto)
            {
                saida.Add(IrPara[desejado]);
                conjunto = desejado;
            }

            if (conjunto == 3)
            {
                saida.Add(int.Parse(texto.Substring(i, 2)));
                i += 2;
            }
            else
            {
                saida.Add(ValorNoConjunto(texto[i], conjunto));
                i += 1;
            }
        }

        return saida.ToArray();
    }

    private static CodigoDeBarras Construir(string valor, int conjuntoForcado)
    {
        string texto = valor ?? "";

        if (texto.Length == 0)
        {
            throw new SimbologiaException("Code 128: o texto esta vazio.");
        }

        foreach (char c in texto)
        {
            if (c == 128)
            {
                throw new SimbologiaException(
                    "Code 128: o valor 128 e' o da paragem e nao pode estar nos dados.");
            }

            if (c > 127)
            {
                throw new SimbologiaException(
                    "Code 128: so ASCII, e '" + c + "' (U+"
                    + ((int)c).ToString("X4") + ") nao e. "
                    + "Para acentos e alfabetos nao latinos use o QR.");
            }
        }

        int[] dados = Valores(texto, conjuntoForcado);

        int soma = dados[0];
        for (int i = 1; i < dados.Length; i++)
        {
            soma += dados[i] * i;
        }

        int verificacao = soma % 103;

        var grelha = new List<bool>();
        foreach (int d in dados.Append(verificacao).Append(Paragem))
        {
            grelha.AddRange(ModulosDoValor(d));
        }

        // **Sem guardas.** O Code 128 nao tem barras-guarda como o EAN, e a barra
        // final da paragem e' a referencia. Marca-las fazia-as descer mais do que o
        // leitor espera — um `guardas` de `[0, len-1]` dava um codigo que o ZXing lia
        // e um leitor de etiqueta recusava.
        return new CodigoDeBarras("Code 128", grelha.ToArray(), Array.Empty<int>(), texto);
    }

    /// <summary>Os modulos de um valor, alternando barra e espaco a partir da barra.</summary>
    /// <remarks>
    /// <b>A posicao e' que diz a cor, e nao o digito da cadeia</b> — a cadeia so tem
    /// <c>0</c> e <c>1</c> para dizer a largura, e a barra inicial e' sempre barra.
    /// </remarks>
    private static List<bool> ModulosDoValor(int valor)
    {
        if (valor < 0 || valor > Paragem)
        {
            throw new SimbologiaException($"Code 128: o valor {valor} nao existe");
        }

        string cadeia = valor == Paragem
            ? Tabelas.CODE128_PARAGEM
            : Tabelas.CODE128_PADROES[valor];

        var saida = new List<bool>(cadeia.Length);

        // **As larguras leem-se nas corridas:** a cadeia e' a soma das larguras dos
        // seis elementos, e nao os elementos. Uma corrida de um e' um elemento
        // estreito, e uma de tres e' um largo.
        //
        // E o que separa barra de espaco e' **o numero do elemento**, que e' o mesmo
        // que o numero da corrida. Nao e' o indice do caracter dentro da cadeia:
        // passar esse dava a cor errada sempre que uma corrida tinha mais de um
        // caracter, e um simbolo de 11 modulos saia com 12.
        int elementos = 0;
        int i = 0;
        while (i < cadeia.Length)
        {
            char bit = cadeia[i];
            int largura = 0;
            while (i < cadeia.Length && cadeia[i] == bit)
            {
                largura++;
                i++;
            }

            Empurrar(largura, elementos, saida);
            elementos++;
        }

        return saida;
    }

    /// <summary>Acrescenta um elemento, com a cor que a sua posicao decide.</summary>
    /// <param name="largura">Quantos modulos o elemento ocupa.</param>
    /// <param name="elemento">O numero do elemento, a partir de zero; par e' barra.</param>
    private static void Empurrar(int largura, int elemento, List<bool> saida)
    {
        bool escuro = elemento % 2 == 0;
        for (int k = 0; k < largura; k++)
        {
            saida.Add(escuro);
        }
    }

    /// <summary>
    /// Os valores que o encoder escolheu, para quem quiser ver a decisao.
    /// </summary>
    /// <remarks>
    /// E' o que permite testar a troca de conjuntos sem descodificar nada, e sem
    /// isso a unica forma de afirmar que o <c>ABC123</c> comuta seria ler a imagem —
    /// que e' um teste de leitura a fingir ser estrutural.
    /// </remarks>
    public static int[] ValoresDe(string texto) => Valores(texto, 0);

    /// <summary>
    /// O digito de verificacao de um texto, sem passar pelo encoder.
    /// </summary>
    /// <remarks>
    /// Modulo 103, o resto da soma ponderada. Existe para o teste afirmar a regra
    /// sem duplicar a conta — que era o que fazia o comentario do Code 39 descrever
    /// a regra ao contrario sem ninguem dar por isso.
    /// </remarks>
    public static int Verificacao(string texto)
    {
        int[] dados = Valores(texto, 0);
        int soma = dados[0];
        for (int i = 1; i < dados.Length; i++)
        {
            soma += dados[i] * i;
        }

        return soma % 103;
    }
}
