namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// Os codigos de barras de uma linha que nao precisam de escolher conjuntos:
/// Code 39, ITF, ITF-14 e Codabar.
/// </summary>
/// <remarks>
/// <para><b>A largura decide-se pela letra, e nao pela caixa.</b> <c>W</c> e
/// <c>w</c> sao largos, <c>N</c> e <c>n</c> sao estreitos, e a caixa existia so por
/// legibilidade. A versao que o Java tinha decidia pela caixa e dava ao ITF uma
/// moldura de inicio com barras largas onde o formato nao tem nenhuma: 45 modulos a
/// mais num ITF-14 de 14 digitos, e a moldura de paragem errada pelo mesmo
/// motivo.</para>
///
/// <para><b>As guardas medem-se, e nao se contam.</b> Um elemento nao e' um modulo,
/// e a conta antiga do Codabar — <c>len(moldura) * largo</c> — assumia que todos os
/// elementos da moldura eram largos. A moldura do inicio ocupa 23 modulos e a conta
/// dava 35, e as 12 colunas a mais eram do primeiro caractere de dados.</para>
///
/// <para><b>O digito de controlo do Code 39 e' o resto da divisao por 43</b>, e nao
/// a letra que torna a soma multipla de 43. A documentacao do ZPL da Zebra da o
/// exemplo: <c>12345ABCDE/</c> soma 115, <c>115 / 43 = 2</c> com resto 29, e 29 e' a
/// letra <c>T</c>. Um comentario neste repositorio dizia a regra complementar, e
/// quase became um bug em tres stacks.</para>
///
/// <para><b>A API e' nao-anula e nao ha guarda de <c>null</c>.</b> Em Java e em
/// Python o <c>valor</c> pode ser nulo porque essas linguagens nao tem tipos nao
/// nulos, e o codigo faz <c>valor == null ? "" : valor</c>. Aqui
/// <c>Code39(null)</c> nao compila em vez de dar "o texto esta vazio", e e' melhor:
/// o erro aparece no sitio onde se chama.</para>
/// </remarks>
public static class Lineares
{
    /// <summary>O Code 39: estreito 1, largo 3.</summary>
    private const int Code39Espaco = 1;

    /// <summary>O ITF: estreito 1, largo 2 — e nao 3, como o Code 39.</summary>
    private static readonly Dictionary<string, int> ItfLargura =
        new() { { "N", 1 }, { "n", 1 }, { "W", 2 }, { "w", 2 } };

    /// <summary>
    /// As medidas do Codabar nas duas variantes de espacado.
    /// </summary>
    /// <remarks>
    /// Estreito 2, largo 5 — e nao 3:1, que tem o aspecto certo e nao le. O
    /// <c>espaco</c> e' o intervalo entre caracteres, e a variante larga usa 3 em vez
    /// de 2.
    /// </remarks>
    private static readonly Medidas CodabarNormal = new(2, 5, 2);

    private static readonly Medidas CodabarLargo = new(2, 5, 3);

    /// <summary>As medidas do Codabar, e o que muda entre as duas variantes.</summary>
    private sealed record Medidas(int Estreito, int Largo, int Espaco);

    // --- Code 39 -------------------------------------------------------------

    /// <summary>O indice de cada letra do Code 39 no alfabeto.</summary>
    private static readonly Dictionary<char, int> Code39Indice = ConstruirIndice();

    private static Dictionary<char, int> ConstruirIndice()
    {
        var indice = new Dictionary<char, int>();
        for (int i = 0; i < Tabelas.COD39_ALFABETO.Length; i++)
        {
            indice[Tabelas.COD39_ALFABETO[i]] = i;
        }

        return indice;
    }

