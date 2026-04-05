import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

import pkg from "./package.json";

export default defineConfig({
  build: {
    minify: false,
    cssMinify: true,
    sourcemap: false
  },
  esbuild: {
    legalComments: "none",
    minifyIdentifiers: false,
    minifySyntax: true,
    minifyWhitespace: true
  },
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "B站批量移除粉丝（支持批量移除非互粉用户）",
        namespace: "bilibili-fans-cleaner-v4",
        version: pkg.version,
        description: "批量移除 B 站粉丝，清理僵尸粉（支持批量移除非互粉用户）",
        author: "Kaesinol, aryayaya",
        match: ["https://space.bilibili.com/*"],
        connect: ["api.bilibili.com"],
        grant: ["GM_setValue", "GM_getValue"],
        license: "GPL-3.0",
        noframes: true,
        icon: "https://www.bilibili.com/favicon.ico",
        website: "https://github.com/kaixinol/bilibili-fans-remover-userscript",
        supportURL: "https://github.com/kaixinol/bilibili-fans-remover-userscript/issues"
      },
      build: {
        fileName: "bilibili-fans-remover.user.js",
        externalGlobals: {
          alpinejs: cdn.jsdelivr("Alpine", "dist/cdn.min.js")
        }
      }
    })
  ]
});
