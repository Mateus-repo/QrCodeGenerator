using System.Text;
using System.Text.RegularExpressions;

namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// GS1-128, outrora chamado EAN/UCC-128.
/// </summary>
/// <remarks>
/// <para>O Code 128 com as regras do GS1 por cima. E' o codigo de barras que vai na
/// etiqueta de uma caixa de armario de farmacia, e a diferenca para o Code 128 normal
/// nao esta no desenho: esta em <b>saber onde acaba cada campo</b>.</para>
///
/// <para><b>O problema que ele resolve.</b> O GTIN sozinho e' um numero de
/// comprimento fixo, e o leitor sabe que tem de ler catorze digitos. Com varios campos
/// ja nao: em <c>(10)LOTE-A1(17)270630</c>, onde acaba <c>LOTE-A1</c>? Sem regra o
/// leitor tem de adivinhar, e adivinhar mal e' ler um campo invalido.</para>
///
/// <para>A regra e' o <b>FNC1</b>, um codeword que nao desenha um caracter visivel e
/// que marca "o campo de comprimento variavel acabou aqui".</para>
///
/// <para><b>As tres coisas que sao FNC1.</b></para>
/// <list type="number">
/// <item><description><b>No inicio</b>, logo a seguir ao caracter de inicio do
/// conjunto. E' o que diz ao leitor "este e' um GS1-128", e e' o <c>]C1</c> do
/// identificador.</description></item>
/// <item><description><b>No fim de cada campo de comprimento variavel</b>, menos no
/// ultimo. E' o separador. A regra "menos no ultimo" e' da propria GS1: um separador no
/// fim nao separa de nada.</description></item>
/// <item><description><b>Nunca</b> dentro de um campo de comprimento fixo, porque ai
/// o comprimento ja esta no AI e um FNC1 a meio leria-se como parte do valor.</description></item>
/// </list>
///
/// <para><b>Deliberadamente nao chama o <see cref="Code128"/>.</b> Aquele escolhe os
/// conjuntos e faz as comutacoes, e o GS1-128 nao pode: tem de ficar no conjunto B, e o
/// FNC1 e' um codeword que o <see cref="Code128"/> nao sabe emitir. Chama-lo e forcar o
/// conjunto B por opcao seria meio caminho, e <b>o meio caminho e' onde estao os
/// bugs</b>.</para>
///
/// <para><b>O que o leitor devolve, e que os leitores nao concordam.</b> Sao tres
/// representacoes do mesmo codigo:</para>
/// <list type="bullet">
/// <item><description>o <c>zxingcpp</c> (Python) devolve <c>bytes</c> com o payload e
/// o <c>0x1D</c> no sitio certo, e <c>text</c> com os AIs entre parenteses;</description></item>
/// <item><description>o ZXing em Java devolve <c>getRawBytes()</c> com os
/// <b>codewords</b>, e <c>getText()</c> com o payload <b>sem</b> os separadores e sem
/// parenteses.</description></item>
/// </list>
/// <para>Sao leitores diferentes com o mesmo formato, e <b>um teste escrito contra um
/// esta errado contra o outro</b>.</para>
/// </remarks>
public static class Gs1_128
{
    /// <summary>
    /// O valor do codeword do FNC1 no Code 128.
    /// </summary>
    /// <remarks>
    /// 102 nao e' um valor de conjunto nem um caracter: e' uma funcao, e e' o mesmo em
    /// todos os contextos - no inicio e como separador. <b>Nao ha um "FNC1 de inicio" e
    /// um "FNC1 separador" com numeros diferentes</b>, ao contrario do que se pode supor.
    /// </remarks>
    public const int Fnc1 = 102;

    /// <summary>
    /// O separador GS, <c>0x1D</c> - o mesmo byte que o leitor devolve nos bytes.
    /// </summary>
    /// <remarks>
    /// <b>Nao e' uma escolha de interface.</b> E' o valor que a GS1 chama de Group
    /// Separator e o mesmo que o leitor devolve, para que o texto que a aplicacao mostra
    /// e o que o leitor le sejam o mesmo numero e nao duas tradicoes.
    /// </remarks>
    public const char Gs = '\u001D';

