import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

import pkg from "./package.json";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "[Bilibili] 批量移除粉丝",
        namespace: "bilibili-fans-cleaner-v4",
        version: pkg.version,
        description: "批量移除 B 站粉丝，清理僵尸粉",
        author: "Modified based on CKylinMC",
        match: ["https://space.bilibili.com/*"],
        connect: ["api.bilibili.com"],
        grant: ["GM_setValue", "GM_getValue"],
        license: "GPL-3.0"
      },
      build: {
        fileName: "bilibili-fans-remover.user.js"
      }
    })
  ]
});
