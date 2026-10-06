namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// As tabelas dos codigos de barras de uma linha, extraidas do
/// <c>python-barcode</c>.
///
/// <code>python spec/gerar-tabelas-lineares.py</code>
///
/// <para><b>NAO EDITE ESTE FICHEIRO A MAO.</b> E' gerado, e a razao esta no
/// Python: a tabela do Code 39 foi escrita de memoria com doze elementos por
/// caractere em vez de nove, e a do ITF com dois na moldura de paragem em vez
/// de tres. Nenhum dos dois foi apanhado por um teste — desenhavam-se com
/// aspecto de estar certo e o leitor nao lia.</para>
///
/// <para><b>Porque um ficheiro so para as tabelas:</b> e' a mesma extracao que
/// escreve o modulo Python, o Java e o Kotlin, e nao uma transcricao. A regra
/// deste repositorio e' nao escrever as tabelas de memoria, e a segunda leitura
/// dessa regra e' nao as escrever quatro vezes.</para>
///
/// <para>A notacao de 'N' e 'W': <c>N</c> barra estreita, <c>n</c> espaco
/// estreito, <c>W</c> barra larga, <c>w</c> espaco largo. <b>Decide a letra, e
/// nao a caixa:</b> <c>W</c> e <c>w</c> sao largos, <c>N</c> e <c>n</c> estreitos.
/// A caixa existia so por legibilidade, e ler pela caixa dava ao ITF uma
/// moldura de inicio com barras largas onde o formato nao tem nenhuma.</para>
/// </summary>
public static class Tabelas
{
    /// <summary>O Code 39, por ordem, com o asterisco de inicio e paragem a parte.</summary>
    public const string COD39_ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

    /// <summary>Cada entrada tem quinze caracteres, ja expandidos a 3:1.</summary>
    public static readonly string[] COD39_PADROES = new[]
    {
            "101000111011101",
            "111010001010111",
            "101110001010111",
            "111011100010101",
            "101000111010111",
            "111010001110101",
            "101110001110101",
            "101000101110111",
            "111010001011101",
            "101110001011101",
            "111010100010111",
            "101110100010111",
            "111011101000101",
            "101011100010111",
            "111010111000101",
            "101110111000101",
            "101010001110111",
            "111010100011101",
            "101110100011101",
            "101011100011101",
            "111010101000111",
            "101110101000111",
            "111011101010001",
            "101011101000111",
            "111010111010001",
            "101110111010001",
            "101010111000111",
            "111010101110001",
            "101110101110001",
            "101011101110001",
            "111000101010111",
            "100011101010111",
            "111000111010101",
            "100010111010111",
            "111000101110101",
            "100011101110101",
            "100010101110111",
            "111000101011101",
            "100011101011101",
            "100010001000101",
            "100010001010001",
            "100010100010001",
            "101000100010001",
        };

    /// <summary>O asterisco de inicio e de paragem.</summary>
    public const string COD39_PARAGEM = "100010111011101";

    /// <summary>O ITF: cinco elementos por digito.</summary>
    public static readonly string[] ITF_PADROES = new[]
    {
            "NNWWN",
            "WNNNW",
            "NWNNW",
            "WWNNN",
            "NNWNW",
            "WNWNN",
            "NWWNN",
            "NNNWW",
            "WNNWN",
            "NWNWN",
        };

    /// <summary>A moldura de inicio do ITF, com quatro elementos estreitos.</summary>
    public const string ITF_INICIO = "NnNn";

    /// <summary>
    /// A moldura de paragem do ITF, com <b>tres</b> elementos: barra larga,
    /// espaco estreito, barra estreita. Sao tres e nao dois — a segunda versao
    /// tinha dois e o codigo nao lia.
    /// </summary>
    public const string ITF_PARAGEM = "WnN";

    /// <summary>As chaves de dados do Codabar, por ordem alfabetica.</summary>
    private static readonly string[] CODABAR_CHAVES = new[]
    {
            "$",
            "+",
            "-",
            ".",
            "/",
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            ":",
        };

    private static readonly string[] CODABAR_VALORES = new[]
    {
            "NnWwNnN",
            "NnWnWnW",
            "NnNwWnN",
            "WnWnWnN",
            "WnWnNnW",
            "NnNnNwW",
            "NnNnWwN",
            "NnNwNnW",
            "WwNnNnN",
            "NnWnNwN",
            "WnNnNwN",
            "NwNnNnW",
            "NwNnWnN",
            "NwWnNnN",
            "WnNwNnN",
            "WnNnWnW",
        };

    /// <summary>
    /// Os quatro caracteres que so podem ser inicio ou paragem.
    ///
    /// <para>Vem a parte porque um <c>A</c> no meio dos dados era codificado com
    /// a tabela de dados e o leitor lia-o como moldura: o codigo passava a parte
    /// estrutural e partia a meio.</para>
    /// </summary>
    private static readonly string[] CODABAR_MOLDURA_CHAVES = new[]
    {
            "A",
            "B",
            "C",
            "D",
        };

    private static readonly string[] CODABAR_MOLDURA_VALORES = new[]
    {
            "NnWwNwN",
            "NwNwNnW",
            "NnNwNwW",
            "NnNwWwN",
        };

