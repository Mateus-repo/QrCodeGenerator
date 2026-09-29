using QrCodeGenerator.Core;
using Xunit;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Regressões para os defeitos que estavam no <c>QrService.cs</c> original.
/// Cada teste descreve o bug que impede.
/// </summary>
public class BugFixTests
{
    // --- Bug 1/2: iCalendar com CRLF e escaping ---------------------------

    [Fact]
    public void ICal_usa_CRLF_e_nunca_o_fim_de_linha_do_sistema()
    {
        var ical = Build(new QrFields
        {
            EventTitle = "Reuniao",
            EventStart = new DateTime(2026, 9, 30, 10, 0, 0, DateTimeKind.Utc),
            EventEnd = new DateTime(2026, 9, 30, 11, 0, 0, DateTimeKind.Utc)
        });

        // Antes usava Environment.NewLine: CRLF no Windows, LF noutro sistema.
        Assert.DoesNotContain("\n", ical.Replace("\r\n", string.Empty, StringComparison.Ordinal));
        Assert.Contains("BEGIN:VCALENDAR\r\n", ical, StringComparison.Ordinal);
        Assert.EndsWith("END:VCALENDAR\r\n", ical, StringComparison.Ordinal);
    }

    [Fact]
    public void ICal_escapa_virgulas_pontos_e_virgens()
    {
        var ical = Build(new QrFields
        {
            EventTitle = "Reuniao, trimestre; 1\\2",
            EventLocation = "Rua A; 3, Lisboa",
            EventStart = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EventEnd = new DateTime(2026, 1, 1, 1, 0, 0, DateTimeKind.Utc)
        });

        Assert.Contains(@"SUMMARY:Reuniao\, trimestre\; 1\\2", ical, StringComparison.Ordinal);
        Assert.Contains(@"LOCATION:Rua A\; 3\, Lisboa", ical, StringComparison.Ordinal);
    }

    [Fact]
    public void ICal_escapa_quebras_de_linha()
    {
        var ical = Build(new QrFields
        {
            EventTitle = "Primeira linha\nsegunda",
            EventStart = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EventEnd = new DateTime(2026, 1, 1, 1, 0, 0, DateTimeKind.Utc)
        });

        Assert.Contains(@"SUMMARY:Primeira linha\nsegunda", ical, StringComparison.Ordinal);
    }

    [Fact]
    public void ICal_tem_campos_obrigatorios()
    {
        var ical = Build(new QrFields
        {
            EventTitle = "X",
            EventStart = new DateTime(2026, 9, 30, 10, 0, 0),
            EventEnd = new DateTime(2026, 9, 30, 11, 0, 0)
        });

        Assert.Contains("VERSION:2.0", ical, StringComparison.Ordinal);
        Assert.Contains("DTSTART:20260930T100000", ical, StringComparison.Ordinal);
        Assert.Contains("DTEND:20260930T110000", ical, StringComparison.Ordinal);
        Assert.Contains("BEGIN:VEVENT", ical, StringComparison.Ordinal);
    }

