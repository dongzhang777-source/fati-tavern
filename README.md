<div align="center">

<img src="public/logo.svg" alt="FATI Tavern" width="200" />

# 肥猫酒馆 · FATI Tavern

**拖一张角色卡进来，和 TA 聊天。**
Drop a character card in and start chatting.

零安装 · 零注册 · 零后端 —— 你的 Key 和聊天记录永远不离开你的设备

[在线体验 →](https://fati-tavern.vercel.app)

</div>

---

## 这是什么

一个极轻量的浏览器端 AI 角色扮演聊天室（纯 PWA）：

1. **拖入**一张 SillyTavern 角色卡（PNG / JSON）
2. **填入**你自己的 API Key（或选免 Key 体验档）
3. **开聊**——多会话、流式输出、全部数据存在你的浏览器里

## 特性

- 🃏 **SillyTavern 卡片兼容**：v1/v2/v3 JSON、PNG（`chara`/`ccv3` 区块、gzip/zTXt 压缩）、世界书、`{{char}}`/`{{user}}` 宏
- 🔑 **BYOK**：DeepSeek / Kimi / OpenAI / LM Studio / Ollama / 任意 OpenAI 兼容端点，Key 只存 localStorage
- ⚡ **免 Key 体验档**：WebLLM 浏览器本地推理（WebGPU），无需任何 Key
- 🔒 **隐私优先**：无后端、无内容上传、无账号；仅统计匿名功能使用计数（访问/导入/发消息）
- 🌐 **中英双语**：界面语言自动检测、可手动切换
- 📱 **PWA**：手机电脑通用，可添加到主屏幕，离线可打开
- 💛 **安全底线**：AI 身份披露常驻；自伤意念本地识别并提供危机资源（12356 / 988）

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 单元测试（vitest）
npm run lint     # oxlint
npm run build    # 生产构建（tsc + vite + PWA）
```

技术栈：React 19 + TypeScript + Zustand + Vite + vite-plugin-pwa。运行时依赖仅 4 个，PNG 解析 / SSE 流式 / IndexedDB 全部手写。

模块边界：`tavern.ts`（解析）→ `api.ts`（网络）→ `db.ts`（持久化）→ `store.ts`（状态）→ UI，单向依赖。

## 内容与合规

- 角色卡为用户自行导入的第三方内容，本项目不托管、不分发任何卡片
- 导入时按来源声明与 tags 自动标记内容分级，18+ 内容仅限成年人使用
- 聊天界面常驻 AI 身份披露；检测到自伤意念时展示危机求助资源

## 许可

[MIT](LICENSE)

## 相关文档

- [用户使用说明](docs/USER-GUIDE.md)
- [技术架构](docs/ARCHITECTURE.md)
- [改进工作计划](docs/IMPROVEMENT-PLAN.md)
- [更新日志](CHANGELOG.md)