    /// <summary>
    /// O rotulo do formato, para as mensagens de recusa.
    /// </summary>
    /// <remarks>
    /// <para><strong>E' o mesmo para o GS1-128 e para o GS1 DataMatrix</strong>:
    /// a tabela, o <c>fixo</c>, o <c>maximo</c> e o <c>regex</c> sao iguais, e o que
    /// muda entre os dois e' o desenho e nao a notacao dos campos. O rotulo existe
    /// para a mensagem identificar o formato certo — <strong>uma mensagem que diz
    /// "GS1-128" quando o utilizador fez um GS1 DataMatrix manda-o procurar o erro
    /// no sitio errado</strong>.</para>
    /// </remarks>
    internal const string Rotulo = "GS1-128";

    /// <summary>O codeword de inicio do conjunto B, que e' o unico que o GS1-128 usa.</summary>
    private const int InicioB = 104;

    /// <summary>O codeword de paragem.</summary>
    private const int Paragem = 106;

    /// <summary>
    /// O codigo de barras GS1-128.
    /// </summary>
    /// <param name="elementoString">
    /// O texto com os AIs entre parenteses, na forma de leitura humana da GS1:
    /// <c>(01)04012345678901(10)LOTE-A1</c>. Os parenteses <b>nao</b> vao para dentro
    /// do codigo de barras - fazem parte da notacao humana e o leitor nao os ve.
    /// <b>Os digitos do AI vao</b>, ao contrario dos parenteses.
    /// </param>
    /// <exception cref="SimbologiaException">O texto nao e' GS1, ou um campo viola a tabela.</exception>
    public static CodigoGs1 Gerar(string elementoString)
    {
        List<CodigoGs1.Campo> campos = Analisar(elementoString, Rotulo);

        // A forma de maquina: os campos concatenados, com o FNC1 onde a GS1 o quer.
        //
        // O FNC1 do inicio vai **depois** do caracter de inicio do conjunto B - e' o
        // primeiro codeword de dados, nao parte do cabecalho. Po-lo antes produz um
        // codigo que o leitor classifica como Code 128 normal, e o utilizador nunca ve a
        // diferenca - so o leitor de um sistema GS1.
        var valores = new List<int> { InicioB, Fnc1 };

        int ultimo = campos.Count - 1;
        int separadores = 1;

        for (int i = 0; i < campos.Count; i++)
        {
            CodigoGs1.Campo campo = campos[i];

            // **Os digitos do AI vao no codigo de barras, sem parenteses.**
            //
            // A primeira versao emitia so `campo.Valor` e o AI ficava de fora, por causa
            // de uma confusao entre a forma humana e a de maquina: em `(10)LOTE-A1` os
            // parenteses sao para quem le e nao vao para o codigo - mas os **digitos do
            // AI vao**. O resultado eram 17 codewords em vez de 20, o ZXing nao lia nada,
            // e a razao nao era visivel no codigo.
            //
            // E o `resto` entra **antes** do conteudo: num `3103` o digito da posicao
            // decimal implicita faz parte do valor, nao do AI.
            string conteudo = campo.Ai + campo.Valor;
            foreach (char c in conteudo)
            {
                valores.Add(ValorNoConjuntoB(c, campo.Ai));
            }

            // O separador vai no fim de cada campo variavel **excepto o ultimo**.
            //
            // **Um separador no fim nao separa de nada**, e o leitor conta-o como parte
            // do campo seguinte. A primeira versao metia um em todos os campos variaveis,
            // e o `descodificar` falhava em seis de oito casos: o ZXing devolvia o mesmo
            // codigo com um `0x1D` a mais e o codigo continuava a ler bem - a falha era
            // so na comparacao, e sem ela nao se via.
            if (campo.Separador && i != ultimo)
            {
                valores.Add(Fnc1);
                separadores++;
            }
        }

        // O caracter de verificacao: o valor de inicio com peso 1, cada valor de dados
        // multiplicado pela sua posicao - a primeira a valer 1 - e o resultado modulo 103.
        //
        // **Nao e' uma soma simples.** A primeira versao somava os valores todos sem pesos,
        // e produzia um valor de verificacao diferente do certo: 222 modulos em vez dos
        // 200 que a conta pedia, o ZXing a recusar **sem dizer por que**, e nenhuma
        // diferenca visivel no desenho.
        //
        // O FNC1 entra na conta com o valor 102 e com o peso da sua posicao, como qualquer
        // outro codeword - e e' por isso que ele tem de estar na lista **antes** de se
        // calcular a soma, e nao a ser acrescentado a parte.
        int soma = valores[0];
        for (int i = 1; i < valores.Count; i++)
        {
            soma += valores[i] * i;
        }

        int verificacao = soma % 103;

        var todos = new List<int>(valores.Count + 2);
        todos.AddRange(valores);
        todos.Add(verificacao);
        todos.Add(Paragem);

        var grelha = new List<bool>();
        foreach (int v in todos)
        {
            grelha.AddRange(Code128.ModulosDoValor(v));
        }

        return new CodigoGs1
        {
            Modulos = grelha.ToArray(),
            Legenda = Legivel(campos),
            Payload = Maquina(campos),
            Gs1 = Legivel(campos),
            Campos = campos,
            Separadores = separadores,
        };
    }

