# BeatNex

BeatNex 是面向街舞练习者的互动节奏训练工具。当前实现以已确认的交互原型为唯一界面基准，包含练习、节奏库、鼓机、节拍器和练舞日历五个页面。使用 React、TypeScript、Vite 和 Web Audio；手机优先并适配 iPad 视口。

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

自动检查：

```bash
corepack pnpm test
```

首次点击“开始练习”时，浏览器会解锁音频、加载四个本地 WAV，并直接开始节奏（默认无 Count-in）。Prototype 素材只用于本地开发，不能用于公开发行。

路线编辑、鼓点编排、组合与收藏保存、日历计时及跨午夜统计均接入真实逻辑。数据只保存在当前浏览器，尚无账号或云同步。未收录音乐分类显示空状态；原型模拟历史不会写入正式记录。

八种拍号、撤销/重做、目标鼓件、多阶段混音、暂停恢复、真实节拍器以及原型 SVG/动画均已接入。浏览器视口测试不能代替 iPhone/iPad 真机、蓝牙输出和听感验收，详见相邻文档仓库的 testing/prototype-acceptance.md。

## 模块边界

- `src/app/`：React 页面、布局和输入。
- `src/features/`：面向用户的用例协调。
- `src/core/`：Pattern、训练和音乐时间的纯 TypeScript 规则。
- `src/audio/`：平台无关音频契约与 Web 实现。
- `src/storage/`：版本化本地数据接口。
- `src/services/`：未来服务端接口边界。
- `assets/audio/boom-bap/prototype/`：只供本地 Prototype 使用的鼓组；WAV 不进入 Git。

完整产品与架构文档位于相邻的 `BeatNex-docs` 仓库。
