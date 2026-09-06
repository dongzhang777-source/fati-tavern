# 贡献指南 / Contributing

感谢关注肥猫酒馆（FATI Tavern）！中英文反馈都可以，以下约定以中文为主。

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 单元测试（vitest）
npm run lint     # oxlint
npm run build    # 生产构建（tsc + vite + PWA）
```

要求近期版本的 Node.js（≥20）。提交前请至少跑通 `npm test` 与 `npm run build`。

## 提交规范

- Commit 信息用简短中文，前缀 `feat:` / `fix:` / `refactor:` / `chore:` / `revert:`。
- 仓库启用了 `pre-commit` / `pre-push` 钩子（在 `.githooks/`，克隆后执行 `git config core.hooksPath .githooks` 启用）：前者校验提交身份，后者强制 build + test。
- 新 clone 后首次提交若被钩子拒绝，按提示重跑 `git commit` 即可。

## 架构纪律

- 模块单向依赖：`tavern.ts`（解析）→ `api.ts`（网络）→ `db.ts`（持久化）→ `store.ts`（状态）→ UI，不要反向引用。
- **新增运行时依赖前必须先开 issue 讨论**——极致轻量是本项目的核心卖点，打进浏览器包的运行时依赖目前仅 5 个（其中 WebGPU 引擎按需懒加载）。
- 不得移除或弱化：AI 身份披露常驻、自伤意念危机资源、隐私承诺（无后端、Key/聊天只存本地）。

## 提交 PR

1. Fork 后从 `main` 拉分支。
2. 改动配套单元测试（`src/lib/*.test.ts`）。
3. `npm test` + `npm run build` 通过。
4. PR 描述写清动机、改动点与验证方式。

不知道从哪入手？看 [`good first issue`](https://github.com/dongzhang777-source/fati-tavern/labels/good%20first%20issue) 标签，或先开 issue 讨论你的想法。

## 安全问题

不要用公开 issue 报告安全漏洞，走 [SECURITY.md](SECURITY.md) 中的私密渠道。