    /// <summary>
    /// A hora do evento sai <b>sem fuso e sem <c>Z</c></b>.
    /// </summary>
    /// <remarks>
    /// Este teste existia ao contrário, e e' a razao de estar aqui. Ele afirmava
    /// <c>DTSTART:20260930T100000Z</c> -- com o <c>Z</c> -- porque era isso que a
    /// aplicacao fazia: <c>ToUniversalTime()</c> e um <c>Z</c> que o utilizador
    /// nunca escreveu. <b>O teste passava, o payload estava errado, e ninguem via
    /// nada.</b>
    /// <para>
    /// O sintoma em uso real era uma hora de diferenca: quem marcava uma reuniao
    /// as 18h30 em Portugal via o evento as 17h30 no calendario, e a culpa ia
    /// para o calendario e nao para o gerador.
    /// <para>
    /// Quem nao escreveu o fuso nao pode ser convertido, porque nao ha fuso para
    /// converter. O <c>DateTime</c> sem <c>Kind</c> e' o que corresponde a um campo
    /// <c>datetime-local</c>, e e' o que o <c>SpecFixture</c> produz ao ler a spec.
    /// </remarks>
    [Theory]
    [InlineData(DateTimeKind.Unspecified, "20260930T100000")]
    [InlineData(DateTimeKind.Utc, "20260930T100000")]
    [InlineData(DateTimeKind.Local, "20260930T100000")]
    public void ICal_sai_a_hora_que_foi_escrita_sem_converter_para_utc(
        DateTimeKind kind, string esperado)
    {
        var ical = Build(new QrFields
        {
            EventTitle = "X",
            EventStart = new DateTime(2026, 9, 30, 10, 0, 0, kind),
            EventEnd = new DateTime(2026, 9, 30, 11, 0, 0, kind)
        });

        Assert.Contains("DTSTART:" + esperado + "\r\n", ical, StringComparison.Ordinal);
        Assert.Contains("DTEND:20260930T110000\r\n", ical, StringComparison.Ordinal);

        // **E o `Z` nao esta em lado nenhum.** Um horario flutuante nao o leva, e
        // um `Z` que nao foi escrito mente sobre o sitio.
        Assert.DoesNotContain("T100000Z", ical, StringComparison.Ordinal);
        Assert.DoesNotContain("T110000Z", ical, StringComparison.Ordinal);
    }


    // --- Bug 3: vCard perdia a morada --------------------------------------

    [Fact]
    public void VCard_gera_a_morada()
    {
        // Antes todos os parâmetros de endereço passavam "" e o ADR não saía.
        var vcard = Build(new QrFields
        {
            VcFirstName = "Ana",
            VcLastName = "Silva",
            VcOrg = "Empresa",
            VcRole = "Diretora",
            VcPhone = "+351912345678",
            VcEmail = "ana@exemplo.pt",
            VcStreet = "Rua A 1",
            VcCity = "Lisboa",
            VcZip = "1000-001",
            VcCountry = "Portugal"
        });

        Assert.Contains("ADR;TYPE=work:;;Rua A 1;Lisboa;;1000-001;Portugal", vcard, StringComparison.Ordinal);
    }

    [Fact]
    public void VCard_usa_escaping_nos_campos_de_texto()
    {
        var vcard = Build(new QrFields
        {
            VcFirstName = "Ana, Maria",
            VcLastName = "Silva; Costa",
            VcCity = "Porto"
        });

        Assert.Contains(@"FN:Ana\, Maria Silva\; Costa", vcard, StringComparison.Ordinal);
        Assert.Contains(@"N:Silva\; Costa;Ana\, Maria;;;", vcard, StringComparison.Ordinal);
    }

    [Fact]
    public void VCard_tem_nome_estruturado_com_a_familia_primeiro()
    {
        var vcard = Build(new QrFields { VcFirstName = "Ana", VcLastName = "Silva" });

        Assert.Contains("VERSION:4.0", vcard, StringComparison.Ordinal);
        Assert.Contains("FN:Ana Silva", vcard, StringComparison.Ordinal);
        Assert.Contains("N:Silva;Ana;;;", vcard, StringComparison.Ordinal);
    }

    [Fact]
    public void VCard_aceita_dois_telefones_com_tipo()
    {
        var vcard = Build(new QrFields
        {
            VcFirstName = "Ana",
            VcPhone = "+351912345678",
            VcPhone2 = "+351213456789"
        });

        Assert.Contains("TEL;TYPE=cell:+351912345678", vcard, StringComparison.Ordinal);
        Assert.Contains("TEL;TYPE=work:+351213456789", vcard, StringComparison.Ordinal);
    }

    // --- Bug 4: coordenadas sem validação de intervalo ---------------------

    [Theory]
    [InlineData(91, 0)]
    [InlineData(-90.5, 0)]
    [InlineData(0, 181)]
    [InlineData(0, -180.5)]
    public void Geo_rejeita_coordenadas_fora_do_intervalo(double lat, double lng)
    {
        var error = QrValidator.Validate(QrCategory.Localizacao, new QrFields
        {
            GeoLat = lat,
            GeoLng = lng
        });

        Assert.NotNull(error);
    }

