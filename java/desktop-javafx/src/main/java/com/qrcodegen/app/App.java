package com.qrcodegen.app;

import com.qrcodegen.core.EccLevel;
import com.qrcodegen.core.QrCategory;
import com.qrcodegen.core.QrFields;
import com.qrcodegen.core.QrPayloadBuilder;
import com.qrcodegen.core.QrValidator;
import javafx.application.Application;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.SelectionMode;
import javafx.scene.control.TextArea;
import javafx.scene.control.TextField;
import javafx.scene.control.TitledPane;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.FlowPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Interface gráfica em JavaFX.
 *
 * <p>Porquê JavaFX e não Swing: controlos com estilo consistente em todos os
 * sistemas, e {@code jpackage} a gerar instaladores nativos para Windows,
 * macOS e Linux a partir do mesmo código. Swing ficou Looks and Feels para os
 * natives e não tem equivalente em Linux.
 *
 * <h2>Portabilidade</h2>
 * <ul>
 *   <li>Sem caminhos escritos à mão: {@link FileChooser} dá a portability das
 *       extensões.</li>
 *   <li>Sem separadores de ficheiro literais.</li>
 *   <li>Sem ler propriedades do sistema para escolher cores — o JavaFX segue
 *       o tema do sistema operativo, e o mesmo código fica claro e escuro
 *       conforme o SO.</li>
 * </ul>
 */
public class App extends Application {

    private final ComboBox<QrCategory> category = new ComboBox<>();
    private final VBox fieldHost = new VBox(8);
    private final ImageView preview = new ImageView();
    private final Label error = new Label();
    private final Label info = new Label();
    private final ComboBox<Integer> size = new ComboBox<>();
    private final ComboBox<EccLevel> ecc = new ComboBox<>();
    private final CheckBox auto = new CheckBox("Gerar enquanto digito");
    private final TextArea payloadView = new TextArea();
    private final Button savePng = new Button("Guardar PNG");
    private final Button saveSvg = new Button("Guardar SVG");

    private final QrFields fields = new QrFields();
    private byte[] currentPng;
    private String currentPayload;

    @Override
    public void start(Stage stage) {
        category.getItems().setAll(QrCategory.values());
        category.setValue(QrCategory.LINK);
        category.disableProperty();

        size.getItems().setAll(256, 512, 1024, 2048);
        size.setValue(512);

        ecc.getItems().setAll(EccLevel.values());
        ecc.setValue(EccLevel.M);

        auto.setSelected(true);

        preview.setPreserveRatio(true);
        preview.setFitWidth(420);
        preview.setFitHeight(420);

        error.getStyleClass().add("error");
        error.setWrapText(true);
        error.setVisible(false);
        error.setManaged(false);

        info.getStyleClass().add("info");
        info.setWrapText(true);

        payloadView.setEditable(false);
        payloadView.setPrefRowCount(4);
        payloadView.setWrapText(true);

        savePng.setOnAction(e -> save("png"));
        saveSvg.setOnAction(e -> save("svg"));

        category.valueProperty().addListener((o, antigo, novo) -> rebuildFields(novo));
        size.valueProperty().addListener((o, a, b) -> regenerate());
        ecc.valueProperty().addListener((o, a, b) -> regenerate());
        auto.selectedProperty().addListener((o, a, b) -> {
            if (b) {
                regenerate();
            }
        });

        BorderPane root = new BorderPane();
        root.setPadding(new Insets(16));
        root.setTop(buildHeader());
        root.setCenter(buildBody());
        root.setBottom(buildFooter());

        Scene scene = new Scene(root, 1000, 720);
        scene.getStylesheets().add(App.class.getResource("/com/qrcodegen/app/app.css").toExternalForm());

        stage.setTitle("Gerador de QR codes");
        stage.setScene(scene);
        stage.setMinWidth(760);
        stage.setMinHeight(560);
        stage.show();

        rebuildFields(category.getValue());
        regenerate();
    }

    // --- Construção da interface ------------------------------------------

