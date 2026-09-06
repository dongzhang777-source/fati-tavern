# AGENTS.md — fati-tavern 贡献与 agent 作业约定

本文件面向在 `fati-tavern` 仓库中作业的编程 agent 与人类贡献者。

## 仓库概况

- **fati-tavern（肥猫酒馆）**：浏览器端 AI 角色扮演聊天室，**纯 PWA、零后端**。React 19 + TypeScript + Zustand + Vite + vite-plugin-pwa。
- 线上地址：https://fati-tavern.vercel.app （推 `main` 即自动发布）。
- 模块边界（单向依赖，不要反向引用）：`src/lib/tavern.ts`（角色卡解析）→ `src/lib/api.ts`（网络/SSE）→ `src/lib/db.ts`（IndexedDB 持久化）→ `src/store.ts`（Zustand 状态）→ UI（`App.tsx`）。
- 运行时依赖刻意保持极少（当前 4 个）：PNG 解析、SSE 流式、IndexedDB 均为手写实现，**新增运行时依赖前必须先开 issue 讨论**。
- 与 `fati` 桌面应用的关系：独立产品、独立仓库，共享部分设计（如 ModelPicker 借鉴）但**不共享代码**；关系声明见 README「生态关系」一节。

## 构建与测试

```bash
npm install
npm run dev      # 开发服务器
npm test         # vitest run（单元测试在 src/lib/*.test.ts）
npm run lint     # oxlint（配置 .oxlintrc.json）
npm run build    # tsc -b && vite build（含 PWA 产物）
```

- 产物目录 `dist/` 已被忽略，不进版本库。
- 改动后提交前至少跑 `npm run build` + `npm test` 验证；`pre-push` 钩子会强制执行一遍。

## 提交身份（pre-commit 强制）

> `.githooks/pre-commit`（`core.hooksPath=.githooks`，已版本化）强制提交邮箱为
> `292045917+dongzhang777-source@users.noreply.github.com`，以保持与部署身份一致。
> 钩子在邮箱不符时会自动修正配置并拒绝本次提交，重跑 `git commit` 即可。**不要绕过或删除此钩子。**

- Commit 信息用简短中文，前缀 `feat:` / `fix:` / `refactor:` / `chore:` / `revert:`（参考近期提交）。
- 克隆到新机器后确认 `git config core.hooksPath` 为 `.githooks`（缺失时 `git config core.hooksPath .githooks` 补上）。

## 版本与发版

- 发版打 tag：`git tag -a vX.Y.Z -m "..."`，随 `git push origin main --tags` 推送。
- **`package.json` 的 `version`、`CHANGELOG.md`、tag 三处必须同步对齐**（0.14.x 时代曾出现漂移，0.16.0 起为硬约定）。
- 推 `main` 即触发生产部署，**push 前必须本地 build + test 通过**，坏构建会直接上线。

## 移动端约束（踩坑记录，改模型/推理相关代码前必读）

- **WebLLM（WebGPU 本地推理）在移动端内存极其敏感**：
  - iOS 只开放 0.5B 模型（1.5B 推理时 KV-cache 增长导致白屏崩溃）；
  - Android 按设备内存分档开放；桌面全开。
  - 调整模型档位前先了解上述崩溃史，不要"顺手"放开大模型。
- 移动端已知修复过：dynamic import 失败、竖屏布局溢出、模型下载闪退、iOS 聚焦 <16px 输入框自动缩放、键盘收起后视口卡死（`interactive-widget` 相关，iOS 与安卓策略不同，见 `index.html`）。回归测试时优先覆盖这些场景。

## 内容与合规底线

- 角色卡为用户自行导入的第三方内容，本项目**不托管、不分发**任何卡片。
- AI 身份披露常驻聊天界面；自伤意念本地识别并提供危机资源（`src/lib/safety.ts`）——**不得移除或弱化**这两项。
- 隐私承诺：无后端、Key 只存 localStorage、聊天记录只存本地 IndexedDB。任何改动不得引入内容上传。

## 文档

- `docs/ARCHITECTURE.md` — 技术架构
- `docs/USER-GUIDE.md` — 用户使用说明
- `docs/P2P_USAGE.md` — P2P 群聊使用指南
- `docs/SHARE-LOOP-DESIGN.md` — 分享回路设计
- `CHANGELOG.md` — 更新日志
- `CONTRIBUTING.md` — 贡献指南
