using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using System.Text.RegularExpressions;
using QrCodeGenerator.Core.Simbologias;
using Xunit;
using ZXing;
using ZXing.Common;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nivel 2 do GS1-128 em C#: <b>o C# desenha e o ZXing le</b>.
/// </summary>
/// <remarks>
/// <para><b>E' uma classe a parte, e nao mais um <c>Fact</c> dentro de
/// <see cref="SimbologiasTests"/>.</b> Nao e' por ser mais codigo: e' porque o desenho de
/// um codigo de barras de uma linha e' o de <c>SimbologiasTests</c> — guardas, 60 modulos
/// de altura, dez de zona muda — e o <c>ler()</c> de la esta' a fazer o que o GS1-128
/// nao quer.</para>
///
/// <para><b>E' o que <see cref="SimbologiasTests"/> ensina, repetido:</b> um encoder so
/// entra no repositorio depois de o ZXing devolver a cadeia certa. Nao ha "quase" — na
/// fase dos codigos de barras, quatro encoders pareceram certos durante a escrita e nao
/// eram.</para>
///
/// <para><b>O ZXing em C# devolve os codewords, e nao os caracteres.</b> E' o mesmo
/// comportamento do Java e do Data Matrix, e diferente do <c>zxingcpp</c> de Python — que
/// devolve o payload com o <c>0x1D</c> no sitio certo e a forma humana entre parenteses.
/// Sao leitores diferentes com o mesmo formato, e <b>um teste escrito contra um esta
/// errado contra o outro</b>.</para>
///
/// <para><b>O <c>0x1D</c> no <c>payload</c> e' o que este ficheiro tem de acertar e o
/// <c>zxingcpp</c> resolve.</b> O <see cref="BarcodeReader.RawBytes"/> do C# e' o dos
/// codewords, e o <see cref="BarcodeReader.Text"/> e' o payload sem separadores e sem
/// parenteses. Contar os <c>102</c> nos codewords e' o que confirma o FNC1 dos dois
/// lados.</para>
///
/// <para><b>O nome da classe conta.</b> Chama-se <c>Gs1_128Tests</c>, e o filtro do runner
/// do xUnit e' <c>.*Tests$</c>. Uma classe que nao bate nao e' descoberta, nao corre, e o
/// build passa a dizer que passou — e e' o que aconteceu ao <c>SimbologiasTestes</c> em
/// Java, que esteve compilado uma sessao inteira sem correr.</para>
/// </remarks>
public class Gs1_128Tests
{
    /// <summary>
    /// Quantos pixele por modulo.
    /// </summary>
    /// <remarks>
    /// <b>Tres, e nao um nem dois.</b> E' o minimo confiavel para leitores de 1D, e a dois
    /// pixele ja falha em codigos com barras estreitas — que e' o que um GS1-128 e,
    /// porque fica sempre no conjunto B.
    /// </remarks>
    private const int Escala = 3;

    /// <summary>Altura em modulos. 1D nao tem altura na norma, mas tem minima em fisica.</summary>
    private const int Altura = 60;

    /// <summary>A zona muda, em modulos. A norma ISO/IEC 15420 pede dez.</summary>
    private const int ZonaMuda = 10;

