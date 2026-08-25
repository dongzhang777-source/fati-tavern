# AGENTS.md — 给在 fati-tavern 仓库里作业的 AI 编程 agent 的约定

本文件面向在 `fati-tavern` 仓库中作业的编程 agent。工作区级约定（多仓库路由、扫描范围等）见上级目录 `../AGENTS.md`。

## 仓库概况

- **fati-tavern（肥猫酒馆）**：浏览器端 AI 角色扮演聊天室，**纯 PWA、零后端**。React 19 + TypeScript + Zustand + Vite + vite-plugin-pwa。
- 线上地址：https://fati-tavern.vercel.app （Vercel 自动部署，推 `main` 即发布）。
- 模块边界（单向依赖，不要反向引用）：`src/lib/tavern.ts`（角色卡解析）→ `src/lib/api.ts`（网络/SSE）→ `src/lib/db.ts`（IndexedDB 持久化）→ `src/store.ts`（Zustand 状态）→ UI（`App.tsx`）。
- 运行时依赖刻意保持极少（当前 4 个左右）：PNG 解析、SSE 流式、IndexedDB 均为手写实现，**新增运行时依赖前必须先问用户**。
- 与 `fati` 桌面应用的关系：独立产品、独立仓库，共享部分设计（如 ModelPicker 借鉴）但**不共享代码**。

## 构建与测试

```bash
npm run dev      # 开发服务器
npm test         # vitest run（单元测试在 src/lib/*.test.ts）
npm run lint     # oxlint（配置 .oxlintrc.json）
npm run build    # tsc -b && vite build（含 PWA 产物）
```

- 产物目录 `dist/` 已被忽略，不进版本库。
- 改动后提交前至少跑 `npm run build` + `npm test` 验证。

## 提交身份（硬约束，pre-commit 强制）

> `.githooks/pre-commit`（`core.hooksPath=.githooks`，已版本化）强制提交邮箱为
> `292045917+dongzhang777-source@users.noreply.github.com`。
> 原因：Vercel team 只认 `dongzhang777-source` 这个 GitHub 身份，用其他邮箱提交会导致部署被拦（"not a member of the team"）。
> 钩子在邮箱不符时会自动修正配置并拒绝本次提交，重跑 `git commit` 即可。**不要绕过或删除此钩子。**

- 远程：`git@github.com:dongzhang777-source/fati-tavern.git`，默认在 `main` 上作业。
- Commit 信息用简短中文，前缀 `feat:` / `fix:` / `refactor:` / `chore:` / `revert:`（参考近期提交）。
- 克隆到新机器后确认 `git config core.hooksPath` 为 `.githooks`（通常已随仓库配置生效，`git config core.hooksPath .githooks` 可手动补）。

## 版本与发版

- 发版打 tag：`git tag -a vX.Y.Z -m "..."`，随 `git push origin main --tags` 推送。
- 查当前版本：`git describe --tags --abbrev=0`（tag 为准；`package.json` 的 `version` 字段历史上有滞后，如需对齐以最新 tag 为基准递进）。
- 推 `main` 即触发 Vercel 生产部署，**push 前必须本地 build + test 通过**，坏构建会直接上线。

## 移动端约束（踩坑记录，改模型/推理相关代码前必读）

- **WebLLM（WebGPU 本地推理）在移动端内存极其敏感**：
  - iOS 只开放 0.5B 模型（1.5B 推理时 KV-cache 增长导致白屏崩溃，见 commit `d01337b`）；
  - Android 按设备内存分档开放；桌面全开（分档策略见 commit `3166459`）。
  - 调整模型档位前先了解上述崩溃史，不要"顺手"放开大模型。
- 移动端已知修复过：dynamic import 失败、竖屏布局溢出、模型下载闪退（`e9b5da7`）。回归测试时优先覆盖这些场景。

## 内容与合规底线

- 角色卡为用户自行导入的第三方内容，本项目**不托管、不分发**任何卡片。
- AI 身份披露常驻聊天界面；自伤意念本地识别并提供危机资源（`src/lib/safety.ts`）——**不得移除或弱化**这两项。
- 隐私承诺：无后端、Key 只存 localStorage、聊天记录只存本地 IndexedDB。任何改动不得引入内容上传。

## 文档

- `docs/ARCHITECTURE.md` — 技术架构
- `docs/USER-GUIDE.md` — 用户使用说明
- `docs/IMPROVEMENT-PLAN.md` — 改进工作计划
- `docs/SHARE-LOOP-DESIGN.md` — 分享回路设计
- `CHANGELOG.md` — 更新日志

## 跨项目联系

请分析当前会话与我目前在做的项目之间有什么联系。如果识别到了联系，请分析并保存在适当的位置，使这些存档的信息或观点有助于统领并推进这些项目。

- 2026-08-24 分析结果见 `docs/PROJECT-STATUS-2026-08-24.md`：Tavern 定位为主 FATI/tuna 虚拟社交体系外的“最小可信入口”；远期只吸收冷启动内容与替身体验洞察，不引入后端、内容托管或画像系统。
