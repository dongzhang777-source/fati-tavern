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
- 🔒 **隐私优先**：无后端、无内容上传、无账号；仅统计匿名功能使用计数（访问/导入/发消息/角色编辑/嘴替使用/二轮对话/分享创建/分享打开/截图分享）
- 🔗 **角色卡分享**：生成 gzip + base64url 链接；数据只放在 URL `#` fragment 中，不经过本应用服务器
- 📸 **对话截图分享**：端侧 Canvas 手绘对话长图，底部带品牌水印；系统分享或下载，全程不出设备
- 🌐 **四语言**：中/英/日/韩，界面语言自动检测、可手动切换
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

技术栈：React 19 + TypeScript + Zustand + Vite + vite-plugin-pwa。运行时依赖仅 5 个（WebGPU 引擎独立分包、按需懒加载），PNG 解析 / SSE 流式 / IndexedDB 全部手写。

模块边界：`tavern.ts`（解析）→ `api.ts`（网络）→ `db.ts`（持久化）→ `store.ts`（状态）→ UI，单向依赖。

## 内容与合规

- 角色卡为用户自行导入的第三方内容，本项目不托管、不分发任何卡片
- 导入时按来源声明与 tags 自动标记内容分级，18+ 内容仅限成年人使用
- 聊天界面常驻 AI 身份披露；检测到自伤意念时展示危机求助资源

## 生态关系声明（透明度）

肥猫酒馆是一个**独立、永久免费、完全开源**的产品。同时，它也是 FATI 生态的开源试玩前站——FATI 桌面端提供更深度的体验（本地大模型、音画沉浸、多人共创等）。我们公开这层关系：你在酒馆里的体验永远是完整的，不会被功能锁或付费墙打断；只有当你自己想要更多时，才会看到通往 FATI 的指引。

## 与同类产品的差异

| 对比 | 肥猫酒馆 |
|---|---|
| vs Character.ai | 你的对话不会被任何公司看到 |
| vs SillyTavern | 零安装，打开网页即聊 |
| vs Janitor AI | 完全免费，无订阅墙 |
| vs SpicyChat | 你的 API Key 只存本地，不经我们服务器 |

## 许可

[MIT](LICENSE)

## 相关文档

- [用户使用说明](docs/USER-GUIDE.md)
- [技术架构](docs/ARCHITECTURE.md)
- [P2P 群聊使用指南](docs/P2P_USAGE.md)
- [贡献指南](CONTRIBUTING.md)
- [更新日志](CHANGELOG.md)