    /// <summary>
    /// O Code 128: os 106 primeiros valores, por indice.
    ///
    /// <para><b>Cada entrada tem onze caracteres, ja expandidos</b>, e nao os seis
    /// elementos <c>NnWw</c> dos outros: a cadeia e' a soma das larguras dos seis
    /// elementos, e as larguras vao de 1 a 4.</para>
    /// </summary>
    public static readonly string[] CODE128_PADROES = new[]
    {
            "11011001100",
            "11001101100",
            "11001100110",
            "10010011000",
            "10010001100",
            "10001001100",
            "10011001000",
            "10011000100",
            "10001100100",
            "11001001000",
            "11001000100",
            "11000100100",
            "10110011100",
            "10011011100",
            "10011001110",
            "10111001100",
            "10011101100",
            "10011100110",
            "11001110010",
            "11001011100",
            "11001001110",
            "11011100100",
            "11001110100",
            "11101101110",
            "11101001100",
            "11100101100",
            "11100100110",
            "11101100100",
            "11100110100",
            "11100110010",
            "11011011000",
            "11011000110",
            "11000110110",
            "10100011000",
            "10001011000",
            "10001000110",
            "10110001000",
            "10001101000",
            "10001100010",
            "11010001000",
            "11000101000",
            "11000100010",
            "10110111000",
            "10110001110",
            "10001101110",
            "10111011000",
            "10111000110",
            "10001110110",
            "11101110110",
            "11010001110",
            "11000101110",
            "11011101000",
            "11011100010",
            "11011101110",
            "11101011000",
            "11101000110",
            "11100010110",
            "11101101000",
            "11101100010",
            "11100011010",
            "11101111010",
            "11001000010",
            "11110001010",
            "10100110000",
            "10100001100",
            "10010110000",
            "10010000110",
            "10000101100",
            "10000100110",
            "10110010000",
            "10110000100",
            "10011010000",
            "10011000010",
            "10000110100",
            "10000110010",
            "11000010010",
            "11001010000",
            "11110111010",
            "11000010100",
            "10001111010",
            "10100111100",
            "10010111100",
            "10010011110",
            "10111100100",
            "10011110100",
            "10011110010",
            "11110100100",
            "11110010100",
            "11110010010",
            "11011011110",
            "11011110110",
            "11110110110",
            "10101111000",
            "10100011110",
            "10001011110",
            "10111101000",
            "10111100010",
            "11110101000",
            "11110100010",
            "10111011110",
            "10111101110",
            "11101011110",
            "11110101110",
            "11010000100",
            "11010010000",
            "11010011100",
        };

    /// <summary>
    /// A paragem do Code 128: treze modulos, sete elementos.
    ///
    /// <para><b>E' a unica tabela deste ficheiro que nao vem do
    /// <c>python-barcode</c>, porque a da biblioteca esta truncada</b> — onze
    /// modulos em vez de treze, sem a barra final. Com a cadeia da biblioteca o
    /// ZXing devolve "NAO LEU" e com esta devolve a string certa. A barra e' a
    /// ancora do leitor, porque o Code 128 nao tem barras-guarda como o EAN.</para>
    /// </summary>
    public const string CODE128_PARAGEM = "1100011101011";

    /// <summary>
    /// Se um caractere so pode ser inicio ou paragem do Codabar.
    /// </summary>
    /// <remarks>
    /// <b>Esta pergunta e' diferente de "qual e' o padrao".</b> <c>Codabar</c>
    /// responde ao mesmo tempo as duas, e o encoder precisa de saber se um
    /// <c>A</c> nos dados e' legal — e nao e'. Por isso existe aqui, e nao no
    /// encoder: <b>a tabela sabe o que e' moldura, e o encoder sabe o que e'
    /// legal</b>, e misturar as duas coisas e' como um <c>A</c> no meio do texto
    /// passa a parte estrutural e parte a meio na leitura.
    /// </remarks>
    public static bool EhMoldura(string caractere) =>
        Array.IndexOf(CODABAR_MOLDURA_CHAVES, caractere) >= 0;

    /// <summary>
    /// O padrao de um caracter do Codabar, ou <c>null</c> se nao existir.
    ///
    /// <para><b>A moldura e' procurada primeiro</b>, e <c>A</c>, <c>B</c>, <c>C</c>
    /// e <c>D</c> devolvem o padrao de moldura — que e' o que esta funcao
    /// promete: o padrao daquele caractere. Quem recusa um <c>A</c> no meio dos
    /// dados e' o encoder, e nao esta funcao.</para>
    /// </summary>
    public static string? Codabar(string caractere)
    {
        for (int i = 0; i < CODABAR_MOLDURA_CHAVES.Length; i++)
        {
            if (CODABAR_MOLDURA_CHAVES[i] == caractere)
            {
                return CODABAR_MOLDURA_VALORES[i];
            }
        }

        for (int i = 0; i < CODABAR_CHAVES.Length; i++)
        {
            if (CODABAR_CHAVES[i] == caractere)
            {
                return CODABAR_VALORES[i];
            }
        }

        return null;
    }
}