    private VBox buildHeader() {
        Label title = new Label("Gerador de QR codes");
        title.getStyleClass().add("title");

        HBox header = new HBox(12, title, new Label("Tudo corre no teu computador."));
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(0, 0, 12, 0));
        return new VBox(header);
    }

    private HBox buildBody() {
        VBox left = new VBox(10);
        left.setPadding(new Insets(0, 0, 0, 12));
        HBox.setHgrow(left, Priority.ALWAYS);

        category.setPrefWidth(Double.MAX_VALUE);
        category.setMaxWidth(Double.MAX_VALUE);
        left.getChildren().addAll(category, fieldHost, buildOptions());

        VBox right = new VBox(10);
        right.setPadding(new Insets(0, 12, 0, 0));
        right.setAlignment(Pos.TOP_CENTER);
        HBox.setHgrow(right, Priority.ALWAYS);
        right.getChildren().addAll(preview, error, info);

        HBox body = new HBox(left, right);
        HBox.setHgrow(body, Priority.ALWAYS);
        return body;
    }

    private TitledPane buildOptions() {
        TitledPane pane = new TitledPane();
        pane.setText("Opções");
        pane.setExpanded(false);

        HBox row = new HBox(10);
        VBox sizeBox = new VBox(4, new Label("Tamanho"), size);
        VBox eccBox = new VBox(4, new Label("Correção de erros"), ecc);
        size.setPrefWidth(110);
        ecc.setPrefWidth(110);
        row.getChildren().addAll(sizeBox, eccBox, auto);
        row.setAlignment(Pos.CENTER_LEFT);

        VBox content = new VBox(8, row);
        content.setPadding(new Insets(8));
        pane.setContent(content);
        return pane;
    }

    private VBox buildFooter() {
        HBox row = new HBox(8, savePng, saveSvg);
        row.setAlignment(Pos.CENTER_LEFT);

        TitledPane payloadPane = new TitledPane();
        payloadPane.setText("Ver o que vai dentro do QR code");
        payloadPane.setExpanded(false);
        payloadView.setPrefRowCount(3);
        payloadView.setWrapText(true);
        VBox payloadContent = new VBox(6, payloadView);
        payloadContent.setPadding(new Insets(8));
        payloadPane.setContent(payloadContent);

        VBox footer = new VBox(10, row, payloadPane);
        footer.setPadding(new Insets(12, 0, 0, 0));
        return footer;
    }

    // --- Formulário --------------------------------------------------------

    /** Um campo do formulário e como lê/escreve o valor. */
    private record Row(String label, javafx.scene.Node control, Consumer<String> setter,
                       Supplier<String> getter) {
    }

    private void rebuildFields(QrCategory selected) {
        fieldHost.getChildren().clear();
        for (Row row : rowsFor(selected)) {
            VBox box = new VBox(4, new Label(row.label()), row.control());
            fieldHost.getChildren().add(box);
        }
    }

    private List<Row> rowsFor(QrCategory selected) {
        return switch (selected) {
            case LINK -> List.of(
                    text("Link", "exemplo.pt", v -> fields.url(v), () -> fields.url()));
            case TEXTO -> List.of(
                    area("Texto", v -> fields.texto(v), () -> fields.texto()));
            case EMAIL -> List.of(
                    text("Destinatário", "ana@exemplo.pt", v -> fields.mailTo(v), () -> fields.mailTo()),
                    text("Assunto", "", v -> fields.mailSubject(v), () -> fields.mailSubject()),
                    area("Mensagem", v -> fields.mailBody(v), () -> fields.mailBody()));
            case TELEFONE, SMS, WHATSAPP -> phoneRows(selected);
            case EVENTO -> eventRows();
            case LOCALIZACAO -> List.of(
                    text("Latitude", "38.7223", v -> fields.geoLat(parseCoord(v)), () -> str(fields.geoLat())),
                    text("Longitude", "-9.1393", v -> fields.geoLng(parseCoord(v)), () -> str(fields.geoLng())));
            case WIFI -> List.of(
                    text("Rede (SSID)", "", v -> fields.wifiSsid(v), () -> fields.wifiSsid()),
                    text("Password", "", v -> fields.wifiPass(v), () -> fields.wifiPass()),
                    choice("Segurança", List.of("WPA/WPA2", "WEP", "Aberto"),
                            v -> fields.wifiSec(v), () -> fields.wifiSec()),
                    check("Rede oculta", v -> fields.wifiHidden(Boolean.parseBoolean(v)),
                            () -> String.valueOf(fields.wifiHidden())));
            case VCARD -> vcardRows();
            case PIX -> List.of(
                    text("Chave PIX", "CPF, CNPJ, +55, email ou UUID", v -> fields.pixKey(v), () -> fields.pixKey()),
                    text("Nome do recebedor", "", v -> fields.pixName(v), () -> fields.pixName()),
                    text("Cidade", "", v -> fields.pixCity(v), () -> fields.pixCity()),
                    text("Valor (opcional)", "25,75", v -> fields.pixAmount(v), () -> fields.pixAmount()),
                    text("Txid (opcional)", "", v -> fields.pixTxid(v), () -> fields.pixTxid()),
                    text("CEP (opcional)", "", v -> fields.pixPostcode(v), () -> fields.pixPostcode()),
                    area("Descrição (opcional)", v -> fields.pixDescription(v), () -> fields.pixDescription()),
                    check("Uso único", v -> fields.pixSingleUse(Boolean.parseBoolean(v)),
                            () -> String.valueOf(fields.pixSingleUse())));
        };
    }

    private List<Row> phoneRows(QrCategory selected) {
        List<Row> rows = new java.util.ArrayList<>();
        rows.add(text("País (indicativo)", "+351", v -> fields.phonePrefix(v), () -> fields.phonePrefix()));
        rows.add(text("Número", "", v -> fields.phoneNumber(v), () -> fields.phoneNumber()));

        if (selected == QrCategory.SMS) {
            rows.add(area("Mensagem", v -> fields.smsMessage(v), () -> fields.smsMessage()));
        } else if (selected == QrCategory.WHATSAPP) {
            rows.add(area("Mensagem", v -> fields.waMessage(v), () -> fields.waMessage()));
        }

        return rows;
    }

    private List<Row> eventRows() {
        return List.of(
                text("Título", "", v -> fields.eventTitle(v), () -> fields.eventTitle()),
                text("Data início (AAAA-MM-DD HH:MM)", "2026-01-01 10:00",
                        v -> fields.eventStart(parseDateTime(v)), () -> str(fields.eventStart())),
                text("Data fim (AAAA-MM-DD HH:MM)", "2026-01-01 11:00",
                        v -> fields.eventEnd(parseDateTime(v)), () -> str(fields.eventEnd())),
                text("Local", "", v -> fields.eventLocation(v), () -> fields.eventLocation()),
                area("Descrição", v -> fields.eventDescription(v), () -> fields.eventDescription()));
    }

    private List<Row> vcardRows() {
        return List.of(
                text("Nome", "", v -> fields.vcFirstName(v), () -> fields.vcFirstName()),
                text("Apelido", "", v -> fields.vcLastName(v), () -> fields.vcLastName()),
                text("Telefone", "", v -> fields.vcPhone(v), () -> fields.vcPhone()),
                text("Telefone 2", "", v -> fields.vcPhone2(v), () -> fields.vcPhone2()),
                text("Email", "", v -> fields.vcEmail(v), () -> fields.vcEmail()),
                text("Organização", "", v -> fields.vcOrg(v), () -> fields.vcOrg()),
                text("Cargo", "", v -> fields.vcRole(v), () -> fields.vcRole()),
                text("Rua", "", v -> fields.vcStreet(v), () -> fields.vcStreet()),
                text("Cidade", "", v -> fields.vcCity(v), () -> fields.vcCity()),
                text("Código postal", "", v -> fields.vcZip(v), () -> fields.vcZip()),
                text("País", "", v -> fields.vcCountry(v), () -> fields.vcCountry()));
    }

    private Row text(String label, String placeholder, Consumer<String> setter, Supplier<String> getter) {
        TextField field = new TextField();
        field.setPromptText(placeholder);
        field.setText(getter.get() == null ? "" : getter.get());
        field.textProperty().addListener((o, a, b) -> {
            setter.accept(b);
            onEdit();
        });
        return new Row(label, field, setter, getter);
    }

    private Row area(String label, Consumer<String> setter, Supplier<String> getter) {
        TextArea area = new TextArea();
        area.setPrefRowCount(3);
        area.setWrapText(true);
        area.setText(getter.get() == null ? "" : getter.get());
        area.textProperty().addListener((o, a, b) -> {
            setter.accept(b);
            onEdit();
        });
        return new Row(label, area, setter, getter);
    }

    private Row choice(String label, List<String> options, Consumer<String> setter, Supplier<String> getter) {
        ComboBox<String> combo = new ComboBox<>(FXCollections.observableArrayList(options));
        combo.getSelectionModel().select(options.indexOf(getter.get()));
        combo.setMaxWidth(Double.MAX_VALUE);
        combo.valueProperty().addListener((o, a, b) -> {
            if (b != null) {
                setter.accept(b);
                onEdit();
            }
        });
        return new Row(label, combo, setter, getter);
    }

    private Row check(String label, Consumer<String> setter, Supplier<String> getter) {
        CheckBox box = new CheckBox();
        box.setText(label);
        box.setSelected(Boolean.parseBoolean(getter.get()));
        box.selectedProperty().addListener((o, a, b) -> {
            setter.accept(String.valueOf(b));
            onEdit();
        });
        // A linha já traz o rótulo da Row; esvaziamos para não repetir.
        return new Row("", box, setter, getter);
    }

    private void onEdit() {
        if (auto.isSelected()) {
            regenerate();
        }
    }

    // --- Geração -----------------------------------------------------------

    private void regenerate() {
        QrCategory selected = category.getValue();
        if (selected == null) {
            return;
        }

        String validation = QrValidator.validate(selected, fields);
        if (validation != null) {
            showError(validation);
            return;
        }

        QrRenderer.Result result = QrRenderer.generate(selected, fields, size.getValue(), ecc.getValue());
        if (!result.ok()) {
            showError(result.error());
            return;
        }

        error.setVisible(false);
        error.setManaged(false);
        preview.setImage(new Image(new ByteArrayInputStream(result.png())));

        currentPng = result.png();
        currentPayload = result.payload();
        payloadView.setText(currentPayload);

        info.setText("%d×%d módulos · %d bytes de %d (ECC %s)"
                .formatted(result.modules(), result.modules(), currentPayload.length(),
                        com.qrcodegen.core.QrCapacity.limitFor(ecc.getValue()), ecc.getValue()));

        savePng.setDisable(false);
        saveSvg.setDisable(false);
    }

    private void showError(String message) {
        error.setText(message);
        error.setVisible(true);
        error.setManaged(true);
        preview.setImage(null);
        currentPng = null;
        currentPayload = null;
        savePng.setDisable(true);
        saveSvg.setDisable(true);
    }

    // --- Guardar -----------------------------------------------------------

    private void save(String format) {
        if (currentPayload == null) {
            return;
        }

        FileChooser chooser = new FileChooser();
        chooser.setTitle("Guardar QR code");
        chooser.setInitialFileName("qrcode." + format);
        chooser.getExtensionFilters().addAll(
                new FileChooser.ExtensionFilter(format.toUpperCase(Locale.ROOT) + " (*." + format + ")",
                        "*." + format));

        // O FileChooser do JavaFX trata de filtros, extensões e caminhos de
        // cada plataforma. Não se escreve um caminho à mão.
        File target = chooser.showSaveDialog(preview.getScene().getWindow());
        if (target == null) {
            return;
        }

        try {
            Path path = target.toPath();
            if (format.equals("svg")) {
                QrRenderer.writeText(path, QrRenderer.toSvg(currentPayload, ecc.getValue()));
            } else {
                QrRenderer.writePng(path, currentPng);
            }
        } catch (IOException | com.google.zxing.WriterException e) {
            showError("Erro ao guardar: " + e.getMessage());
        }
    }

    // --- Conversões --------------------------------------------------------

    /** Converte a caixa de texto numa coordenada, com vírgula ou ponto. */
    private static Double parseCoord(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Double.valueOf(value.strip().replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime parseDateTime(String value) {
        try {
            return LocalDateTime.parse(value.strip().replace(' ', 'T'));
        } catch (java.time.format.DateTimeParseException e) {
            return LocalDateTime.of(LocalDate.now(), java.time.LocalTime.MIDNIGHT);
        }
    }

    private static String str(Double value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String str(LocalDateTime value) {
        return value == null ? "" : value.toString().replace('T', ' ');
    }

    public static void main(String[] args) {
        launch(args);
    }
}
