# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-07-26

Sprint T1「导入兼容率战役」（见 `docs/IMPROVEMENT-PLAN.md`）。

### Added
- PNG 角色卡支持 gzip 压缩数据（SillyTavern v3 默认导出格式），基于浏览器原生 `DecompressionStream`，零新增依赖
- PNG 角色卡支持 v3 规范 `ccv3` 区块（优先）与 `zTXt` 压缩区块，回退兼容 `chara`
- `{{char}}` / `{{user}}` / `<BOT>` / `<USER>` 宏替换，覆盖 system prompt、开场白与世界书注入
- 导入结果 toast：成功显示数量，失败逐条给出具体原因（此前静默失败）
- vitest 测试基建 + 解析层 20 条回归用例（`npm test`）

### Changed
- `parsePngCard` 改为 async，解析失败抛出带原因的错误而非返回 null

## [0.1.0] - 2026-07-25

Phase 0–2 MVP：角色库画廊 + 角色卡导入（PNG tEXt / JSON v1/v2）+ 多会话 + BYOK 流式聊天 + IndexedDB 持久化 + PWA。