    /// <summary>
    /// O valor Code 128 de um caracter no conjunto B.
    /// </summary>
    /// <remarks>
    /// No conjunto B o valor e' o ASCII menos 32, para 0 a 95. Os caracteres que nao
    /// cabem no GS1-128 - os acentos, por exemplo - sao recusados aqui e nao no desenho,
    /// porque o erro e' do dado e nao do codigo.
    /// </remarks>
    private static int ValorNoConjuntoB(char caractere, string ai)
    {
        int codigo = caractere;

        if (codigo < 32 || codigo > 127)
        {
            throw new SimbologiaException(
                $"GS1-128: o AI ({ai}) tem o caractere \"{caractere}\" "
                    + $"(U+{codigo:X4}), e o conjunto B so transporta ASCII. "
                    + "O GS1-128 nao tem acento.");
        }

        // 128 e' o valor de paragem e nao pode estar nos dados - dava um codigo que se
        // desenhava e nao se lia.
        if (codigo == 128)
        {
            throw new SimbologiaException($"GS1-128: o AI ({ai}) tem um caracter de paragem nos dados");
        }

        return codigo - 32;
    }

    /// <summary>
    /// Separa o texto nos campos, e valida cada um contra a tabela de AIs.
    /// </summary>
    /// <remarks>
    /// <para>E' aqui que a tabela de 541 AIs paga. Sem ela o encoder teria de adivinhar o
    /// comprimento de cada campo, e adivinhar mal significa que o campo seguinte e' lido
    /// a partir do meio do anterior.</para>
    ///
    /// <para>A forma humana da GS1 nao tem separadores: os campos estao separados por
    /// parenteses. O FNC1 so existe na forma de maquina, e e' o encoder que o poe.</para>
    /// </remarks>
    internal static List<CodigoGs1.Campo> Analisar(string texto, string rotulo = Rotulo)
    {
        var campos = new List<CodigoGs1.Campo>();
        string fonte = texto ?? string.Empty;
        int i = 0;

        while (i < fonte.Length)
        {
            if (fonte[i] != '(')
            {
                throw new SimbologiaException(
                    $"{rotulo}: esperava um \"(\" na posicao {i} de \"{fonte}\". A forma de "
                        + "leitura humana e' (01)04012345678901(10)LOTE-A1, com os AIs "
                        + "entre parenteses.");
            }

            // O AI tem dois, tres ou quatro digitos, e **nao se pode saber qual pelo
            // primeiro digito**: `3103` e' um AI de quatro, e `31` seria um de dois com a
            // posicao decimal implicita no ultimo digito. Le-se o numero todo e a tabela
            // diz onde acaba.
            int fecho = fonte.IndexOf(')', i);
            if (fecho < 0)
            {
                throw new SimbologiaException(
                    $"{rotulo}: o \"(\" na posicao {i} de \"{fonte}\" nao fecha.");
            }

            string numero = fonte.Substring(i + 1, fecho - i - 1);
            if (!Regex.IsMatch(numero, "^[0-9]+$"))
            {
                throw new SimbologiaException($"{rotulo}: o AI \"{numero}\" nao e' so digitos.");
            }

            TabelasGs1.Ai? encontrado = TabelasGs1.AiDe(numero);
            if (encontrado is null)
            {
                throw new SimbologiaException(
                    $"{rotulo}: o AI ({numero}) nao existe. A tabela tem "
                        + $"{TabelasGs1.AIS.Count} AIs.");
            }

            // O valor comeca logo a seguir ao `)`, e e' o comprimento que decide ate onde
            // vai. **E' a razao de a tabela trazer `Fixo` e `Maximo`.**
            //
            // O `resto` que o `AiDe` devolve e' o que sobrou do numero depois do AI - o
            // digito da posicao decimal implicita num `3103`. Faz parte do valor, e por
            // isso entra no campo antes dos caracteres.
            int inicioValor = fecho + 1;
            int fim;
            string conteudo;

            if (encontrado.Fixo is not null)
            {
                // Comprimento fixo: o campo tem `Fixo` caracteres, ponto final.
                fim = inicioValor + encontrado.Fixo.Value;
                conteudo = Recorta(fonte, inicioValor, fim);
            }
            else
            {
                // Comprimento variavel: vai ate ao fim do texto ou ate ao proximo `(`.
                //
                // **O `(` e' que marca o fim, e nao um FNC1 na forma humana.** A primeira
                // versao procurava um separador na forma humana, que nao existe, e cortava
                // o valor no sitio errado.
                int proximo = fonte.IndexOf('(', inicioValor);
                fim = proximo < 0 ? fonte.Length : proximo;
                conteudo = fonte.Substring(inicioValor, fim - inicioValor);
            }

            string limpo = Validar(encontrado, conteudo, rotulo);

            campos.Add(new CodigoGs1.Campo(
                encontrado.Numero,
                (encontrado.Resto ?? string.Empty) + limpo,
                limpo,
                encontrado.Separador,
                // **O `Numerico` decide do AI e nao do valor.** O `01` e' o GTIN e e'
                // numerico por definicao, e o `10` e' o lote e e' alfanumerico — e so o
                // AI o diz. Perguntar "o valor so tem digitos?" mandaria o lote para o
                // modo de digitos, e o `LOTE` nao cabe la. E' o GS1-128 que o ignora e o
                // GS1 DataMatrix que precisa dele: e' a decisao que torna o 232 ambiguo.
                encontrado.Campos[0].Tipo == "N"));

            i = fim;
        }

        if (campos.Count == 0)
        {
            throw new SimbologiaException(
                $"{rotulo}: o texto nao tem nenhum campo. Escreve (01)04012345678901.");
        }

        return campos;
    }

