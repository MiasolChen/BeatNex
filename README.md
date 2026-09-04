# BeatNex

BeatNex 是面向街舞练习者的互动节奏训练工具。当前进入 Web Prototype 阶段，技术栈为 React、TypeScript、Vite 和 Web Audio API。

## 本地运行

```bash
corepack pnpm install
corepack pnpm dev
```

类型检查和生产构建：

```bash
corepack pnpm typecheck
corepack pnpm build
```

## 模块边界

- `src/app/`：React 页面、布局和输入。
- `src/features/`：面向用户的用例协调。
- `src/core/`：Pattern、训练和音乐时间的纯 TypeScript 规则。
- `src/audio/`：平台无关音频契约与 Web 实现。
- `src/storage/`：版本化本地数据接口。
- `src/services/`：未来服务端接口边界。
- `assets/audio/boom-bap/prototype/`：只供本地 Prototype 使用的鼓组；WAV 不进入 Git。

完整产品与架构文档位于相邻的 `BeatNex-docs` 仓库。
