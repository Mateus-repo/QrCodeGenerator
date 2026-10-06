import { ByteEncoder, FuriousQrError, Mask, generateWithEncoder, type Ecl } from "furious-qr";
import { AlphanumericEncoder, MixedEncoder, NumericEncoder } from "furious-qr/extras/encoders";
import { createContext, createMemo, useContext, type Accessor, type JSX } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { EncoderName } from "./options";

type InputQr = {
  text: string;
  minVersion: number;
  exactVersion: boolean;
  minEcl: Ecl;
  exactEcl: boolean;
  encoder: EncoderName;
  mask: Mask;
};

export type OutputQr = Readonly<{
  text: string;
  version: number;
  ecl: Ecl;
  mask: Mask;
  matrix: Uint8Array;
}>;

type Output =
  | {
    text: string;
    qr: {
      version: number;
      ecl: Ecl;
      mask: Mask;
      matrix: Uint8Array;
    };
    err: null;
  }
  | {
    text: string;
    qr: null;
    err: FuriousQrError;
  };

export const QrContext = createContext<{
  inputQr: InputQr;
  setInputQr: SetStoreFunction<InputQr>;
  output: Accessor<Output>;
}>();

export function QrContextProvider(props: { children: JSX.Element }) {
  const [inputQr, setInputQr] = createStore<InputQr>({
    text: "https://qrframe.kylezhe.ng",
    minVersion: 1,
    exactVersion: false,
    minEcl: 0,
    exactEcl: false,
    encoder: "Byte",
    mask: 2,
  });

  const output = createMemo(() => {
    try {
      let encoder;
      switch (inputQr.encoder) {
        case "Byte":
          encoder = new ByteEncoder(inputQr.text);
          break;
        case "Alphanumeric":
          encoder = new AlphanumericEncoder(inputQr.text);
          break;
        case "Numeric":
          encoder = new NumericEncoder(inputQr.text);
          break;
        case "Multi-segment":
          encoder = new MixedEncoder(inputQr.text);
          break;
        default:
          encoder = new ByteEncoder(inputQr.text);
      }
      const qr = generateWithEncoder(encoder, {
        minVersion: inputQr.minVersion,
        maxVersion: inputQr.exactVersion ? inputQr.minVersion : 40,
        minEcl: inputQr.minEcl,
        maxEcl: inputQr.exactEcl ? inputQr.minEcl : 3,
        mask: inputQr.mask,
      });
      return {
        text: inputQr.text,
        qr,
        err: null,
      };
    } catch (e) {
      return {
        text: inputQr.text,
        qr: null,
        err: e as FuriousQrError,
      };
    }
  });

  return (
    <QrContext.Provider
      value={{
        inputQr,
        setInputQr,
        output,
      }}
    >
      {props.children}
    </QrContext.Provider>
  );
}

export function useQrContext() {
  const context = useContext(QrContext);
  if (!context) {
    throw new Error("useQrContext: used outside QrContextProvider");
  }
  return context;
}
