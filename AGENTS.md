# AGENTS.md — dsh-file-comment 开发指南与规范

> 面向后续开发者与 AI Agent：动手前先通读本文件；**任何接口性变更（选择器 / 流程 / RPC 端点 / 命令）必须同步更新 README.md 与本文件**。

## 1. 项目定位

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）独立插件：在右侧边栏文件预览中选中文本 → 弹出浮动工具栏 → 评论 / 直接发送到会话输入框。

- **纯客户端插件（client-only）**：宿主端 `src/index.ts` 仅导出 `name` / `inject` / 空 `apply`；全部功能在浏览器 bundle `src/client.ts`。
- **交付形态**：npm 包 + dsh bundle。`package.json` 的 `dsh.bundle` / `dsh.client` 字段声明，`cordis.patch.yml` 把插件注册进 Cordis profile 配置树。
- dsh / cordis API 规范以本地技能文档 `.agents/skills/dsh-plugin-dev/SKILL.md`（本地副本，不入库）为准，**禁止臆造 API**。

## 2. 文件地图

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 宿主端入口，空 apply（client-only 约定），仅供 loader import 注册插件标识 |
| `src/client.ts` | 浏览器端全部逻辑：选区检测、浮动工具栏、评论对话框、Composer 投递、调试日志 |
| `scripts/wrap-client.mjs` | 给 `lib/client.js` 套上 `__ModuleLoader__` 闭包工厂外壳，并剥掉 tsc 追加的 `export {}` |
| `cordis.patch.yml` | profile patch：把插件注册进配置树 |
| `package.json` | 包声明 + dsh 插件配置；`files` 决定发包内容 |
| `tsconfig.json` | `strict` + `noUncheckedIndexedAccess`（见踩坑 2） |
| `vitest.config.ts` | vitest **预留**配置：vitest 未安装、无 `test/` 目录（见 §7） |
| `lib/` | 构建产物（gitignore），**禁止手改**，只从 `src/` 生成 |
| `README.md` | 用户向文档：功能 / 安装 / 构建 / 架构 / 调试 |
| `AGENTS.md` | 本文件：开发规范、踩坑、调试入口 |

## 3. 标准命令与验证流程

```bash
npm install
npm run typecheck    # tsc --noEmit（strict 全量检查）
npm run build        # tsc → lib/ + wrap-client.mjs 包装浏览器 bundle
```

- **Windows PowerShell**：若 `npm` 报「npm.ps1 未进行数字签名」，改用 `npm.cmd run build`（执行策略拦截 PS1 脚本）。
- **每次改动后的验证顺序**：
  1. `npm run typecheck`
  2. `npm run build`（必须执行：浏览器 bundle 由 wrap 重新包装，只 typecheck 不产物流）
  3. 重新安装 bundle + DSH **整页刷新**（F5，原因见踩坑 3）
  4. 按 §5 调试表在 DevTools Console 验证

## 4. 关键约束与踩坑（改动前必读）

