using System.Drawing.Imaging;
using System.Globalization;
using QrCodeGenerator.Core;

namespace QrCodeGenerator;

public sealed class MainForm : Form
{
    private readonly ComboBox _cmbCategory = new();
    private readonly ComboBox _cmbSize = new();
    private readonly ComboBox _cmbEcc = new();
    private readonly CheckBox _chkAuto = new();
    private readonly Button _btnGenerate = new();
    private readonly Button _btnRefresh = new();
    private readonly Button _btnSave = new();
    private readonly Label _lblError = new();
    private readonly PictureBox _preview = new();

    private readonly TextBox _txtUrl = new();
    private readonly TextBox _txtText = new();
    private readonly TextBox _txtMailTo = new();
    private readonly TextBox _txtMailSubject = new();
    private readonly TextBox _txtMailBody = new();
    private readonly TextBox _txtPhoneCountry = new();
    private readonly TextBox _txtPhoneNumber = new();
    private readonly TextBox _txtSmsMessage = new();
    private readonly TextBox _txtWaMessage = new();
    private readonly TextBox _txtEventTitle = new();
    private readonly DateTimePicker _dtpEventStart = new();
    private readonly DateTimePicker _dtpEventEnd = new();
    private readonly TextBox _txtEventLocation = new();
    private readonly TextBox _txtEventDescription = new();
    private readonly TextBox _txtGeoLat = new();
    private readonly TextBox _txtGeoLng = new();
    private readonly TextBox _txtWifiSsid = new();
    private readonly TextBox _txtWifiPass = new();
    private readonly ComboBox _cmbWifiSec = new();
    private readonly CheckBox _chkWifiHidden = new();
    private readonly TextBox _txtVcName = new();
    private readonly TextBox _txtVcLastName = new();
    private readonly TextBox _txtVcPhone = new();
    private readonly TextBox _txtVcPhone2 = new();
    private readonly TextBox _txtVcEmail = new();
    private readonly TextBox _txtVcOrg = new();
    private readonly TextBox _txtVcRole = new();
    private readonly TextBox _txtVcStreet = new();
    private readonly TextBox _txtVcCity = new();
    private readonly TextBox _txtVcZip = new();
    private readonly TextBox _txtVcCountry = new();

    private readonly TextBox _txtPixKey = new();
    private readonly TextBox _txtPixName = new();
    private readonly TextBox _txtPixCity = new();
    private readonly TextBox _txtPixAmount = new();
    private readonly TextBox _txtPixTxid = new();
    private readonly TextBox _txtPixPostcode = new();
    private readonly TextBox _txtPixDescription = new();
    private readonly CheckBox _chkPixSingleUse = new();

    private readonly Panel _fieldHost;
    private int _fieldY;

    public MainForm()
    {
        Text = "Gerador de QR Codes";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(940, 600);
        MinimumSize = new Size(962, 640);
        BackColor = SystemColors.Control;
        Font = new Font("Segoe UI", 9F);

        // **O painel tem `AutoScroll` porque o conteudo cresce e o espaco nao.**
        //
        // A categoria VCard tem 11 campos de 36 px, e 396 nao cabem nos 280 que
        // o painel tinha. **Num `Panel` os filhos que ficam fora sao cortados**, e
        // sem `AutoScroll` nao ha barra nem atalho que os traga de volta: os
        // campos 9, 10 e 11 eram inalcancaveis. A pessoa preenchia o nome, o
        // telefone e o email, via o formulario calado, e concluia que o campo
        // estava errado.
        //
        // **O `AutoScroll` e' o minimo, e nao `Dock = Fill`.** O formulario e' todo
        // de posicoes absolutas — os botoes estao em y=490 e a pre-visualizacao em
        // x=450 — e um `Dock = Fill` aqui tapa tudo o que esta por cima. E a
        // correccao de fundo, que e' um `TableLayoutPanel`, e' outra alteracao.
        //
        // **E o espaco aproveitado ao mesmo tempo:** de y=44 aos botoes em y=480
        // cabem 436 px, e nao 280. Com isso o VCard cabe sem barra — a barra
        // fica para o que vier a crescer, que e' o que a torna a ultima defence.
        _fieldHost = new Panel
        {
            Location = new Point(120, 44),
            Size = new Size(280, 436),
            AutoScroll = true,
        };

        BuildLayout();
        PopulateCombos();
        RebuildFields();
        Regenerate();
    }