    /// <summary>Code 39.</summary>
    /// <param name="valor">O texto. Vai para maiusculas, porque o formato e' caixa alta.</param>
    /// <param name="comControlo">Acrescenta o digito mod 43 no fim.</param>
    public static CodigoDeBarras Code39(string valor, bool comControlo = true)
    {
        string texto = (valor ?? "").ToUpperInvariant();

        if (texto.Length == 0)
        {
            throw new SimbologiaException("Code 39: o texto esta vazio.");
        }

        if (texto.Contains('*'))
        {
            throw new SimbologiaException(
                "Code 39: o asterisco e' o caracter de inicio e de paragem, e nao pode "
                + "estar nos dados. O encoder poe-o nas duas pontas, por isso nao faz "
                + "falta escreve-lo.");
        }

        foreach (char c in texto)
        {
            if (!Code39Indice.ContainsKey(c))
            {
                throw new SimbologiaException(
                    "Code 39: o caracter '" + c + "' nao existe neste formato (sao "
                    + Tabelas.COD39_ALFABETO + ")");
            }
        }

        string dados = texto;
        if (comControlo)
        {
            // **O resto da divisao, e nao o que falta para dar inteiro.** A
            // documentacao do ZPL da Zebra da o exemplo trabalhado:
            // `12345ABCDE/` soma 115, `115 / 43 = 2` com resto 29, e 29 e' o `T`.
            int soma = 0;
            foreach (char c in texto)
            {
                soma += Code39Indice[c];
            }

            dados = texto + Tabelas.COD39_ALFABETO[soma % 43];
        }

        var modulos = new List<bool>();
        var guardas = new List<int>();

        // **A moldura de inicio, e o separador atras dela.** A moldura acaba em barra
        // e o primeiro caractere de dados comeca em barra; sem este espaco as duas
        // fundem-se numa barra larga a mais, e o codigo tem o aspecto certo e nao le.
        AcrescentarComGuarda(modulos, guardas, Moldura39());
        modulos.AddRange(Falsos(Code39Espaco));

        foreach (char c in dados)
        {
            string padrao = Tabelas.COD39_PADROES[Code39Indice[c]];
            foreach (char bit in padrao)
            {
                modulos.Add(bit == '1');
            }

            modulos.AddRange(Falsos(Code39Espaco));
        }

        // **A moldura de paragem nao tem separador atras**, e a razao e' a mesma de
        // nao ter nada a separar: e' a ultima coisa do codigo.
        AcrescentarComGuarda(modulos, guardas, Moldura39());

        return new CodigoDeBarras("Code 39", modulos.ToArray(), guardas.ToArray(), dados);
    }

    /// <summary>O asterisco de inicio e de paragem, em modulos.</summary>
    private static List<bool> Moldura39()
    {
        var saida = new List<bool>();
        foreach (char bit in Tabelas.COD39_PARAGEM)
        {
            saida.Add(bit == '1');
        }

        return saida;
    }

    // --- ITF -----------------------------------------------------------------

    /// <summary>
    /// ITF, so com digitos e sempre em numero par.
    /// </summary>
    /// <remarks>
    /// <b>Os digitos leem-se aos pares</b>, e e' por isso que o numero tem de ser par:
    /// um digito isolado nao tem par com quem ler.
    /// <para>
    /// <b>Sem separador entre os pares</b>, ao contrario do Code 39 e do Codabar. A
    /// intercalacao termina no elemento 4 do segundo digito, que e' desenhado como
    /// espaco, e o par seguinte comeca em barra. Acrescentar o separador do outro
    /// formato junta dois espacos num so e desloca todos os digitos seguintes.
    /// </para>
    /// </remarks>
    public static CodigoDeBarras Itf(string valor)
    {
        string digitos = LimparDigitos(valor, "ITF");

        if (digitos.Length % 2 != 0)
        {
            throw new SimbologiaException(
                $"ITF: {digitos.Length} digitos, e o formato le-os aos pares. Faltou um "
                + "digito. Se o numero e' fixo, use ITF-14, que acrescenta o digito de "
                + "controlo que falta.");
        }

        return ConstruirItf(digitos);
    }

    /// <summary>ITF-14: treze digitos de dados mais um de controlo, sempre catorze.</summary>
    /// <remarks>
    /// <b>A direccao dos pesos nao se nota aqui, e vale a pena dizer porquê.</b> A GS1
    /// pesa o GTIN-14 com 3, 1, 3, 1 a partir da esquerda, e o EAN pesa a partir da
    /// direita. Com treze digitos — e o ITF-14 tem sempre treze — as duas direccoes
    /// dao a mesma soma, porque com um numero impar as duas comecam com o peso 3.
    /// </remarks>
    public static CodigoDeBarras Itf14(string valor)
    {
        string digitos = LimparDigitos(valor, "ITF-14");

        if (digitos.Length != 13)
        {
            throw new SimbologiaException(
                $"ITF-14: espera 13 digitos de dados, recebeu {digitos.Length}. O ultimo, "
                + "o digito de controlo, calcula-se sozinho.");
        }

        int soma = 0;
        for (int i = 0; i < 13; i++)
        {
            soma += (digitos[i] - '0') * (i % 2 == 0 ? 3 : 1);
        }

        int controlo = (10 - soma % 10) % 10;

        return ConstruirItf(digitos + controlo);
    }

