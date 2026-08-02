# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.11.0] - 2026-08-02

世界书导入 + 剧情模式——导入的世界书既能注入聊天，也能一键进入沉浸式互动剧情（打通主 FATI 未落地的最后一公里）。

### Added
- **独立世界书导入**：拖入世界书 JSON 自动识别（`detectImportKind` 分流），导入成功 toast 区分角色卡/世界书计数
- **世界书库管理**：画廊内世界书面板——全局激活（★）、删除（级联清剧情）、绑定到指定角色（内置角色自动转副本并迁移会话）
- **聊天世界书注入**：优先级「角色绑定书 > 卡自带 character_book > 全局激活书」，6000 字符注入预算按 insertion_order 截断；聊天头部 📖 按钮查看/切换当前生效书
- **剧情模式**：世界书一键浓缩成剧情世界（纯前端规则，不调模型）→ Director-lite 续写「场景 + 2-4 选项」→ IndexedDB 断点续玩；JSON 解析三级降级链（合法 JSON / 剥代码块围栏 / 整段当正文）
- **WebLLM 剧情降级档**：移动端及桌面 0.5B/1.5B/1.7B 小模型强制纯续写模式（无选项按钮，自由输入推进），避免小模型 JSON 输出不稳定
- 新增 `src/lib/story.ts`（Director-lite prompt + 解析）、`src/store/slices/lore.ts` / `story.ts`（独立 slice）、`src/components/LorebookPanel.tsx` / `StoryView.tsx`；IndexedDB 升 v2（lorebooks / stories store，旧数据无损）
- 单测 +19（bookToPremise 浓缩器、注入预算截断、剧情 prompt 与解析降级链），全套 116 通过

## [0.10.0] - P2P 群聊

### Added
- **P2P 群聊**：手机/浏览器通过邀请票据加入桌面 FATI 创建的 P2P 房间，实时群聊；有算力端的房间自动启用端到端加密（Ed25519 签名 + ECDH P-256 密钥交换 + AES-256-GCM）
- **借算力**：房间内借用桌面端本地算力进行流式 AI 推理，逐字返回结果；取消仅停止本机显示
- **Relay 设置**：设置面板新增 relay 地址输入，支持手动配置中继服务器地址并持久化到 localStorage

## [0.9.2] - 2026-07-28

### Changed
- 恢复嘴替抽屉底部「每次生成消耗一次模型调用，仅在你点击时发生」消费提示（v0.9.1 曾移除，未上线；用户决定保留）

## [0.9.1] - 2026-07-28

嘴替首轮反馈修正。

### Fixed
- 建议不断复述双方已说台词：三条生成路径（3 选项/单条/润色）prompt 均加入防重复硬约束（zh/en），要求推进对话而非复述

### Changed
- 单条建议降级收窄为**仅移动端 WebLLM**（省热预算）；桌面 WebLLM 硬件充足，与 BYOK 一样出 3 选项（JSON 解析失败时仍自动回退单条）
- 移除抽屉底部「每次生成消耗一次模型调用」提示文字

## [0.9.0] - 2026-07-28

嘴替（帮我接话）+ 用户 persona——从主 FATI 移植交互层（按本仓约定重写，不共享代码）。

### Added
- **用户 persona 设置**：我的名字（替换卡片 `{{user}}` 宏）+ 我在故事里扮演谁（注入聊天 system prompt，角色据此回应）；全局单个，localStorage 持久化
- **嘴替抽屉（💡 帮我接话）**：3 条候选回复（BYOK 档）/ 单条建议（WebLLM 免 Key 档降级，小模型 JSON 不可靠）、润色我的话（对输入框草稿扩写）、稳妥↔大胆拓展度拉杆
- 漏斗埋点 `impersonate_used`（首次点候选卡触发），用于对照使用者 vs 非使用者的 second_round 转化

### 设计红线
- 嘴替走独立「代笔」prompt（zh/en 双模板，跟随卡片语言），以用户扮演身份对角色说话，绝不复用角色 system prompt（防止替对面发言）
- 生成结果只填输入框、不入聊天记录；仅用户点击触发，无任何自动/预生成路径，面板明示调用成本
- 不移植主 FATI 的画像学习/记忆提炼/多人格（保留为桌面版深度能力）

## [0.6.1] - 2026-07-27

### Changed
- 漏斗自定义事件从 Vercel Analytics 切换到 PostHog 免费档（Hobby 档不支持自定义事件）：纯 fetch 直连 capture API、零 SDK 依赖，key 走 `VITE_POSTHOG_KEY` 环境变量，未配置时静默降级；Vercel Analytics 保留收 pageview
- 新增 `.env.example`；`.gitignore` 覆盖 `.env*`

### Fixed
- 修复 Vercel 部署阻断：本仓 git 提交邮箱改为 GitHub 账号官方 noreply 邮箱

## [0.6.0] - 2026-07-27

品牌视觉正式版 + 开源就绪 + UGC 分级。

### Added
- **正式 logo 上线**：橘色肥猫 + FATI TAVERN 字标（用户提供），favicon / 页头 / PWA 方形图标（深色底）全套更新
- **内容分级标记**：导入时按来源声明与 tags（nsfw/r18/成人 等）推断 `contentRating`，画廊卡片显示 18+ 徽标；页脚新增 UGC 免责声明（不托管、不分发、成人内容限成年人）
- **README 重写**：产品定位、特性清单、开发指南、合规立场（替换 Vite 模板原文）；新增 MIT LICENSE——转公开仓的前置件就绪
- **分享回路设计稿**（`docs/SHARE-LOOP-DESIGN.md`）：卡片链接分享（URL fragment，零服务器）/ 对话导出图 / 卡廊三回路，含优先级与埋点设计
- contentRating 推断单测 3 条

## [0.5.0] - 2026-07-27

Sprint T3 核心两项：漏斗埋点 + 免 Key 体验档。

### Added
- **漏斗埋点**（Vercel Analytics）：仅 4 个匿名事件——访问 / 导入成功 / 首条消息 / 第二轮对话，localStorage 每设备去重；隐私文案同步更新为"仅统计匿名功能使用计数，不含任何内容"
- **免 Key 体验档（WebLLM）**：设置面板新增「免 Key 体验」预设，Qwen2.5-1.5B 在浏览器本地推理（WebGPU），无需任何 API Key；引擎懒加载 + 模型下载进度展示 + WebGPU 不支持时明确提示
- 构建策略：web-llm 独立分包并排除出 SW 预缓存，普通访客零额外流量，主包保持 235KB

## [0.4.0] - 2026-07-26

品牌、多语言与合规底线（融合 Claude 商业可行性审查 P0 项）。

### Added
- **品牌定名**：中文「肥猫酒馆」，其他语言 FATI Tavern；原创胖猫抱酒杯 SVG logo 取代 🍺，补齐 favicon / apple-touch-icon / PWA 192·512 图标（此前为坏链）
- **多语言支持（zh/en）**：零依赖 i18n 字典，覆盖全部 UI 文案与导入错误提示；按浏览器语言自动检测，设置面板可手动切换并持久化
- **AI 身份披露**：聊天头部常驻「AI 角色扮演 · 非真人」标识（加州 SB 243 等州法底线要求）
- **自伤/自杀意念危机兜底**：本地中英关键词识别，命中弹出危机资源提示（中国 12356 / 美国 988 / 英国 Samaritans），非阻断、可关闭、不上传任何内容
- safety 单测 3 条（含误报防护）

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