    private void BuildLayout()
    {
        AddRowLabel("Categoria:", 8, 0);
        _cmbCategory.Location = new Point(120, 4);
        _cmbCategory.Size = new Size(280, 26);
        _cmbCategory.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbCategory.SelectedIndexChanged += OnCategoryChanged;
        Controls.Add(_cmbCategory);

        Controls.Add(_fieldHost);

        int optY = 330;
        AddOption(_cmbSize, "Tamanho", optY, 0);
        AddOption(_cmbEcc, "Correção", optY, 150);
        AddOption(_chkAuto, "Auto-gerar ao digitar", optY + 55, 0);

        _btnGenerate.Text = "Gerar QR Code";
        _btnGenerate.Size = new Size(160, 34);
        _btnGenerate.Location = new Point(120, optY + 95);
        _btnGenerate.Click += OnGenerateClicked;
        Controls.Add(_btnGenerate);

        _btnRefresh.Text = "Atualizar QR Code";
        _btnRefresh.Size = new Size(230, 40);
        _btnRefresh.Location = new Point(450, 490);
        _btnRefresh.Click += OnGenerateClicked;
        Controls.Add(_btnRefresh);

        _lblError.AutoSize = true;
        _lblError.ForeColor = Color.Firebrick;
        _lblError.MaximumSize = new Size(395, 60);
        _lblError.Location = new Point(15, optY + 145);
        _lblError.Visible = false;
        Controls.Add(_lblError);

        _preview.Location = new Point(450, 14);
        _preview.Size = new Size(476, 470);
        _preview.BackColor = Color.White;
        _preview.BorderStyle = BorderStyle.FixedSingle;
        _preview.SizeMode = PictureBoxSizeMode.Zoom;
        Controls.Add(_preview);

        _btnSave.Text = "Baixar PNG";
        _btnSave.Size = new Size(230, 40);
        _btnSave.Location = new Point(696, 490);
        _btnSave.Enabled = false;
        _btnSave.Click += OnSaveClicked;
        Controls.Add(_btnSave);
    }

    private void AddRowLabel(string text, int x, int y)
    {
        var lbl = new Label
        {
            Text = text,
            AutoSize = true,
            Location = new Point(x, y + 3)
        };
        Controls.Add(lbl);
    }

    private void AddOption(ComboBox combo, string label, int y, int x)
    {
        var lbl = new Label
        {
            Text = label,
            AutoSize = true,
            Location = new Point(x + 4, y)
        };
        combo.Location = new Point(x + 4, y + 20);
        combo.Size = new Size(90, 26);
        combo.DropDownStyle = ComboBoxStyle.DropDownList;
        Controls.Add(lbl);
        Controls.Add(combo);
    }

    private void AddOption(CheckBox chk, string label, int y, int x)
    {
        chk.Text = label;
        chk.AutoSize = true;
        chk.Location = new Point(x + 4, y + 6);
        Controls.Add(chk);
    }

    private void PopulateCombos()
    {
        foreach (var name in QrCategoryNames.All)
            _cmbCategory.Items.Add(name);
        _cmbCategory.SelectedIndex = 0;

        foreach (var s in new[] { "256", "512", "1024" })
            _cmbSize.Items.Add(s);
        _cmbSize.SelectedIndex = 1;

        foreach (var s in Enum.GetNames(typeof(EccLevel)))
            _cmbEcc.Items.Add(s);
        _cmbEcc.SelectedIndex = 1;

        _cmbWifiSec.Items.AddRange(new object[] { "WPA/WPA2", "WEP", "Aberto" });
        _cmbWifiSec.SelectedIndex = 0;

        WireFieldControls();
    }

    private void WireFieldControls()
    {
        _txtPhoneCountry.Text = "+351";
        _txtText.Multiline = true;
        _txtText.ScrollBars = ScrollBars.Vertical;
        _txtMailBody.Multiline = true;
        _txtMailBody.ScrollBars = ScrollBars.Vertical;
        _txtSmsMessage.Multiline = true;
        _txtSmsMessage.ScrollBars = ScrollBars.Vertical;
        _txtWaMessage.Multiline = true;
        _txtWaMessage.ScrollBars = ScrollBars.Vertical;
        _txtEventDescription.Multiline = true;
        _txtEventDescription.ScrollBars = ScrollBars.Vertical;
        _txtPixDescription.Multiline = true;
        _txtPixDescription.ScrollBars = ScrollBars.Vertical;

        _dtpEventStart.Format = DateTimePickerFormat.Short;
        _dtpEventEnd.Format = DateTimePickerFormat.Short;
        _dtpEventStart.Value = DateTime.Now;
        _dtpEventEnd.Value = DateTime.Now.AddHours(1);

        foreach (var c in FieldControls())
        {
            if (c is TextBox tb)
                tb.TextChanged += OnFieldChanged;
            else if (c is ComboBox cb)
                cb.SelectedIndexChanged += OnFieldChanged;
            else if (c is CheckBox chk)
                chk.CheckedChanged += OnFieldChanged;
            else if (c is DateTimePicker dtp)
                dtp.ValueChanged += OnFieldChanged;
        }

        _cmbSize.SelectedIndexChanged += OnFieldChanged;
        _cmbEcc.SelectedIndexChanged += OnFieldChanged;

        _chkWifiHidden.Text = "Rede oculta";
    }