    /// <summary>Um caso: o nome que o teste mostra, e o texto.</summary>
    public static TheoryData<string, string> Casos => new()
    {
        // --- o GTIN sozinho, que e' o caso mais comum numa caixa -------------
        { "o GTIN", "(01)04012345678901" },

        // --- o GTIN e um lote: aqui aparece o separador ---------------------
        { "GTIN e lote", "(01)04012345678901(10)LOTE-A1" },

        // --- tres campos, dois separadores: o do meio e' o que se conta -----
        { "lote no meio", "(01)04012345678901(10)LOTE-A1(17)270630" },

        // --- o `3103`, cujo ultimo digito e' a posicao decimal implicita ----
        { "peso com decimal", "(3103)000750" },

        // --- um AI fixo antes de um variavel -------------------------------
        { "peso e GTIN", "(3103)000750(01)04012345678901" },

        // --- SSCC de 18 digitos, o campo mais longo da tabela -------------
        { "SSCC", "(00)095060001343521234" },

        // --- duas datas ----------------------------------------------------
        { "datas", "(11)150327(17)270630" },

        // --- dois campos variaveis seguidos: o primeiro recebe separador ---
        { "dois variaveis", "(240)9501101530003(241)9501234567890" },

        // --- tres digitos e quatro lado a lado -----------------------------
        { "GLN, peso e lote", "(415)9501101530000(3103)000750(10)LOTE-A1" },

        // --- um AI de **varios componentes**, com o valor mais longo -------
        // (253) e' `N3+N13[+X..17]`: o ultimo componente tem maximo 17 e um valor
        // valido pode ter trinta. **E' o caso que apanha o `Maximo` do ultimo em vez
        // da soma.**
        { "varios componentes", "(253)1234567890123ABCDEFGHIJKLMNOPQ" },

        // --- e um outro, com data e hora em vez de texto -------------------
        { "data e hora", "(8008)010203001234" },
    };

    /// <summary>As recusas: o texto e a palavra que tem de estar na mensagem.</summary>
    public static TheoryData<string, string> Recusas => new()
    {
        // O GTIN com treze digitos: o AI 01 quer catorze.
        { "(01)9501101530003", "13" },

        // O SSCC com catorze: o AI 00 quer dezoito.
        { "(00)09506000134352", "14" },

        // O mes 56, que o regex da GS1 recusa.
        { "(11)155630", "GS1" },

        // O dia 32.
        { "(11)150332", "GS1" },

        // Um AI de tres digitos que a GS1 nao publica — e o `999` **nao serviria**,
        // porque o `AiDe` devolve o `99`, que existe, com o `9` de resto.
        { "(888)ABC", "nao existe" },

        // O parenteses que nao fecha.
        { "(01)04012345678901(10", "nao fecha" },

        // Sem parenteses.
        { "0104012345678901", "(" },

        // O AI com letras.
        { "(AB)1234", "digitos" },

        // O campo sem valor.
        { "(01)", "valor" },

        // O texto vazio.
        { "", "campo" },

        // **O acento e' recusado pelo regex da GS1, e nao pela ASCII.** Uma mensagem a
        // dizer `ASCII` seria mentira, porque o encoder nunca chega a validacao do
        // Code 128.
        { "(10)LOTE-Á1", "GS1" },
    };

    // --- nivel 2: o ZXing le ---------------------------------------------------

