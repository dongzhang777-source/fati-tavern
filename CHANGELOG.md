# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-07-26

Sprint T2「对话质量与稳定性」（见 `docs/IMPROVEMENT-PLAN.md`）。

### Fixed
- 流式竞态：assistant 占位消息带 id，回调按 id 定位写入；流式中清空对话/删除会话自动中断请求，不再串写消息（Hy3 审查发现）
- `renameConversation` 改为先构造对象再分别写状态和库，不再依赖 set 同步性

### Added
- 上下文窗口管理：超预算时"保头保尾截中段"（移植主 FATI 策略简化版），长对话不再撞 token 上限
- system prompt 按卡片语言自动选择中/英模板（CJK 占比启发式），英文卡不再被套中文脚手架
- `mes_example`（对话示例）纳入 system prompt，提升角色扮演风格还原度
- 设置面板开放生成参数：温度、最大回复 tokens（默认 2048，长开场白不再截断）
- 「发送测试消息」按钮：真实走一次 `/chat/completions` 验证聊天链路（`/models` 通了≠聊天可用）
- 本地端点（LM Studio / Ollama）CORS 配置提示 + 用户指南 FAQ

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
