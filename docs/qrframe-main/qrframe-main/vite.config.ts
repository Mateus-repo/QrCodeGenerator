import { solidStart } from "@solidjs/start/config";
import { nitroV2Plugin as nitro } from "@solidjs/vite-plugin-nitro-2";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Serve under a sub-path. Must start and end with "/". Currently broken https://github.com/solidjs/solid-start/pull/2152
  // base: "/qrframe/",
  plugins: [
    UnoCSS(),
    solidStart({ ssr: true }),
    nitro({
      preset: "static",
      prerender: {
        crawlLinks: true,
      },
    }),
  ],
});