    [Theory]
    [MemberData(nameof(Casos))]
    public void OZxingLeOPayload(string nome, string texto)
    {
        CodigoGs1 codigo = Gs1_128.Gerar(texto);
        Resultado lido = Ler(codigo);

        // **O `Text` do ZXing em C# e' o payload sem os separadores, e nao a forma
        // humana.** O `zxingcpp` de Python devolve os AIs entre parenteses no `text` e o
        // payload com o `0x1D` no `bytes`; o ZXing em C# nao tem forma humana nenhuma e come
        // os separadores.
        //
        // **Os dois leitores nao concordam sobre o mesmo formato**, que e' a razao de as
        // afirmacoes de C# nao serem a traducao das de Python.
        string semSeparadores = codigo.Payload.Replace(Gs1_128.Gs.ToString(), string.Empty);

        Assert.True(
            semSeparadores == lido.Texto,
            $"{nome}: o ZXing leu \"{lido.Texto}\" e o payload sem separadores e' "
                + $"\"{semSeparadores}\"");
    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void OZxingViuExactamenteOsFnc1(string nome, string texto)
    {
        CodigoGs1 codigo = Gs1_128.Gerar(texto);
        Resultado lido = Ler(codigo);

        // **`RawBytes` do ZXing em C# devolve os CODEWORDS, nao os caracteres.** E' o
        // mesmo comportamento do Data Matrix — e por isso que o `DataMatrixTests` compara
        // por ai. **Para o Code 128 nao sao os caracteres**, e comparar por ai daria
        // "expected 16 but was 20" em todos os casos.
        //
        // **Contar os 102 e' o que confirma o FNC1 dos dois lados**: o encoder diz que os
        // emitiu e o leitor diz que os viu. Um separador a mais daria um 102 a mais, e o
        // numero de modulos nao daria conta — porque o GS1-128 e o Code 128 dao treze
        // codewords nos dois com o mesmo texto.
        int vistos = lido.Crus.Count(b => b == (byte)Gs1_128.Fnc1);

        Assert.True(
            codigo.Separadores == vistos,
            $"{nome}: o encoder emitiu {codigo.Separadores} FNC1 e o leitor viu {vistos}");

    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void OZxingDizQueEUmGs1(string nome, string texto)
    {
        CodigoGs1 codigo = Gs1_128.Gerar(texto);
        Resultado lido = Ler(codigo);

        // **`]C1` e' a unica coisa que distingue um GS1-128 de um Code 128** com os
        // mesmos caracteres.
        //
        // **Este teste chegou a dizer que o ZXing para .NET nao devolvia o `]C1`, e
        // estava errado.** Escrevi-o depois de o Java e o `zxingcpp` o darem e de
        // supor que o C# nao daria; a sonda mediu `SYMBOLOGY_IDENTIFIER=]C1` nos tres.
        // **Um leitor que se supoe e' pior do que um leitor que se mede**, e a
        // suposicao tinha custado a verificacao mais forte das quatro.
        //
        // **E nao se poe o `ASSUME_GS1`.** O `DecodingOptions` nao o poe, e o que se
        // quer e' que o leitor diga que e' GS1 **sem ninguem lhe dizer**. Com a dica
        // o teste passaria mesmo sem o FNC1 no inicio.
        Assert.True(
            lido.Identificador == "]C1",
            $"{nome}: o ZXing disse {lido.Identificador} e nao ]C1 — sem o FNC1 do "
                + "inicio este e' um Code 128 normal");
    }

    [Fact]
    public void OZxingDizCode128()
    {
        // **Nao ha um formato "GS1" no ZXing.** O GS1-128 e' um Code 128 com FNC1 e o leitor
        // classifica-o pelo codigo — e dizer `GS1` aqui seria estar a afirmar uma coisa que
        // o leitor nao sabe.
        CodigoGs1 codigo = Gs1_128.Gerar("(01)04012345678901");

        Assert.Equal(BarcodeFormat.CODE_128, Ler(codigo).Formato);
    }

    // --- a contagem de FNC1, que e' o que apanha um separador a mais -----------

    [Fact]
    public void ONumeroDeFnc1BateComOsQueAGs1Manda()
    {
        // **O GTIN e' fixo e o lote vai no fim: nenhum separador, so o do inicio.**
        Assert.Equal(1, Gs1_128.Gerar("(01)04012345678901").Separadores);
        Assert.Equal(1, Gs1_128.Gerar("(01)04012345678901(10)LOTE-A1").Separadores);

        // **Com um campo no meio, ha um separador a mais.** A regra "menos no ultimo" e' da
        // propria GS1: um separador no fim nao separa de nada, e o leitor conta-o como parte
        // do campo seguinte.
        Assert.Equal(2, Gs1_128.Gerar("(01)04012345678901(10)LOTE-A1(17)270630").Separadores);
        Assert.Equal(2, Gs1_128.Gerar("(240)9501101530003(241)9501234567890").Separadores);
    }

    [Fact]
    public void OPayloadNaoTemParentesesEALegendaNaoTemSeparador()
    {
        CodigoGs1 codigo = Gs1_128.Gerar("(01)04012345678901(10)LOTE-A1(17)270630");

        // **Os parenteses vao para a legenda e nao para o payload.** E' a confusao que custou
        // o primeiro encoder: em `(10)LOTE-A1` os parenteses sao para quem le, e nao vao para
        // o codigo — mas os **digitos do AI vao**.
        Assert.DoesNotContain('(', codigo.Payload);
        Assert.Contains(Gs1_128.Gs, codigo.Payload);

        // **E o separador nao vao para a legenda.** A GS1 pede que a linha impressa tenha os
        // AIs entre parenteses e nenhum separador.
        Assert.DoesNotContain(Gs1_128.Gs, codigo.Legenda);
        Assert.Equal("(01)04012345678901(10)LOTE-A1(17)270630", codigo.Legenda);

        // E `Gs1` e `Legenda` sao a mesma cadeia: nao e' redundancia, e' o nome da notacao e
        // o nome do campo que o desenho imprime.
        Assert.Equal(codigo.Legenda, codigo.Gs1);
    }

    [Fact]
    public void OsDigitosDoAiVaoNoCodigoDeBarras()
    {
        // **Os digitos do AI vao no codigo de barras, sem parenteses.**
        //
        // A primeira versao emitia so `campo.Valor` e o AI ficava de fora. O resultado eram 17
        // codewords em vez de 20, o ZXing nao lia nada, e a razao nao era visivel no codigo.
        CodigoGs1 codigo = Gs1_128.Gerar("(01)04012345678901(10)LOTE-A1");

        Assert.StartsWith("0104012345678901", codigo.Payload);
        Assert.Contains("10LOTE-A1", codigo.Payload);
    }

    // --- o `resto` do AI -------------------------------------------------------

    [Fact]
    public void ORestoDoAiVaiParaOValorENenhumAiDaGs1OProduz()
    {
        // **Nenhum AI e' prefixo de outro na GS1 hoje**, e o
        // `gs1-tabelas-paridade.test.mjs` confirma isso — por isso que `resto` nunca e'
        // preenchido por um AI real e o ramo nao tem caso na tabela.
        TabelasGs1.Ai? achado = TabelasGs1.AiDe("3103");

        Assert.NotNull(achado);
        Assert.Equal("3103", achado!.Numero);
        Assert.Null(achado.Resto);
    }

    // --- o comprimento de um AI com varios componentes -------------------------

    [Fact]
    public void UmAiDeVariosComponentesAceitaOValorNoMaximo()
    {
        // **O `Maximo` da tabela e' o do ULTIMO componente, e serve para DIVIDIR o
        // valor** — o que vai ate ao fim. Para CONFERIR o numero certo e' a soma de todos: o
        // AI `253` e' `N3+N13[+X..17]`, o ultimo tem maximo 17 e um valor valido pode ter
        // trinta.
        //
        // **Os valores sao construidos a partir do maximo da tabela, e nao escritos a mao.**
        // O `7030` e' `N4+N3+X..27` e o total e' 30, e o valor escrito a mao tinha 29 — o teste
        // falhava porque acrescentar um caracter dava exactamente 30. **Um teste com o
        // numero escrito a mao passa com o numero errado.**
        foreach (string ai in new[] { "253", "421", "8008", "3910", "7030" })
        {
            TabelasGs1.Ai entrada = TabelasGs1.AIS[ai];
            int? maximo = Gs1_128.ComprimentoTotal(entrada);

            Assert.NotNull(maximo);

            string valor = ValorNoMaximo(entrada, maximo!.Value);

            CodigoGs1 codigo = Gs1_128.Gerar($"({ai}){valor}");

            Assert.Equal(ai + valor, codigo.Payload);

            // E um a mais recusa, com o comprimento na mensagem.
            SimbologiaException erro = Assert.Throws<SimbologiaException>(
                () => Gs1_128.Gerar($"({ai}){valor}0"));

            Assert.Contains((maximo.Value + 1).ToString(), erro.Message);
        }
    }

    /// <summary>
    /// Um valor de exactamente <paramref name="maximo"/> caracteres que o <c>regex</c> do
    /// AI aceita.
    /// </summary>
    /// <remarks>
    /// <para><b>Um valor repetido pode nao caber no <c>regex</c>.</b> O <c>3910</c> e'
    /// <c>N4+N3+N..15</c> e o <c>regex</c> e' <c>(\d{3})(\d{1,15})</c>: os tres digitos do
    /// meio e ate quinze a seguir. Dezassete digitos cabem, dezoito nao.</para>
    ///
    /// <para><b>A semente <c>010101000000</c> da um mes <c>01</c>, um dia <c>01</c> e uma
    /// hora <c>01</c>, e casa com o <c>8008</c>.</b> <c>1234567890</c> repetido nunca casa,
    /// porque <c>34</c> nao e' um mes nem um dia — e um gerador de valores que so sabe
    /// fazer digitos falha nos AIs que tem uma forma.</para>
    /// </remarks>
    private static string ValorNoMaximo(TabelasGs1.Ai entrada, int maximo)
    {
        foreach (string modelo in new[] { "1234567890", "010101000000", "01", "A", "ABCDEFGHIJ" })
        {
            var valor = new StringBuilder(maximo);

            for (int i = 0; i < maximo; i++)
            {
                valor.Append(modelo[i % modelo.Length]);
            }

            string cadeia = valor.ToString();

            if (Regex.IsMatch(cadeia, $"^(?:{entrada.Regex})$"))
            {
                return cadeia;
            }
        }

        throw new InvalidOperationException(
            $"nao se encontrou um valor de {maximo} caracteres que o regex aceite: {entrada.Regex}");
    }

    // --- as recusas ------------------------------------------------------------

    [Theory]
    [MemberData(nameof(Recusas))]
    public void CadaRecusaDizPorque(string texto, string palavra)
    {
        // **`Assert.Throws` sem mais passa com qualquer excecao**, incluindo uma que nao seja
        // a do encoder. A palavra na mensagem e' o que diz que foi a validacao do AI a
        // recusar e nao outra coisa.
        SimbologiaException erro = Assert.Throws<SimbologiaException>(() => Gs1_128.Gerar(texto));

        Assert.True(
            erro.Message.Contains(palavra),
            $"a recusa de \"{texto}\" nao disse \"{palavra}\": {erro.Message}");
    }

    [Fact]
    public void OComprimentoFixoEConferidoComOsDoisNumeros()
    {
        // **Uma recusa sem numeros e' uma recusa com que ninguem consegue corrigir o
        // campo.** O `regex` sozinho recusava, mas dizia "nao corresponde ao que a GS1
        // define", que e' verdade e nao ajuda ninguem.
        SimbologiaException erro =
            Assert.Throws<SimbologiaException>(() => Gs1_128.Gerar("(01)9501101530003"));

        Assert.Contains("14", erro.Message);
        Assert.Contains("13", erro.Message);
    }

    // --- o regex ancorado, e o que ele de facto faz ---------------------------

    [Fact]
    public void ORegexAncoradoEDefensivo()
    {
        // **O ancoramento e' redundante hoje, e o teste tem de dizer isso em vez de fingir
        // o contrario.** Reintroduzi `IsMatch` sem ancorar e a suite passou: com a validacao
        // do comprimento a frente, **e' o comprimento que apanha**, e o `regex` so apanha o
        // que o comprimento nao apanha, que e' o mes 56.
        //
        // **Duas validacoes que apanham o mesmo erro nao sao duas validacoes.** Escrever um
        // teste que diga "isto apanha o bug" quando nao apanha treina quem o le a confiar
        // numa coisa que nao e' verdade.
        //
        // **O que se afirma e' a propriedade verificada**: para cada valor que o `IsMatch`
        // sem ancorar aceita e o ancorado recusa, o `Validar` recusa. E pergunta-se ao
        // `Validar`, e nao a uma copia da regra dele — copiar a regra para o teste e'
        // escrever um teste que passa com o encoder errado.
        string[] valores =
        {
            "1", "12", "123", "1234", "12345", "123456", "1234567",
            "A", "AB", "ABC", "ABCDEFGH",
            "1234567890123ABC", "12345678901234567", "1234567890123ABCDEFGHIJ",
            "0ABC", "ABC0", "ABC-1",
        };

        var soOAncorado = new List<string>();

        foreach (KeyValuePair<string, TabelasGs1.Ai> par in TabelasGs1.AIS)
        {
            string regex = par.Value.Regex;

            foreach (string valor in valores)
            {
                bool semAncorar = Regex.IsMatch(valor, regex);
                bool ancorado = Regex.IsMatch(valor, $"^(?:{regex})$");

                if (!semAncorar || ancorado)
                {
                    continue;
                }

                // **Pergunta-se ao `Validar`.** O `Validar` e' `internal`, e o
                // `InternalsVisibleTo` expoe-o aos testes — e nao uma copia dele no teste,
                // que passaria com o encoder errado.
                try
                {
                    Gs1_128.Validar(TabelasGs1.AiDe(par.Key)!, valor);
                    soOAncorado.Add($"{par.Key} com \"{valor}\"");
                }
                catch (SimbologiaException)
                {
                    // O `Validar` recusa: o ancoramento e' mesmo redundante.
                }
            }
        }

        Assert.True(
            soOAncorado.Count == 0,
            $"ha {soOAncorado.Count} valores que o regex sem ancorar aceita e o ancorado "
                + $"recusa, e que o comprimento **nao** apanha: "
                + string.Join(", ", soOAncorado.Take(5))
                + ". O ancoramento deixou de ser redundante e a validacao ficou com uma "
                + "linha a mais que ninguem sabe porque existe.");
    }

    // --- o registo --------------------------------------------------------------

    [Fact]
    public void EUmCodigoDeBarrasETemODesenhoDoCode128()
    {
        // **Um GS1-128 nao tem desenho proprio**: tem o desenho do Code 128 com mais uns
        // codewords. E a razao de `ComoCodigoDeBarras` existir — e de ser uma convenience e
        // nao o formato do codigo.
        CodigoGs1 gs1 = Gs1_128.Gerar("(10)LOTE-A1");
        CodigoDeBarras codigo = gs1.ComoCodigoDeBarras();

        Assert.Equal("GS1-128", codigo.Simbologia);
        Assert.Equal(gs1.Legenda, codigo.Legenda);
        Assert.Empty(codigo.Guardas);

        // **E o Code 128 do mesmo texto, forcado ao conjunto B, tem onze modulos a menos** —
        // que e' um codeword, o do FNC1 do inicio.
        CodigoDeBarras forcado = Code128.Gerar("10LOTE-A1", 2);

        Assert.Equal(11, gs1.Modulos.Length - forcado.Modulos.Length);
    }

    // --- a leitura -------------------------------------------------------------

    /// <summary>O que o ZXing devolve, com o que os testes precisam.</summary>
    /// <remarks>
    /// <b>E' uma classe a parte e nao <c>Result</c> directamente.</b> O <c>Result</c>
    /// expoe <c>RawBytes</c>, <c>Text</c> e <c>BarcodeFormat</c> — e o <c>Text</c> e' o
    /// payload sem separadores, que e' o que se compara.
    /// </remarks>
    private sealed record Resultado(
        byte[] Crus,
        BarcodeFormat Formato,
        string Texto,
        string Identificador);

    /// <summary>
    /// O identificador de simbologia, como <c>]C1</c> ou <c>]C0</c>.
    /// </summary>
    /// <remarks>
    /// <para><b>O membro chama-se <c>SYMBOLOGY_IDENTIFIER</c>, em maiusculas.</b> O
    /// port do ZXing para .NET guardou os nomes de Java, e
    /// <c>SymbologyIdentifier</c> da <c>does not contain a definition</c>. Foi
    /// descoberto por reflexao sobre o enum — <b>o <c>ToString()</c> de um enum imprime
    /// o nome do campo, e nao o da propriedade</b>, e foi essa suposicao que custou o
    /// erro.</para>
    ///
    /// <para><b>Um <c>null</c> quando o leitor nao disse nada e' diferente de
    /// <c>]C0</c></b>, e o teste tem de os distinguir — por isso que o valor ausente vira
    /// <c>&lt;nenhum&gt;</c> e nao uma cadeia vazia.</para>
    /// </remarks>
    private static string IdentificadorDe(IDictionary<ResultMetadataType, object> metadados)
        => metadados.TryGetValue(ResultMetadataType.SYMBOLOGY_IDENTIFIER, out object? valor)
            && valor is not null
                ? valor.ToString()!
                : "<nenhum>";

    /// <summary>
    /// Desenho o codigo de barras e le-o com o ZXing.
    /// </summary>
    /// <remarks>
    /// <para><b>A imagem vai por <c>LockBits</c> e <c>BarcodeReaderGeneric</c>, e nao por
    /// <c>SetPixel</c> nem por <c>MultiFormatReader</c>.</b> O <c>SetPixel</c> e' a GDI+ e
    /// e' lento demais para uma imagem de treze mil pixeles, e o
    /// <c>RGBLuminanceSource</c> desta versao do ZXing <b>nao tem construtor de
    /// <c>Bitmap</c></b>: e' <c>bytes, largura, altura, BitmapFormat</c>.</para>
    ///
    /// <para><b>O fundo branco e' o explicitado.</b> Um <c>Bitmap</c> novo e' transparente,
    /// e barras pretas sobre transparente nao se leem.</para>
    ///
    /// <para><b>As opcoes vao num <c>DecodingOptions</c> e nao num
    /// <c>Dictionary&lt;DecodeHintType, object&gt;</c>.</b> E' a diferenca entre o ZXing
    /// para .NET e o ZXing em Java, e o <c>DecodeHintType</c> aqui e' de outro tipo — que
    /// da <c>'DecodeHintType' does not contain a definition for 'TryHarder'</c> quando se
    /// escreve o nome do Java.</para>
    /// </remarks>
    private static Resultado Ler(CodigoGs1 codigo)
    {
        bool[] modulos = codigo.Modulos;
        int largura = (modulos.Length + ZonaMuda * 2) * Escala;
        int alturaPx = Altura * Escala;

        using var imagem = new Bitmap(largura, alturaPx, PixelFormat.Format32bppArgb);

        for (int x = 0; x < largura; x++)
        {
            for (int y = 0; y < alturaPx; y++)
            {
                imagem.SetPixel(x, y, Color.White);
            }
        }

        for (int i = 0; i < modulos.Length; i++)
        {
            if (!modulos[i])
            {
                continue;
            }

            int x0 = (i + ZonaMuda) * Escala;

            for (int dx = 0; dx < Escala; dx++)
            {
                for (int dy = 0; dy < alturaPx; dy++)
                {
                    imagem.SetPixel(x0 + dx, dy, Color.Black);
                }
            }
        }

        var dados = imagem.LockBits(
            new Rectangle(0, 0, imagem.Width, imagem.Height),
            ImageLockMode.ReadOnly,
            PixelFormat.Format32bppArgb);

        try
        {
            var bytes = new byte[Math.Abs(dados.Stride) * imagem.Height];
            System.Runtime.InteropServices.Marshal.Copy(dados.Scan0, bytes, 0, bytes.Length);

            var reader = new BarcodeReaderGeneric
            {
                AutoRotate = false,
                Options = new DecodingOptions { TryHarder = true },
            };

            Result? resultado = reader.Decode(
                bytes, imagem.Width, imagem.Height, RGBLuminanceSource.BitmapFormat.BGRA32);

            Assert.NotNull(resultado);

            return new Resultado(
                resultado!.RawBytes!,
                resultado.BarcodeFormat,
                resultado.Text,
                IdentificadorDe(resultado.ResultMetadata));
        }
        catch (Exception e) when (e is not Xunit.Sdk.XunitException)
        {
            throw new Xunit.Sdk.XunitException(
                $"Falha ao descodificar com o ZXing: {e.Message}");
        }
        finally
        {
            imagem.UnlockBits(dados);
        }
    }
}