    private static CodigoDeBarras ConstruirItf(string digitos)
    {
        var modulos = new List<bool>();
        var guardas = new List<int>();

        // **A moldura de inicio mede-se, e nao se conta**: aqui os quatro elementos
        // sao estreitos e a conta antiga acertava por acaso, mas a moldura de
        // paragem mais abaixo tem 3 elementos e 4 modulos, e ai nao acertava.
        AcrescentarComGuarda(modulos, guardas, ModulosDe(Tabelas.ITF_INICIO));

        for (int i = 0; i < digitos.Length; i += 2)
        {
            string barras = Tabelas.ITF_PADROES[digitos[i] - '0'];
            string espacos = Tabelas.ITF_PADROES[digitos[i + 1] - '0'];

            // **A intercalacao.** As larguras do primeiro digito vao nas barras, as do
            // segundo nos espacos, elemento a elemento. E' o "interleaved" que da o
            // nome ao formato: um par de digitos ocupa as mesmas cinco posicoes que um
            // digito so.
            for (int e = 0; e < 5; e++)
            {
                modulos.AddRange(Verdadeiros(ItfLargura[barras[e].ToString()]));
                modulos.AddRange(Falsos(ItfLargura[espacos[e].ToString()]));
            }
        }

        // A moldura de paragem, com os seus **tres** elementos — e tambem guarda.
        AcrescentarComGuarda(modulos, guardas, ModulosDe(Tabelas.ITF_PARAGEM));

        return new CodigoDeBarras("ITF", modulos.ToArray(), guardas.ToArray(), digitos);
    }

    // --- Codabar -------------------------------------------------------------

    /// <summary>O Codabar.</summary>
    /// <param name="valor">O texto. Vai para maiusculas, como o formato.</param>
    /// <param name="inicio">`A`, `B`, `C` ou `D`.</param>
    /// <param name="paragem">`A`, `B`, `C` ou `D`.</param>
    /// <param name="largo">A variante de espacado largo, com tres modulos de intervalo.</param>
    public static CodigoDeBarras Codabar(
        string valor,
        string inicio = "A",
        string paragem = "A",
        bool largo = false)
    {
        string dados = (valor ?? "").ToUpperInvariant();

        if (dados.Length == 0)
        {
            throw new SimbologiaException("Codabar: o texto esta vazio.");
        }

        foreach ((string nome, string moldura) in new[] { ("inicio", inicio), ("paragem", paragem) })
        {
            if (moldura.Length != 1 || !EhMoldura(moldura))
            {
                throw new SimbologiaException(
                    $"Codabar: {nome} tem de ser A, B, C ou D, e recebeu '{moldura}'.");
            }
        }

        // **Os caracteres de moldura nao podem estar nos dados.** E' a mesma razao
        // pela qual eles sao opcoes: `A`, `B`, `C` e `D` so existem nas pontas, e um
        // `A` no meio do texto era codificado com a tabela de dados e o leitor lia-o
        // como moldura — o codigo passava a parte estrutural e partia a meio.
        foreach (char c in dados)
        {
            if (EhMoldura(c.ToString()))
            {
                throw new SimbologiaException(
                    $"Codabar: '{c}' so pode ser inicio ou paragem, e nao um caractere "
                    + "de dados. Usa outro, ou tira-o do texto.");
            }

            if (Tabelas.Codabar(c.ToString()) == null)
            {
                throw new SimbologiaException(
                    $"Codabar: o caracter '{c}' nao existe neste formato.");
            }
        }

        Medidas medidas = largo ? CodabarLargo : CodabarNormal;
        var modulos = new List<bool>();
        var guardas = new List<int>();

        // A moldura de inicio. **A conta anterior era `len(moldura) * largo`**, que
        // assume que todos os elementos sao largos. Nao sao: a moldura do `A` ocupa 23
        // modulos e a conta dava 35, e as 12 colunas a mais eram do primeiro
        // caractere de dados.
        AcrescentarComGuarda(modulos, guardas, ModulosDe(Tabelas.Codabar(inicio)!, medidas));
        modulos.AddRange(Falsos(medidas.Espaco));

        // Os dados, cada um seguido do seu intervalo — inclusive o ultimo, que e' o que
        // o separa da moldura de paragem.
        foreach (char c in dados)
        {
            modulos.AddRange(ModulosDe(Tabelas.Codabar(c.ToString())!, medidas));
            modulos.AddRange(Falsos(medidas.Espaco));
        }

        // A moldura de paragem, sem intervalo atras: e' a ultima coisa.
        AcrescentarComGuarda(modulos, guardas, ModulosDe(Tabelas.Codabar(paragem)!, medidas));

        return new CodigoDeBarras(
            "Codabar", modulos.ToArray(), guardas.ToArray(), inicio + dados + paragem);
    }

