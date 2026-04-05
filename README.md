# Bilibili Fans Remover Userscript

源代码：<https://github.com/kaixinol/bilibili-fans-remover-userscript>

参考脚本：[aryayaya/561448-bilibili-批量移除粉丝](https://greasyfork.org/zh-CN/scripts/561448-bilibili-%E6%89%B9%E9%87%8F%E7%A7%BB%E9%99%A4%E7%B2%89%E4%B8%9D)

一个用于清理 B 站粉丝的 Userscript 项目。

当前支持：

- 查看并滚动加载粉丝列表
- 批量移除已勾选粉丝
- 获取全部关注后，筛出并移除非互粉粉丝
- 在非本人空间显示面板，但禁用操作按钮并给出提示

## 使用前提

- 已安装油猴类扩展，例如 Tampermonkey
- 已登录 Bilibili
- 建议在“自己的个人空间”页面使用

## 部署

1. 安装依赖

```bash
pnpm install
```

2. 构建脚本

```bash
pnpm build
```

3. 安装产物

构建完成后，产物位于：

```text
dist/bilibili-fans-remover.user.js
```

将这个文件导入到 Tampermonkey 即可使用。

## 开发

安装依赖：

```bash
pnpm install
```

启动开发模式：

```bash
pnpm dev
```

常用检查命令：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 使用方式

1. 打开 Bilibili 个人空间页面
2. 点击右侧悬浮按钮“粉丝清理”
3. 根据需要使用：
   `刷新列表`、`全部加载`、`移除非互粉`、`全选列表`、`一键移除`

说明：

- `移除非互粉` 会先获取全部粉丝和全部关注，再筛选出非互粉对象
- 真正移除前会弹出确认框
- 粉丝很多时，界面使用滚动加载和可视区渲染，避免一次性挂载大量 DOM

## 注意事项

- 该脚本会调用 Bilibili 关系接口，请谨慎操作
- 大量拉取粉丝或关注时，可能触发 B 站风控验证 `-352`
- 只有当前登录用户自己的空间允许执行移除操作
- 控制台会输出 API 调用日志，以及将要被移除的非互粉用户对象列表

<details>
<summary>开发与实现细节</summary>

### 技术栈

- `TypeScript`
- `Vite`
- `vite-plugin-monkey`
- `Alpine.js`
- `pnpm`

### 目录结构

```text
src/
  app/                    启动与挂载
  features/fans-cleaner/  面板状态与 UI
  services/bilibili/      B 站接口与 WBI 相关逻辑
  services/crypto/        md5 等加密相关逻辑
  shared/                 通用类型、配置、工具
```

### 产物说明

- 构建命令：`pnpm build`
- 输出文件：`dist/bilibili-fans-remover.user.js`
- 构建阶段会最小化 JS 与 CSS 输出

### 质量检查

- `pnpm lint`：ESLint 检查
- `pnpm typecheck`：TypeScript 类型检查
- `pnpm build`：生产构建验证

</details>
