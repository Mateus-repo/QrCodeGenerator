package com.qrcodegen.app;

import com.qrcodegen.core.EccLevel;
import com.qrcodegen.core.QrCategory;
import com.qrcodegen.core.QrFields;
import com.qrcodegen.core.pix.Pix;
import com.qrcodegen.core.pix.PixException;

import java.nio.file.Path;
import java.util.Locale;

/**
 * Linha de comandos, sem interface gráfica.
 *
 * <p>Existe por três motivos: dá para gerar QR em série a partir de um script,
 * não exige ecrã ( corre num servidor), e deixa a app gráfica livre de lógica.
 *
 * <p>Os códigos de saída são pensados para scripts: {@code 0} sucesso,
 * {@code 1} erro de validação, {@code 2} payload lido com CRC inválido.
 */
public final class Cli {

    private Cli() {
    }

    public static void main(String[] args) {
        if (args.length == 0 || args[0].equals("--help") || args[0].equals("-h")) {
            usage();
            System.exit(args.length == 0 ? 1 : 0);
        }

        try {
            System.exit(switch (args[0]) {
                case "pix" -> pix(args);
                case "pix-leer" -> pixLer(args);
                case "fix-crc" -> fixCrc(args);
                default -> {
                    System.err.println("Comando desconhecido: " + args[0]);
                    usage();
                    yield 1;
                }
            });
        } catch (PixException e) {
            System.err.println("erro: " + e.getMessage());
            System.exit(1);
        } catch (RuntimeException | java.io.IOException | com.google.zxing.WriterException e) {
            System.err.println("erro: " + e.getMessage());
            System.exit(1);
        }
    }

    private static int pix(String[] args) throws java.io.IOException, com.google.zxing.WriterException {
        Options options = Options.parse(args, 1);

        String key = options.require("key");
        String name = options.require("name");
        String city = options.require("city");

        QrFields fields = new QrFields()
                .pixKey(key)
                .pixName(name)
                .pixCity(city)
                .pixAmount(options.get("amount", ""))
                .pixTxid(options.get("txid", ""))
                .pixDescription(options.get("description", ""))
                .pixPostcode(options.get("postcode", ""))
                .pixSingleUse(options.flag("single-use"));

        EccLevel level = EccLevel.valueOf(options.get("ecc", "M").toUpperCase(Locale.ROOT));
        String format = options.get("format", "png");
        String output = options.get("out", null);

        QrRenderer.Result result = QrRenderer.generate(QrCategory.PIX, fields, 512, level);
        if (!result.ok()) {
            System.err.println("erro: " + result.error());
            return 1;
        }

        System.out.println(result.payload());
        System.err.printf("chave: %s | %d bytes | %d módulos | ECC %s%n",
                com.qrcodegen.core.pix.PixKey.typeOf(key),
                result.payload().length(), result.modules(), level);

        if (output != null) {
            Path target = Path.of(output);
            if (format.equals("svg")) {
                QrRenderer.writeText(target, QrRenderer.toSvg(result.payload(), level));
            } else {
                QrRenderer.writePng(target, result.png());
            }
            System.err.println("-> " + target);
        }

        return 0;
    }

    private static int pixLer(String[] args) {
        if (args.length < 2) {
            System.err.println("uso: qrcli pix-leer \"<payload>\"");
            return 1;
        }

        Pix.Parsed parsed = Pix.parse(args[1]);
        var p = parsed.payload();

        System.out.println("CRC válido: " + (parsed.crcValid() ? "sim" : "NÃO — use `fix-crc`"));
        System.out.printf("chave:     %s  (%s)%n", p.key(),
                com.qrcodegen.core.pix.PixKey.typeOf(p.key()).name().toLowerCase(Locale.ROOT));
        System.out.println("nome:      " + p.name());
        System.out.println("cidade:    " + p.city());
        System.out.println("valor:     " + (p.amount() != null ? p.amount().toPlainString() : "(o pagador escolhe)"));
        System.out.println("txid:      " + p.txid());
        if (!p.description().isEmpty()) {
            System.out.println("descrição: " + p.description());
        }
        if (!p.postcode().isEmpty()) {
            System.out.println("CEP:       " + p.postcode());
        }
        if (p.singleUse()) {
            System.out.println("uso:       único (campo 01 = 12)");
        }
        if (parsed.url() != null) {
            System.out.println("URL:       " + parsed.url() + "  (PIX dinâmico — consulta no servidor)");
        }

        return parsed.crcValid() ? 0 : 2;
    }

    private static int fixCrc(String[] args) {
        if (args.length < 2) {
            System.err.println("uso: qrcli fix-crc \"<payload>\"");
            return 1;
        }
        System.out.println(Pix.fixCrc(args[1]));
        return 0;
    }

    private static void usage() {
        System.out.println("""

                qrcli — gerador de QR codes (PIX)

                USOS
                  pix --key <chave> --name <nome> --city <cidade> [opções]
                  pix-leer "<payload>"
                  fix-crc "<payload>"

                CHAVES ACEITES
                  CPF              529.982.247-25
                  CNPJ             11.222.333/0001-81
                  Telefone         5511966666666  ou  +55 11 96666-6666
                  Email            fulano@example.com
                  Chave aleatória  123e4567-e12b-12d1-a456-426655440000

                OPÇÕES DO PIX
                  --key <chave>          obrigatório
                  --name <nome>          obrigatório, máximo 25
                  --city <cidade>        obrigatório, máximo 15
                  --amount <valor>       opcional, aceita 25,75 e 25.75
                  --txid <id>            opcional, máximo 25 alfanuméricos
                  --description <texto>  opcional (campo 26.02)
                  --postcode <cep>       opcional (campo 61)
                  --single-use           QR de uso único
                  --out <ficheiro>       grava em vez de só imprimir
                  --format png|svg       predefinição: png
                  --ecc L|M|Q|H          predefinição: M

                EXEMPLOS
                  qrcli pix --key 529.982.247-25 --name "Ana Silva" \\
                      --city "Belo Horizonte" --amount 25,75 -o pix.png
                  qrcli pix-leer "00020126...63041D3D"
                  qrcli fix-crc "00020126...63040000"

                CÓDIGOS DE SAÍDA
                  0 sucesso · 1 erro de validação · 2 payload com CRC inválido
                """);
    }

    /** Opções {@code --chave valor} e {@code --flag}. */
    private record Options(java.util.Map<String, String> values, java.util.Set<String> flags) {

        static Options parse(String[] args, int from) {
            java.util.Map<String, String> values = new java.util.LinkedHashMap<>();
            java.util.Set<String> flags = new java.util.LinkedHashSet<>();

            for (int i = from; i < args.length; i++) {
                String arg = args[i];
                if (!arg.startsWith("--")) {
                    continue;
                }

                String key = arg.substring(2);
                if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                    values.put(key, args[i + 1]);
                    i++;
                } else {
                    flags.add(key);
                }
            }

            return new Options(values, flags);
        }

        String get(String key, String fallback) {
            return values.getOrDefault(key, fallback);
        }

        boolean flag(String key) {
            return flags.contains(key);
        }

        String require(String key) {
            String value = values.get(key);
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("falta a opção --" + key);
            }
            return value;
        }
    }
}
