using System.Drawing.Imaging;

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
    private readonly TextBox _txtVcPhone = new();
    private readonly TextBox _txtVcEmail = new();
    private readonly TextBox _txtVcOrg = new();
    private readonly TextBox _txtVcRole = new();

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

        _fieldHost = new Panel { Location = new Point(120, 44), Size = new Size(280, 280) };

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
        AddOption(_chkAuto, "Auto-gerar ao digitar", optY + 34, 0);

        _btnGenerate.Text = "Gerar QR Code";
        _btnGenerate.Size = new Size(160, 34);
        _btnGenerate.Location = new Point(120, optY + 70);
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
        _lblError.Location = new Point(15, optY + 118);
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
            Location = new Point(x + 4, y + 3)
        };
        combo.Location = new Point(x + 90, y);
        combo.Size = new Size(80, 26);
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
        foreach (var name in Enum.GetNames(typeof(QrCategory)))
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
        yield return _txtVcPhone;
        yield return _txtVcEmail;
        yield return _txtVcOrg;
        yield return _txtVcRole;
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
        QrCategory.Localização => new[]
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
            ("Telefone", (Control)_txtVcPhone),
            ("Email", (Control)_txtVcEmail),
            ("Organização", (Control)_txtVcOrg),
            ("Cargo", (Control)_txtVcRole)
        },
        _ => Array.Empty<(string, Control)>()
    };

    private void RebuildFields()
    {
        _fieldHost.Controls.Clear();
        _fieldY = 0;

        var category = (QrCategory)_cmbCategory.SelectedIndex;
        foreach (var (label, control) in RowsFor(category))
        {
            var lbl = new Label
            {
                Text = label,
                AutoSize = true,
                Location = new Point(0, _fieldY + 3)
            };
            _fieldHost.Controls.Add(lbl);

            control.Location = new Point(90, _fieldY);
            control.Width = _fieldHost.ClientSize.Width - 90 - 8;
            if (control is TextBox { Multiline: true } multi)
                multi.Height = 64;
            _fieldHost.Controls.Add(control);

            int height = control is TextBox { Multiline: true } ? 64 : 24;
            _fieldY += height + 12;
        }
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
        GeoLat = _txtGeoLat.Text,
        GeoLng = _txtGeoLng.Text,
        WifiSsid = _txtWifiSsid.Text,
        WifiPass = _txtWifiPass.Text,
        WifiSec = _cmbWifiSec.SelectedItem?.ToString(),
        WifiHidden = _chkWifiHidden.Checked,
        VcName = _txtVcName.Text,
        VcPhone = _txtVcPhone.Text,
        VcEmail = _txtVcEmail.Text,
        VcOrg = _txtVcOrg.Text,
        VcRole = _txtVcRole.Text
    };

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

        if (QrService.TryGenerate(category, fields, size, level, out var bmp, out var error))
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