    private IEnumerable<Control> FieldControls()
    {
        yield return _txtUrl;
        yield return _txtText;
        yield return _txtMailTo;
        yield return _txtMailSubject;
        yield return _txtMailBody;
        yield return _txtPhoneCountry;
        yield return _txtPhoneNumber;
        yield return _txtSmsMessage;
        yield return _txtWaMessage;
        yield return _txtEventTitle;
        yield return _dtpEventStart;
        yield return _dtpEventEnd;
        yield return _txtEventLocation;
        yield return _txtEventDescription;
        yield return _txtGeoLat;
        yield return _txtGeoLng;
        yield return _txtWifiSsid;
        yield return _txtWifiPass;
        yield return _cmbWifiSec;
        yield return _chkWifiHidden;
        yield return _txtVcName;
        yield return _txtVcLastName;
        yield return _txtVcPhone;
        yield return _txtVcPhone2;
        yield return _txtVcEmail;
        yield return _txtVcOrg;
        yield return _txtVcRole;
        yield return _txtVcStreet;
        yield return _txtVcCity;
        yield return _txtVcZip;
        yield return _txtVcCountry;
        yield return _txtPixKey;
        yield return _txtPixName;
        yield return _txtPixCity;
        yield return _txtPixAmount;
        yield return _txtPixTxid;
        yield return _txtPixPostcode;
        yield return _txtPixDescription;
        yield return _chkPixSingleUse;
    }

    private IEnumerable<(string Label, Control Control)> RowsFor(QrCategory category) => category switch
    {
        QrCategory.Link => new[]
        {
            ("Link", (Control)_txtUrl)
        },
        QrCategory.Texto => new[]
        {
            ("Texto", (Control)_txtText)
        },
        QrCategory.Email => new[]
        {
            ("Destinatário", (Control)_txtMailTo),
            ("Assunto", (Control)_txtMailSubject),
            ("Mensagem", (Control)_txtMailBody)
        },
        QrCategory.Telefone => new[]
        {
            ("País (indicativo)", (Control)_txtPhoneCountry),
            ("Número", (Control)_txtPhoneNumber)
        },
        QrCategory.SMS => new[]
        {
            ("País (indicativo)", (Control)_txtPhoneCountry),
            ("Número", (Control)_txtPhoneNumber),
            ("Mensagem", (Control)_txtSmsMessage)
        },
        QrCategory.WhatsApp => new[]
        {
            ("País (indicativo)", (Control)_txtPhoneCountry),
            ("Número", (Control)_txtPhoneNumber),
            ("Mensagem", (Control)_txtWaMessage)
        },
        QrCategory.Evento => new[]
        {
            ("Título", (Control)_txtEventTitle),
            ("Data início", (Control)_dtpEventStart),
            ("Data fim", (Control)_dtpEventEnd),
            ("Local", (Control)_txtEventLocation),
            ("Descrição", (Control)_txtEventDescription)
        },
        QrCategory.Localizacao => new[]
        {
            ("Latitude", (Control)_txtGeoLat),
            ("Longitude", (Control)_txtGeoLng)
        },
        QrCategory.WiFi => new[]
        {
            ("Rede (SSID)", (Control)_txtWifiSsid),
            ("Password", (Control)_txtWifiPass),
            ("Segurança", (Control)_cmbWifiSec),
            ("Oculta", (Control)_chkWifiHidden)
        },
        QrCategory.VCard => new[]
        {
            ("Nome", (Control)_txtVcName),
            ("Apelido", (Control)_txtVcLastName),
            ("Telefone", (Control)_txtVcPhone),
            ("Telefone 2", (Control)_txtVcPhone2),
            ("Email", (Control)_txtVcEmail),
            ("Organização", (Control)_txtVcOrg),
            ("Cargo", (Control)_txtVcRole),
            ("Rua", (Control)_txtVcStreet),
            ("Cidade", (Control)_txtVcCity),
            ("Código postal", (Control)_txtVcZip),
            ("País", (Control)_txtVcCountry)
        },
        QrCategory.Pix => new[]
        {
            ("Chave PIX", (Control)_txtPixKey),
            ("Nome do recebedor", (Control)_txtPixName),
            ("Cidade", (Control)_txtPixCity),
            ("Valor (opcional)", (Control)_txtPixAmount),
            ("Txid (opcional)", (Control)_txtPixTxid),
            ("CEP (opcional)", (Control)_txtPixPostcode),
            ("Descrição (opcional)", (Control)_txtPixDescription),
            ("Uso único", (Control)_chkPixSingleUse)
        },
        _ => Array.Empty<(string, Control)>()
    };

