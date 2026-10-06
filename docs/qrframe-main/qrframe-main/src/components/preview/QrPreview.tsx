import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import Share2 from "lucide-solid/icons/share-2";
import X from "lucide-solid/icons/x";
import { createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js";
import { useQrContext } from "~/lib/QrContext";
import { useRenderContext } from "~/lib/RenderContext";
import { ECL_LABELS } from "~/lib/options";
import { FlatButton } from "../Button";
import { toastError, toastSuccess } from "../ErrorToasts";
import { SplitButton } from "../SplitButton";

type Props = {
  classList: JSX.CustomAttributes<HTMLDivElement>["classList"];
  ref: HTMLDivElement;
};

export function QrPreview(props: Props) {
  const { output } = useQrContext();

  return (
    <div classList={props.classList} ref={props.ref}>
      <div class="max-w-[300px] md:max-w-full w-full self-center">
        <Show
          when={!output().err}
          fallback={
            <div class="checkerboard aspect-[1/1] border rounded-md p-2 text-black">
              {output().err!.message}
            </div>
          }
        >
          <RenderedQrCode />
        </Show>
      </div>
      <DownloadButtons />
      <Metadata class="hidden md:block" />
    </div>
  );
}

function RenderedQrCode() {
  const { render, error, svgParentRefs, addSvgParentRef, canvasRefs, addCanvasRef } =
    useRenderContext();

  let i = svgParentRefs.length;
  let j = canvasRefs.length;
  onCleanup(() => {
    svgParentRefs.splice(i, 1);
    canvasRefs.splice(j, 1);
  });

  return (
    <>
      <div class="checkerboard aspect-[1/1] border rounded-md grid [&>*]:[grid-area:1/1] overflow-hidden">
        <div
          classList={{
            hidden: render()?.type !== "svg",
          }}
          ref={addSvgParentRef}
        ></div>
        <canvas
          classList={{
            "w-full h-full image-render-pixel": true,
            hidden: render()?.type !== "canvas",
          }}
          ref={addCanvasRef}
        ></canvas>
        <Show when={error()}>
          <div class="bg-back-base/50 p-2">{error()}</div>
        </Show>
      </div>
    </>
  );
}

type MetadataProps = {
  class?: string;
};

function Metadata(props: MetadataProps) {
  const { output } = useQrContext();
  return (
    <div class={props.class}>
      <div class="text-sm pb-2 text-center">Alway try scanning your code, ideally in real conditions!</div>
      <Show when={!output().err}>
        <div class="font-bold text-sm pb-2">QR Metadata</div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="">
            Version
            <div class="font-bold text-base">
              {output().qr!.version} ({output().qr!.version * 4 + 17}x
              {output().qr!.version * 4 + 17} matrix)
            </div>
          </div>
          <div class="">
            Error tolerance{" "}
            <div class="font-bold text-base whitespace-pre">({ECL_LABELS[output().qr!.ecl]})</div>
          </div>
        </div>
      </Show>
    </div>
  );
}

function DownloadButtons() {
  const { output } = useQrContext();
  const { render, svgParentRefs, canvasRefs } = useRenderContext();
  const [copyState, setCopyState] = createSignal<"idle" | "success" | "error">("idle");
  const filename = () => output().text.slice(0, 32);
  let copyResetTimeout: number | undefined;

  const pngBlob = async (resizeWidth: number, resizeHeight: number) => {
    // roughly 20px per module, ranges from 500 to 3620px
    const minWidth = (output().qr!.version * 4 + 17 + 4) * 20;

    let outCanvas: HTMLCanvasElement;
    if (render()?.type === "canvas") {
      if (resizeWidth === 0 && resizeHeight === 0) {
        const size = Math.max(canvasRefs[0].width, minWidth);
        resizeWidth = size;
        resizeHeight = size;
      }
      // less blurry than ctx.drawImage w/ imageSmoothingEnabled = false
      const bitmap = await createImageBitmap(canvasRefs[0], {
        // resizeQuality not supported in ff, but output is passable
        resizeQuality: "pixelated",
        resizeWidth,
        resizeHeight,
      });
      outCanvas = document.createElement("canvas");
      outCanvas.width = resizeWidth;
      outCanvas.height = resizeHeight;
      const ctx = outCanvas.getContext("bitmaprenderer")!;
      ctx.transferFromImageBitmap(bitmap);
    } else {
      if (resizeWidth === 0 && resizeHeight === 0) {
        resizeWidth = minWidth;
        resizeHeight = minWidth;
      }
      outCanvas = document.createElement("canvas");
      outCanvas.width = resizeWidth;
      outCanvas.height = resizeHeight;
      const ctx = outCanvas.getContext("2d")!;

      const url = URL.createObjectURL(
        new Blob([svgParentRefs[0].innerHTML], {
          type: "image/svg+xml",
        }),
      );
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.drawImage(img, 0, 0, resizeWidth, resizeHeight);
      URL.revokeObjectURL(url);
    }

    return new Promise((resolve) => outCanvas.toBlob(resolve)) as Promise<Blob | null>;
  };

  const downloadSvg = async () => {
    const url = URL.createObjectURL(
      new Blob([svgParentRefs[0].innerHTML], {
        type: "image/svg+xml",
      }),
    );
    download(url, `${filename()}.svg`);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    try {
      const png = await pngBlob(0, 0);
      if (png == null) throw "Failed to create PNG";

      const clipboardData: Record<string, Blob> = {
        "image/png": png,
      };
      if (render()?.type === "svg") {
        // The mimetype of "image/svg+xml" is not able to be written to clipboard, but apps like Figma accept "text/plain" SVG data
        clipboardData["text/plain"] = new Blob([svgParentRefs[0].innerHTML], {
          type: "text/plain",
        });
      }

      await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
      setCopyState("success");
      toastSuccess("Copied to clipboard");
    } catch (e) {
      setCopyState("error");
      toastError("Failed to copy", typeof e === "string" ? e : "Clipboard write failed");
    }
    clearTimeout(copyResetTimeout);
    copyResetTimeout = window.setTimeout(() => setCopyState("idle"), 1500);
  };

  return (
    <div class="flex gap-2 md:(grid grid-cols-[1fr_1fr_auto])">
      <SplitButton
        disabled={!!output().err}
        onPng={async (resizeWidth, resizeHeight) => {
          try {
            const blob = await pngBlob(resizeWidth, resizeHeight);
            if (blob == null) throw "toBlob returned null";

            const url = URL.createObjectURL(blob);
            download(url, `${filename()}.png`);
            URL.revokeObjectURL(url);
          } catch (e) {
            toastError("Failed to create image", e as string);
            return;
          }
        }}
        onSvg={downloadSvg}
      />
      <Show when={render()?.type === "svg"}>
        <FlatButton
          class="hidden md:inline-flex flex-1 justify-center items-center gap-1 px-3 py-2"
          disabled={!!output().err}
          onClick={downloadSvg}
        >
          <Download size={20} />
          SVG
        </FlatButton>
      </Show>
      <FlatButton
        class="inline-flex justify-center items-center px-3 py-2"
        disabled={!!output().err}
        title="Copy to clipboard"
        onClick={copyToClipboard}
      >
        <Switch fallback={<Copy size={20} />}>
          <Match when={copyState() === "success"}>
            <Check size={20} class="text-green-500" />
          </Match>
          <Match when={copyState() === "error"}>
            <X size={20} class="text-red-500" />
          </Match>
        </Switch>
      </FlatButton>
      <FlatButton
        class="md:hidden justify-center items-center px-3 py-2"
        disabled={!!output().err}
        title="Share"
        onClick={async () => {
          let blob;
          try {
            blob = await pngBlob(0, 0);
            if (blob == null) throw "toBlob returned null";
          } catch (e) {
            toastError("Failed to create image", typeof e === "string" ? e : "pngBlob failed");
            return;
          }
          try {
            const shareData = {
              files: [
                new File([blob], `${filename()}.png`, {
                  type: "image/png",
                }),
              ],
            };
            if (!navigator.canShare(shareData)) {
              throw new Error();
            }
            navigator.share(shareData);
          } catch (e) {
            console.log(e);
            toastError("Native sharing failed", "File sharing not supported by browser");
          }
        }}
      >
        <Share2 size={20} />
      </FlatButton>
    </div>
  );
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