1. **`src/client.ts` 禁止 import/export 语句**（末尾 `module.exports = ...` 除外）。构建契约：tsc 只产出纯模块体，`wrap-client.mjs` 再包成 `window.__ModuleLoader__.load({ id, factory })` 闭包工厂（与 deepseek-harness `tsdown.client.ts` 的 banner/intro/footer 逐字一致）。tsc 在 NodeNext 下会给无模块语法的文件追加 `export {}`（会让经典脚本解析报错），wrap 已剥除——不要手写模块语法，不要在 client.ts 引入外部依赖或 d.ts 导入。
2. **`tsconfig.json` 开启 `noUncheckedIndexedAccess`**：一切 `arr[i]` 类型为 `T | undefined`。已按 `.length` 保护的循环内取值用 `arr[i]!` 断言（文件既有风格）；其余场景显式判空。
3. **BUILD_GUARD 单例守卫**（`window.__dshFileCommentMounted`）：`apply()` 幂等，同页只挂载一次。**更新插件代码后必须整页刷新**——仅热更新 / HMR 时守卫仍为 true，`apply()` 提前 return，跑的还是旧代码（典型症状：「改了没生效」）。
4. **选区判定必须逐级走 `parentNode`**（`closestAcrossShadow`，`src/client.ts`）：文本选区的 `anchorNode` 通常是 Text 节点而非 Element；Shadow DOM 内不能从 ShadowRoot 直接跳 host，否则会跳过 shadow 树内部的容器选择器。历史 bug（`inPreviewArea` 恒返回 false → 选中无效果）由此而来，**禁止把该遍历"简化"回单跳逻辑**。
5. **DOM 锚点失效的排查路径**：Console 看 `sel.inPreview`；为 false 时以 `anchor path:` 日志（选区向上 20 层真实 DOM 链，`⤴` 为 Shadow 边界）为准，更新 `PREVIEW_SELECTORS`（`src/client.ts` 顶部）并**同步 README「关键 DOM 锚点」表**。若完全没有 `sel:` 日志：先查 `plugin loaded` 是否存在（未加载），再考虑内容是否在 iframe（当前不支持，仅监听主文档 `selectionchange`）。
6. **Composer 投递链**（`sendToComposer`，每层独立 try/catch、失败自动降级到下一层，Debug 日志 `sent via ...` 标明实际命中层）：
   ① 官方通道：`ctx.get('slots')`（**不能写 `ctx.slots`**——cordis 4 严格访问未声明 `inject` 的服务属性会抛错；历史上 `ctx.connection` 就这样被吞掉，导致连接从未缓存、只落到剪贴板）→ 被动注册 `conversation.input.activity` slot（kind single / scope session）捕获 `props.inputActions`，render 返回 null；`captureInsertion()` + `insertText(text, span)`（revision-guarded、undo 一体、`\n` 自动分段，见 harness `ui-conversation/src/client/input/facade.ts`；动态 bundle 范例见 harness `apps/web/tests/fixtures/plugins/fixture-input-extension`）。
   ② DOM 兜底：对主输入框 contenteditable（`findComposerElement`：可见、排除侧栏、取屏幕最下方）派发合成 `ClipboardEvent('paste')`，`execCommand('insertText')` 再兜底。
   ③ `connection.rpc.call('/api', 'conversation/input-paste', ...)`（历史保留，**端点未经证实**——harness 源码检索不到）。
   ④ `window.__dshContext` 兜底 → ⑤ `navigator.clipboard` 最后兜底。
7. **发包内容**以 `package.json` `files` 为准（`lib`、`cordis.patch.yml`、`README.md`）；AGENTS.md 仅开发用、不发包。

## 5. 调试入口（DevTools Console）

| 日志 / 全局量 | 含义与异常判读 |
|------|------|
| `[dsh-file-comment] plugin loaded` | init 成功。缺失 → bundle 未加载（安装问题），或 init 抛错（查 `window.__dshFileCommentError`） |
| `sel: { collapsed, textLen, anchorTag, inPreview }` | 每次 `selectionchange` 打印。无输出 → 事件未触发（未加载 / iframe）；`inPreview: false` → 见踩坑 5 |
| `anchor path: ...` | 选区祖先链（含 Shadow 边界），用于更新 `PREVIEW_SELECTORS` |
| `sent via ...` / `... failed:` | 发送命中的投递层或失败原因（发送问题先看这里） |
| `window.__dshFileCommentMounted` | 单例守卫，true 表示已挂载（刷新页面会复位） |

## 6. 开发约定

- **代码与文档同步**：选择器、流程、RPC 端点、命令等变更 → 同步 README.md 与本文件。
- **注释用中文**（或保留既有英文段落风格），解释"为什么"（契约、坑），不复述代码字面意思。
- `client.ts` 保持自包含：类型用本地 `interface`，不引入外部 d.ts / 第三方库。
- 纯函数优先：DOM 读写集中在少数函数（`inPreviewArea` / `updateSelection` / `showToolbar` 等），便于推理与后续测试。
- 不臆造 dsh / cordis API；不确定时查 dsh-plugin-dev skill 或上游源码。

## 7. 已知遗留与扩展入口

| 事项 | 现状 / 入口 |
|------|------|
| 单元测试 | vitest 未安装、无 `test/` 目录。需要时 `npm i -D vitest`，用例放 `test/**/*.test.ts`（`vitest.config.ts` 已配好 include 与 host 绑定） |
| 行号检测 | `detectLines` 依赖 `data-line` / class 行号模式；识别不到时仅缺行号，不影响发送 |
| iframe 内容 | 不支持（仅监听主文档 `selectionchange`）；若日志完全无 `sel:` 输出且插件已加载，按此方向排查 |
| 发送失败 | 静默回退剪贴板，可扩展可见的错误提示 / 重试 |