    [Fact]
    public void Geo_aceita_os_limites()
    {
        Assert.Null(QrValidator.Validate(QrCategory.Localizacao, new QrFields { GeoLat = 90, GeoLng = 180 }));
        Assert.Null(QrValidator.Validate(QrCategory.Localizacao, new QrFields { GeoLat = -90, GeoLng = -180 }));
    }

    [Fact]
    public void Geo_usa_ponto_decimal_invariante()
    {
        var geo = Build(new QrFields { GeoLat = 38.7223, GeoLng = -9.1393 });
        Assert.Equal("geo:38.7223,-9.1393", geo);
    }

    // --- Bug 5: links perigosos passavam -----------------------------------

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html;base64,PHNjcmlwdD4=")]
    [InlineData("file:///C:/Windows/System32")]
    [InlineData("vbscript:msgbox")]
    public void Link_recusa_esquemas_perigosos(string url)
    {
        Assert.NotNull(QrValidator.Validate(QrCategory.Link, new QrFields { Url = url }));
    }

    [Theory]
    [InlineData("exemplo.pt")]
    [InlineData("http://exemplo.pt")]
    [InlineData("https://exemplo.pt/pt")]
    [InlineData("mailto:ana@exemplo.pt")]
    [InlineData("tel:+351912345678")]
    public void Link_normaliza_e_aceita(string url)
    {
        var fields = new QrFields { Url = url };
        Assert.Null(QrValidator.Validate(QrCategory.Link, fields));
        Assert.NotEmpty(QrPayloadBuilder.Build(QrCategory.Link, fields));
    }

    [Fact]
    public void Link_sem_esquema_ganha_https()
    {
        Assert.Equal("https://exemplo.pt", QrPayloadBuilder.Build(QrCategory.Link, new QrFields { Url = "exemplo.pt" }));
    }

    // --- Bug 6: normalização de telefone inconsistente ---------------------

    [Theory]
    [InlineData("00351", "+351")]
    [InlineData("351", "+351")]
    [InlineData("+351", "+351")]
    [InlineData("+ 351", "+351")]
    [InlineData("00 351", "+351")]
    [InlineData("00 351 (PT)", "+351")]
    public void Indicativo_normalizado(string input, string expected)
    {
        Assert.Equal(expected, Normalize.PhonePrefix(input));
    }

    [Fact]
    public void Indicativo_so_com_o_prefixo_internacional_fica_vazio()
    {
        Assert.Equal(string.Empty, Normalize.PhonePrefix("00"));
        Assert.Equal(string.Empty, Normalize.PhonePrefix("+"));
    }

    [Fact]
    public void Telefone_monta_com_indicativo_e_numero()
    {
        Assert.Equal("+351912345678", Normalize.Phone("+351", "912 345 678"));
        Assert.Equal("+351912345678", Normalize.Phone("00351", "912345678"));
    }

    // --- Bug 7: WiFi e SMS sem limites -------------------------------------

    [Fact]
    public void Wifi_escapa_o_simbolo_de_separador()
    {
        var wifi = Build(new QrFields
        {
            WifiSsid = "Cafe;bar:1",
            WifiPass = "a:b;c",
            WifiSec = "WPA/WPA2"
        });

        Assert.Contains(@"S:Cafe\;bar\:1;", wifi, StringComparison.Ordinal);
        Assert.Contains(@"P:a\:b\;c;", wifi, StringComparison.Ordinal);
    }

    [Fact]
    public void Wifi_aberto_nao_escreve_password_e_termina_com_duas_ponto_e_virgula()
    {
        var wifi = Build(new QrFields { WifiSsid = "Rede", WifiSec = "Aberto" });

        Assert.Equal("WIFI:T:nopass;S:Rede;;", wifi);
    }

