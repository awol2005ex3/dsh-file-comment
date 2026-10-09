# dsh-file-comment

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在右侧边栏文件预览中选中文本，添加评论并发送到会话输入框。

## 功能

- 在文件预览（代码、文本、Markdown 等）中选中文本后，自动弹出浮动工具栏
- **评论并提问**：打开对话框，输入评论后与选中的代码一起格式化发送到聊天输入框
- **发送到聊天**：直接将选中内容发送到聊天输入框（不附加评论）
- 格式化输出包含：文件路径、行号范围、代码块、用户评论

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
npm run build
```

## 架构

```
dsh-file-comment/
├── package.json          # 包声明 + dsh 插件配置
├── cordis.patch.yml      # Cordis profile patch（注册插件到配置树）
├── tsconfig.json
├── scripts/
│   └── wrap-client.mjs   # 浏览器 bundle 闭包工厂包装脚本
└── src/
    ├── index.ts          # 宿主端入口（纯客户端插件，无宿主逻辑）
    └── client.ts         # 浏览器端入口（选区检测 + 浮动工具栏 + Composer 投递）
```

### 插件类型

纯客户端插件（client-only），无宿主端服务。所有逻辑在浏览器 bundle 中运行。

### 核心流程

1. `selectionchange` 事件监听 → 检测选区是否在文件预览区域内
2. 选区有效时显示浮动工具栏（评论 / 发送按钮）
3. 点击「评论并提问」→ 弹出对话框，用户输入评论
4. 格式化文本（文件路径 + 行号 + 代码块 + 评论）
5. 通过 `connection.rpc` → `conversation.input.paste()` 投递到聊天输入框

### 关键 DOM 锚点

| 选择器 | 用途 |
|--------|------|
| `[data-code-preview]` | CodeBody 渲染的代码预览容器 |
| `[data-sidebar-right-session]` | 右侧边栏 session 容器 |
| `[data-slot="sidebar.right.pane.tab"]` | 右侧边栏 tab 容器 |

## License

Apache License 2.0