    /// <summary>
    /// <c>Substring</c> que devolve <c>""</c> em vez de lancar.
    /// </summary>
    /// <remarks>
    /// <b>Um valor fixo mais curto do que a tabela diz tem de recusar, e nao estourar uma
    /// <see cref="ArgumentOutOfRangeException"/>.</b> A primeira versao chamava
    /// <c>Substring</c> a direito, e um <c>(01)</c> sem valor dava
    /// <c>ArgumentOutOfRangeException</c> - que e' uma excecao da linguagem e nao uma
    /// recusa do encoder, e o teste que a apanhava afirmava
    /// <see cref="SimbologiaException"/>.
    /// </remarks>
    private static string Recorta(string texto, int inicio, int fim)
    {
        if (inicio >= texto.Length)
        {
            return string.Empty;
        }

        return texto.Substring(inicio, Math.Min(fim, texto.Length) - inicio);
    }

    /// <summary>
    /// Confere o valor de um campo contra o que a GS1 diz dele.
    /// </summary>
    /// <remarks>
    /// <para>A expressao regular vem da propria GS1, e da tabela. E' mais forte do que
    /// contar caracteres: <c>(\d{2}(?:0\d|1[0-2])(?:[0-2]\d|3[01]))</c> para uma data
    /// recusa <c>275630</c> - mes 56 - e o leitor do GS1 recusa tambem.</para>
    ///
    /// <para><b>O <c>Trim</c> e' o que torna a forma humana legivel.</b> A GS1 escreve
    /// os campos com um espaco de cada lado nos exemplos - <c>(10) LOTE-A1</c> - e o
    /// espaco nao faz parte do valor. Um <c>Trim</c> sem isto recusa metade dos exemplos
    /// que a propria GS1 escreve.</para>
    ///
    /// <para><b>O regex e' ancorado, e ancorar e' o que impede que um valor mais longo
    /// passe.</b> Sem <c>^</c> e <c>$</c> um regex nao ancorado aceita o valor se
    /// <i>contiver</i> um match.</para>
    /// </remarks>
    internal static string Validar(TabelasGs1.Ai ai, string valor, string rotulo = Rotulo)
    {
        string limpo = valor.Trim();

        if (limpo.Length == 0)
        {
            throw new SimbologiaException($"{rotulo}: o AI ({ai.Numero}) nao tem valor.");
        }

        // O comprimento fixo conferido, e **com os dois numeros na mensagem**.
        //
        // A versao que so tinha o `regex` dizia "nao corresponde ao que a GS1 define" - que
        // e' verdade e nao ajuda ninguem: o utilizador tem um campo de catorze e nao sabe
        // qual. **Uma recusa sem numeros e' uma recusa com que ninguem consegue corrigir o
        // campo.**
        if (ai.Fixo is not null && limpo.Length != ai.Fixo.Value)
        {
            string unidade = ai.Fixo.Value == 1 ? "digito" : "digitos";
            throw new SimbologiaException(
                $"{rotulo}: o AI ({ai.Numero}) tem {ai.Fixo.Value} {unidade} fixos e o "
                    + $"valor \"{limpo}\" tem {limpo.Length}.");
        }

        // **O maximo e' a soma dos componentes, e nao o do ultimo.**
        //
        // A tabela so traz o do ultimo componente, que e' o que serve para **dividir** o
        // valor. Para **conferir** o numero certo e' a soma de todos: o AI `253` e'
        // `N3+N13[+X..17]`, o ultimo componente tem maximo 17 e um valor valido pode ter
        // trinta. **47 dos 541 AIs recusavam um valor que a GS1 aceita.**
        int? maximo = ComprimentoTotal(ai);
        if (maximo is not null && limpo.Length > maximo.Value)
        {
            throw new SimbologiaException(
                $"{rotulo}: o AI ({ai.Numero}) aceita no maximo {maximo.Value} caracteres "
                    + $"e o valor \"{limpo}\" tem {limpo.Length}.");
        }

        if (!Regex.IsMatch(limpo, $"^(?:{ai.Regex})$"))
        {
            throw new SimbologiaException(
                $"{rotulo}: o valor \"{limpo}\" do AI ({ai.Numero}) nao corresponde ao que "
                    + $"a GS1 define. O formato e' {ai.Formato}.");
        }

        return limpo;
    }