    private void RebuildFields()
    {
        _fieldHost.Controls.Clear();
        _fieldY = 0;

        var category = (QrCategory)_cmbCategory.SelectedIndex;
        var linhas = RowsFor(category).ToArray();

        // **A coluna dos campos e' tao larga quanto o rotulo mais largo.**
        //
        // Era um `90` escrito a mao, e o `Pix` provou que estava errado: "Nome do
        // recebedor" mede 115 px e o texto entrava no campo. **E' o mesmo defeito
        // do painel de altura fixa, noutra dimensao** — um contentor com medida
        // fixa e conteudo variavel corta; uma coluna com medida fixa e rotulos
        // variaveis tapa.
        //
        // **A regra e' a das guardas dos codigos de barras: medir em vez de
        // contar.** E medir aqui tem uma propriedade que o numero nao tinha:
        // um rotulo novo nao obriga a mexer em lado nenhum. O `90` era um numero
        // que podia estar errado e ninguem via; este e' lido do proprio rotulo.
        int larguraRotulos = 0;
        foreach (var (label, control) in linhas)
        {
            if (control is CheckBox)
            {
                // A caixa ocupa a coluna toda e traz o proprio texto.
                continue;
            }

            larguraRotulos = Math.Max(larguraRotulos, MedirRotulo(label));
        }

        // **Oito pixele de folga entre o rotulo e o campo**, e nao zero: um texto
        // que chegue ao limite da medida nao deixa de encostar, porque a medicao
        // arredonda.
        int colunaCampos = larguraRotulos + 8;

        foreach (var (label, control) in linhas)
        {
            // **Uma `CheckBox` nao recebe etiqueta.** Traz o proprio texto, e a
            // etiqueta ia para `x = 0` como a caixa, uma linha abaixo: o texto
            // aparecia duas vezes, uma por cima da outra. O `AddOption` desta
            // mesma classe ja faz isto com `chk.Text = label`.
            if (control is not CheckBox)
            {
                var lbl = new Label
                {
                    Text = label,
                    AutoSize = true,
                    Location = new Point(0, _fieldY + 3)
                };
                _fieldHost.Controls.Add(lbl);
            }

            if (control is TextBox { Multiline: true } multi)
                multi.Height = ReferenceEquals(multi, _txtText) ? 150 : 64;

            control.Location = control is CheckBox
                ? new Point(0, _fieldY + 4)
                : new Point(colunaCampos, _fieldY);

            if (control is not CheckBox)
            {
                control.Width = Math.Max(
                    80, _fieldHost.ClientSize.Width - colunaCampos - 8);
            }
            _fieldHost.Controls.Add(control);

            int height = control is TextBox { Multiline: true } m
                ? (ReferenceEquals(m, _txtText) ? 150 : 64)
                : 24;
            _fieldY += height + 12;
        }
    }

    /// <summary>
    /// A largura de um rotulo, nas coordenadas de ecrã de hoje.
    /// </summary>
    /// <remarks>
    /// <b>Mede-se o texto com a fonte do formulario</b>, e nao com um numero de
    /// caracteres: "Nome do recebedor" e "Nome" tem o mesmo número de palavras e
    /// medidas completamente diferentes. Uma aproximacao por caracteres daria a
    /// mesma coluna para as duas e o problema continuava igual.
    /// </remarks>
    private int MedirRotulo(string texto)
    {
        // **É `TextRenderer` e não `Graphics.MeasureString`, e a diferença não é
        // de gosto.**
        //
        // `MeasureString` é GDI+, e um `Label` com `AutoSize` **desenha-se com as
        // métricas do GDI**. Os dois medem o mesmo texto e dão números diferentes.
        // **Medir com a métrica errada é pior do que não medir** — o `90` era um
        // número mágico, e a correção ia ser um número medido com a ferramenta
        // que não é a do desenho. O teste apanha o excesso, os rectângulos a
        // cruzar; não apanha uma coluna três pixele larga demais, que é apenas
        // feia.
        //
        // E é `TextRenderer` porque é o que o WinForms usa para medir texto, e
        // portanto o que o `Label` vai realmente ocupar.
        return TextRenderer.MeasureText(texto, Font).Width;
    }