    [Fact]
    public void Wifi_oculta_marca_H_true()
    {
        var wifi = Build(new QrFields { WifiSsid = "Rede", WifiPass = "x", WifiSec = "WPA/WPA2", WifiHidden = true });
        Assert.Contains("H:true;", wifi, StringComparison.Ordinal);
    }

    [Fact]
    public void Sms_rejeita_caracteres_que_o_protocolo_nao_suporta()
    {
        var error = QrValidator.Validate(QrCategory.SMS, new QrFields
        {
            PhonePrefix = "+351",
            PhoneNumber = "912345678",
            SmsMessage = "olá {braces}"
        });

        Assert.NotNull(error);
    }

    // --- Email -------------------------------------------------------------

    [Fact]
    public void Email_usa_mailto_minusculo_e_percent_encoding()
    {
        var mail = Build(new QrFields
        {
            MailTo = "ana@exemplo.pt",
            MailSubject = "Faturação #1",
            MailBody = "olá & bem-vindo"
        });

        Assert.StartsWith("mailto:ana@exemplo.pt?subject=", mail, StringComparison.Ordinal);
        Assert.Contains("Fatura%C3%A7%C3%A3o%20%231", mail, StringComparison.Ordinal);
        Assert.Contains("%26", mail, StringComparison.Ordinal);
    }

    [Fact]
    public void Email_sem_assunto_nem_mensagem_nao_tem_interrogacao()
    {
        Assert.Equal("mailto:ana@exemplo.pt", Build(new QrFields { MailTo = "ana@exemplo.pt" }));
    }

    [Fact]
    public void Email_rejeita_destinatario_invalido()
    {
        Assert.NotNull(QrValidator.Validate(QrCategory.Email, new QrFields { MailTo = "ana@" }));
    }

    // --- WhatsApp ----------------------------------------------------------

    [Fact]
    public void Whatsapp_usa_somente_digitos_e_codifica_a_mensagem()
    {
        var wa = Build(new QrFields
        {
            PhonePrefix = "+351",
            PhoneNumber = "912 345 678",
            WaMessage = "olá & bem-vindo"
        });

        Assert.StartsWith("https://wa.me/351912345678?text=", wa, StringComparison.Ordinal);
        Assert.Contains("%26", wa, StringComparison.Ordinal);
    }

    // --- Capacidade --------------------------------------------------------

    [Fact]
    public void Capacidade_avisa_com_numeros_concretos()
    {
        var ex = Assert.Throws<QrCapacityException>(() =>
            QrCapacity.Check(new string('x', 3000), EccLevel.L));

        Assert.Contains("2953", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Limite_mensurado_por_elevacao_de_custo()
    {
        Assert.True(QrCapacity.LimitFor(EccLevel.L) > QrCapacity.LimitFor(EccLevel.M));
        Assert.True(QrCapacity.LimitFor(EccLevel.M) > QrCapacity.LimitFor(EccLevel.Q));
        Assert.True(QrCapacity.LimitFor(EccLevel.Q) > QrCapacity.LimitFor(EccLevel.H));
    }

    private static string Build(QrFields fields)
    {
        var category = CategoryOf(fields);
        var error = QrValidator.Validate(category, fields);
        Assert.Null(error);
        return QrPayloadBuilder.Build(category, fields);
    }

    /// <summary>Descobre a categoria a partir do único campo preenchido.</summary>
    private static QrCategory CategoryOf(QrFields f)
    {
        if (f.EventTitle is not null) return QrCategory.Evento;
        if (f.VcFirstName is not null || f.VcLastName is not null) return QrCategory.VCard;
        if (f.WifiSsid is not null) return QrCategory.WiFi;
        if (f.GeoLat is not null || f.GeoLng is not null) return QrCategory.Localizacao;
        if (f.MailTo is not null) return QrCategory.Email;
        if (f.WaMessage is not null) return QrCategory.WhatsApp;
        if (f.SmsMessage is not null) return QrCategory.SMS;
        if (f.PhoneNumber is not null) return QrCategory.Telefone;
        if (f.Url is not null) return QrCategory.Link;
        return QrCategory.Texto;
    }
}