    /// <summary>
    /// O comprimento maximo do valor de um AI, e nao o do ultimo componente.
    /// </summary>
    /// <remarks>
    /// <para><b>A tabela so traz o do ultimo componente, e os dois numeros sao
    /// diferentes.</b> E' o que serve para <b>dividir</b> o valor - o ultimo componente e'
    /// o que vai ate ao fim do texto - e nao para o <b>conferir</b>: um AI de varios
    /// componentes tem um valor que e' a soma deles.</para>
    ///
    /// <list type="table">
    /// <listheader><term>AI</term><term>formato</term><term>ultimo</term><term>total</term></listheader>
    /// <item><term><c>253</c></term><term><c>N3+N13[+X..17]</c></term><term>17</term><term><b>30</b></term></item>
    /// <item><term><c>421</c></term><term><c>N3+N3+X..9</c></term><term>9</term><term><b>12</b></term></item>
    /// <item><term><c>8008</c></term><term><c>N4+N8[+N..4]</c></term><term>4</term><term><b>12</b></term></item>
    /// </list>
    ///
    /// <para><b>Sao 47 dos 541 AIs que tem mais de um componente</b>, e todos eles
    /// recusavam um valor que a GS1 aceita. O sintoma e' o pior dos possiveis: quem
    /// escreve o valor certo recebe um erro que fala de um comprimento que nao e' o do
    /// campo.</para>
    ///
    /// <para><b>E' publico porque a interface e o teste precisam dele, e nao porque seja
    /// um segredo.</b> Um <c>internal</c> so para o teste e' pior: e' um membro que a
    /// producao nao usa e que ninguem sabe porque existe.</para>
    /// </remarks>
    /// <returns>O comprimento maximo, ou <c>null</c> se o AI nao tem componente variavel.</returns>
    public static int? ComprimentoTotal(TabelasGs1.Ai ai)
    {
        int soma = 0;
        bool temVariavel = false;

        foreach (TabelasGs1.Componente campo in ai.Campos)
        {
            if (campo.Fixo is not null)
            {
                soma += campo.Fixo.Value;
            }

            if (campo.Maximo is not null)
            {
                soma += campo.Maximo.Value;
                temVariavel = true;
            }
        }

        return temVariavel ? soma : null;
    }

