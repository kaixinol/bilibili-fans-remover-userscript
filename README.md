# bilibili-fans-remover-userscript

使用 `pnpm` 管理的 TypeScript Userscript 项目，基于 `Vite + vite-plugin-monkey` 构建，界面模板拆分为独立 HTML/CSS，并使用 Alpine.js 管理交互状态。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
```

构建产物输出到 `dist/bilibili-fans-remover.user.js`。

## 说明

- `src/md5.ts` 只保留占位符，不包含真实 MD5 实现。
- 在替换为真实实现之前，依赖 WBI 签名的接口请求不会正常工作。
- `vite-plugin-monkey` 负责生成 userscript 元数据头和 `.user.js` 产物。