    /// <summary>
    /// Se um caractere so pode ser inicio ou paragem.
    /// </summary>
    /// <remarks>
    /// **A pergunta vive no <c>Tabelas</c> e nao aqui**, porque e' a tabela que
    /// sabe o que e' moldura. O que e' *legal* nos dados e' questao do encoder, e
    /// por isso que o `Codabar` usa isto e nao o contrario.
    /// </remarks>
    private static bool EhMoldura(string caractere) => Tabelas.EhMoldura(caractere);

    // --- o que os quatro partilham ------------------------------------------

    /// <summary>
    /// Acrescenta uma moldura e marca <b>os modulos que ela ocupa</b> como guarda.
    /// </summary>
    /// <remarks>
    /// A guarda vai de onde a moldura comeca ate onde acaba, e isso sabe-se porque se
    /// acabou de acrescentar. Nao e' uma conta melhor que a antiga: e' medir em vez de
    /// contar.
    /// </remarks>
    private static void AcrescentarComGuarda(
        List<bool> modulos,
        List<int> guardas,
        List<bool> novos)
    {
        int inicio = modulos.Count;
        modulos.AddRange(novos);
        for (int i = inicio; i < modulos.Count; i++)
        {
            guardas.Add(i);
        }
    }

    /// <summary>Converte <c>NnWw</c> em modulos, com as medidas do ITF.</summary>
    private static List<bool> ModulosDe(string elementos)
    {
        var larguras = new List<int>();
        var escuro = new List<bool>();

        for (int i = 0; i < elementos.Length; i++)
        {
            larguras.Add(ItfLargura[elementos[i].ToString()]);
            escuro.Add(i % 2 == 0);
        }

        return Achatar(larguras, escuro);
    }

    /// <summary>Converte <c>NnWw</c> em modulos, com as medidas do Codabar.</summary>
    private static List<bool> ModulosDe(string elementos, Medidas medidas)
    {
        var larguras = new List<int>();
        var escuro = new List<bool>();

        for (int i = 0; i < elementos.Length; i++)
        {
            larguras.Add(LarguraDe(elementos[i].ToString(), medidas));
            escuro.Add(i % 2 == 0);
        }

        return Achatar(larguras, escuro);
    }

    private static List<bool> Achatar(List<int> larguras, List<bool> escuro)
    {
        var saida = new List<bool>();
        for (int e = 0; e < larguras.Count; e++)
        {
            saida.AddRange(Repetir(escuro[e], larguras[e]));
        }

        return saida;
    }

    /// <summary>
    /// A largura de um elemento, e decide-se pela letra.
    /// </summary>
    /// <remarks>
    /// <b><c>W</c> e <c>w</c> sao largos; <c>N</c> e <c>n</c> sao estreitos.</b> A
    /// versao que decidia pela caixa dava ao <c>n</c> a largura do <c>N</c> — e o ITF
    /// perdia o espacado largo inteiro.
    /// </remarks>
    private static int LarguraDe(string letra, Medidas medidas) =>
        letra is "W" or "w" ? medidas.Largo : medidas.Estreito;

    /// <summary>So os digitos, sem o que o formato nao quer.</summary>
    private static string LimparDigitos(string valor, string nome)
    {
        var saida = new System.Text.StringBuilder();
        foreach (char c in valor)
        {
            if (char.IsWhiteSpace(c) || c == '-')
            {
                continue;
            }

            if (!char.IsDigit(c))
            {
                throw new SimbologiaException($"{nome}: so aceita digitos, recebeu \"{valor}\"");
            }

            saida.Append(c);
        }

        if (saida.Length == 0)
        {
            throw new SimbologiaException($"{nome}: o texto esta vazio.");
        }

        return saida.ToString();
    }

    private static IEnumerable<bool> Verdadeiros(int n) => Repetir(true, n);

    private static IEnumerable<bool> Falsos(int n) => Repetir(false, n);

    private static IEnumerable<bool> Repetir(bool valor, int vezes)
    {
        for (int i = 0; i < vezes; i++)
        {
            yield return valor;
        }
    }
}