    /// <summary>
    /// A forma de maquina: os campos <b>sem parenteses</b>, com o separador no sitio
    /// certo.
    /// </summary>
    /// <remarks>
    /// <para><b>Sem os parenteses, e sem eles no <see cref="CodigoGs1.Gs1"/>.</b> Os
    /// parenteses sao a notacao humana e o leitor nao os ve; os <i>digitos do AI</i>
    /// vao.</para>
    ///
    /// <para>O separador vai <b>depois</b> de um campo de comprimento variavel, e so se
    /// esse campo nao for o ultimo. E' a mesma regra que o <see cref="Gerar"/> usa ao
    /// montar os codewords - <b>as duas tem de concordar</b>, e e' por isso que a lista
    /// se percorre com o mesmo criterio nas duas.</para>
    /// </remarks>
    internal static string Maquina(IReadOnlyList<CodigoGs1.Campo> campos)
    {
        var saida = new StringBuilder();
        int ultimo = campos.Count - 1;

        for (int i = 0; i < campos.Count; i++)
        {
            CodigoGs1.Campo campo = campos[i];
            saida.Append(campo.Ai).Append(campo.Valor);

            if (campo.Separador && i != ultimo)
            {
                saida.Append(Gs);
            }
        }

        return saida.ToString();
    }

    /// <summary>
    /// A forma humana, com os AIs entre parenteses e <b>sem</b> separador.
    /// </summary>
    /// <remarks>
    /// <b>E' a mesma cadeia que o <see cref="CodigoGs1.Gs1"/>, e nao uma segunda
    /// forma.</b> O nome <c>Gs1</c> e' o nome da notacao e <c>Legenda</c> e' o nome do
    /// campo que o desenho imprime; a cadeia e' uma so, e a paridade mede os dois para
    /// saber que nao divergiram.
    /// </remarks>
    internal static string Legivel(IReadOnlyList<CodigoGs1.Campo> campos)
    {
        var saida = new StringBuilder();

        foreach (CodigoGs1.Campo campo in campos)
        {
            saida.Append('(').Append(campo.Ai).Append(')').Append(campo.Valor);
        }

        return saida.ToString();
    }
}
