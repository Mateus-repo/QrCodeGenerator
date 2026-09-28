# Java — app desktop

**Stack planeada:** Java 21 / JavaFX / ZXing core (Apache-2.0)
**Estado:** ⬜ por fazer — pasta vazia de propósito

O ZXing é a mesma biblioteca que a stack Kotlin vai usar. É uma escolha
deliberada: a mesma biblioteca tem os mesmos bugs e a mesma resposta a payloads
malformados, o que torna a comparação entre as duas stacks útil.

## Racional

- JavaFX dá uma UI moderne sem ser uma web app embrulhada.
- `jpackage` gera `.exe` e `.dmg` a partir do mesmo código, sem instalador.
- JavaFX traz `SwingNode`/`ImageView` com cache, para o preview dar zoom suave
  quando se passa o rato.

## Esplanado

```
java/desktop-javafx/
├── pom.xml  (ou build.gradle)
├── src/main/java/…/
│   ├── App.java          — ponto de entrada
│   ├── Payloads.java     — espelha python/qrcode_core/pix.py
│   ├── QrView.java       — preview e export
│   └── MainView.java     — formulários por categoria
└── src/test/java/…/     — testes a ler ../spec/vectors.json
```

## Primeiro passo

`Payloads.java` a reproduzir `spec/vectors.json` campo a campo, e um teste que
compare a string gerada com a esperada. Só depois a UI.

Ver `../docs/IDEIA.md` secção 4 para a decisão de stack e `../docs/TODO.md`
para a ordem de trabalho.