    private QrFields CollectFields() => new()
    {
        Url = _txtUrl.Text,
        Texto = _txtText.Text,
        MailTo = _txtMailTo.Text,
        MailSubject = _txtMailSubject.Text,
        MailBody = _txtMailBody.Text,
        PhonePrefix = _txtPhoneCountry.Text,
        PhoneNumber = _txtPhoneNumber.Text,
        SmsMessage = _txtSmsMessage.Text,
        WaMessage = _txtWaMessage.Text,
        EventTitle = _txtEventTitle.Text,
        EventDescription = _txtEventDescription.Text,
        EventLocation = _txtEventLocation.Text,
        EventStart = _dtpEventStart.Value,
        EventEnd = _dtpEventEnd.Value,
        GeoLat = ParseCoord(_txtGeoLat.Text),
        GeoLng = ParseCoord(_txtGeoLng.Text),
        WifiSsid = _txtWifiSsid.Text,
        WifiPass = _txtWifiPass.Text,
        WifiSec = _cmbWifiSec.SelectedItem?.ToString(),
        WifiHidden = _chkWifiHidden.Checked,
        VcFirstName = _txtVcName.Text,
        VcLastName = _txtVcLastName.Text,
        VcPhone = _txtVcPhone.Text,
        VcPhone2 = _txtVcPhone2.Text,
        VcEmail = _txtVcEmail.Text,
        VcOrg = _txtVcOrg.Text,
        VcRole = _txtVcRole.Text,
        VcStreet = _txtVcStreet.Text,
        VcCity = _txtVcCity.Text,
        VcZip = _txtVcZip.Text,
        VcCountry = _txtVcCountry.Text,
        PixKey = _txtPixKey.Text,
        PixName = _txtPixName.Text,
        PixCity = _txtPixCity.Text,
        PixAmount = _txtPixAmount.Text,
        PixTxid = _txtPixTxid.Text,
        PixPostcode = _txtPixPostcode.Text,
        PixDescription = _txtPixDescription.Text,
        PixSingleUse = _chkPixSingleUse.Checked
    };

    /// <summary>
    /// Converte a caixa de texto numa coordenada. Aceita vírgula ou ponto como
    /// separador decimal, independentemente da cultura do Windows.
    /// </summary>
    private static double? ParseCoord(string text)
    {
        var s = (text ?? string.Empty).Trim().Replace(',', '.');
        if (s.Length == 0)
            return null;

        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private void OnCategoryChanged(object? sender, EventArgs e)
    {
        RebuildFields();
        Regenerate();
    }

    private void OnFieldChanged(object? sender, EventArgs e)
    {
        if (_chkAuto.Checked)
            Regenerate();
    }

    private void OnGenerateClicked(object? sender, EventArgs e) => Regenerate();

    private void Regenerate()
    {
        var category = (QrCategory)_cmbCategory.SelectedIndex;
        var fields = CollectFields();
        int size = int.TryParse(_cmbSize.SelectedItem?.ToString(), out var s) ? s : 512;
        var level = (EccLevel)_cmbEcc.SelectedIndex;

        if (QrRenderer.TryGenerate(category, fields, size, level, out var bmp, out var error))
        {
            _lblError.Visible = false;
            _preview.Image?.Dispose();
            _preview.Image = bmp;
            _btnSave.Enabled = true;
        }
        else
        {
            _lblError.Text = error ?? "Não foi possível gerar o QR code.";
            _lblError.Visible = true;
            _btnSave.Enabled = false;
        }
    }

    private void OnSaveClicked(object? sender, EventArgs e)
    {
        using var sfd = new SaveFileDialog
        {
            Title = "Guardar QR Code",
            Filter = "Imagem PNG (*.png)|*.png",
            FileName = "qrcode.png",
            OverwritePrompt = true
        };

        if (sfd.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            _preview.Image!.Save(sfd.FileName, ImageFormat.Png);
            MessageBox.Show(this, "QR code guardado com sucesso.", "Gerador de QR Codes",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Erro ao guardar o ficheiro:\n" + ex.Message, "Erro",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}