# dsh-file-comment

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在右侧边栏文件预览中选中文本，添加评论并发送到会话输入框。

> 面向后续开发的规范、踩坑与调试入口见 [AGENTS.md](./AGENTS.md)。

## 功能

- 在文件预览（代码、文本、Markdown 等）中选中文本后，自动弹出浮动工具栏
- **评论并提问**：打开对话框，输入评论后与选中的代码一起格式化发送到聊天输入框
- **发送到聊天**：直接将选中内容发送到聊天输入框（不附加评论）
- 格式化输出包含：文件路径、行:列范围、代码块、用户评论

## 安装

在 DSH 中通过 bundle 安装：

```
dsh bundle install dsh-file-comment
```

或本地路径安装：

```
dsh bundle install /path/to/dsh-file-comment
```

## 构建

```bash
npm install
npm run typecheck   # tsc --noEmit（strict）
npm run build       # tsc 编译到 lib/ + wrap-client.mjs 包装浏览器 bundle
```

> Windows PowerShell 提示 `npm.ps1 未进行数字签名` 时，改用 `npm.cmd run build`。

## 架构

```
dsh-file-comment/
├── package.json          # 包声明 + dsh.bundle / dsh.client 配置
├── cordis.patch.yml      # Cordis profile patch（注册插件到配置树）
├── tsconfig.json         # strict + noUncheckedIndexedAccess
├── AGENTS.md             # 开发规范、踩坑与调试入口（面向后续开发）
├── vitest.config.ts      # vitest 预留配置（尚未安装，见 AGENTS.md）
├── scripts/
│   └── wrap-client.mjs   # 浏览器 bundle 闭包工厂包装脚本
├── lib/                  # 构建产物（gitignore，勿手改）
└── src/
    ├── index.ts          # 宿主端入口（纯客户端插件，无宿主逻辑）
    └── client.ts         # 浏览器端入口（选区检测 + 浮动工具栏 + Composer 投递）
```

### 插件类型

纯客户端插件（client-only），无宿主端服务。所有逻辑在浏览器 bundle 中运行。

### 核心流程

1. `selectionchange` 事件监听 → `closestAcrossShadow` 逐级向上（含 Shadow DOM 边界）检测选区是否在文件预览区域内
2. 选区有效时显示浮动工具栏（评论 / 发送按钮）
3. 点击「评论并提问」→ 弹出对话框，用户输入评论
4. 格式化文本（文件路径 + 行号 + 代码块 + 评论）
5. 投递到聊天输入框（分层回退，每层独立容错）：官方 `conversation.input` slot 捕获的 `inputActions.insertText` → 主输入框 contenteditable 合成 paste 事件 → RPC → `__dshContext` → 剪贴板

### 关键 DOM 锚点

| 选择器 | 用途 |
|--------|------|
| `[data-code-preview]` | CodeBody 渲染的代码预览容器 |
| `[data-textpreview-url]` | 文档预览根节点，属性值 = 完整资源地址（`dsh-resource://file/session/<id>/<path>`） |
| `[data-textpreview-path]` | 预览头部路径标签，`title` 属性 = 完整文件路径 |
| `div[data-sidebar-right-tab]` / `span[data-sidebar-right-tab]` | 右侧栏 tab 主体 / 标题 chip（同 id，标题为文件 basename） |
| `pre code > .line` | 代码行（每源码行一个 span；**行号是 CSS counter，不在 DOM 里**，行号 = 序数） |
| `[data-sidebar-right-session]` | 右侧边栏 session 容器 |
| `[data-slot="sidebar.right.pane.tab"]` | 右侧边栏 tab 容器 |

以上选择器定义于 `src/client.ts` 顶部的 `PREVIEW_SELECTORS`。DSH 升级后若选区检测失效，按下方「调试」用 `anchor path` 日志核对真实 DOM，并同步更新该常量与本表。

## 调试

打开 DevTools Console 选中文本，按日志判读（完整判读表见 [AGENTS.md](./AGENTS.md)）：

| 日志 | 判读 |
|------|------|
| `[dsh-file-comment] plugin loaded` | 缺失 → 插件未加载（安装 / bundle 问题） |
| `sel: { ..., inPreview }` | 无输出 → 事件未触发；`inPreview: false` → 选择器不匹配 |
| `anchor path: ...` | 选区真实 DOM 祖先链（`⤴` 为 Shadow 边界），据此更新 `PREVIEW_SELECTORS` |

> 更新插件后必须**整页刷新**（F5）：插件带单例守卫（`__dshFileCommentMounted`），仅热更新不会加载新代码。

## License

Apache License 2.0
