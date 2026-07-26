# FATI Tavern 技术架构说明

## 定位

纯前端 PWA，零后端。用户自带 API Key（BYOK），直连 OpenAI 兼容端点。

## 技术栈

| 层级 | 选型 | 理由 |
|------|------|------|
| 构建 | Vite 8 + TypeScript | 极速 HMR，类型安全 |
| UI | React 19 | 生态成熟，组件化 |
| 状态 | Zustand | 轻量（<1KB），无 boilerplate |
| 持久化 | IndexedDB（原生 API） | 无第三方依赖，结构化存储 |
| PWA | vite-plugin-pwa (Workbox) | 离线缓存，可安装 |
| 部署 | Vercel | main 分支自动发布，全球 CDN |

## 项目结构

```
fati-tavern/
├── src/
│   ├── lib/
│   │   ├── tavern.ts      # 角色卡解析（SillyTavern v1/v2/v3 PNG）
│   │   ├── api.ts         # BYOK 流式客户端 + 端点预设
│   │   └── db.ts          # IndexedDB 持久化层
│   ├── store.ts           # Zustand 全局状态
│   ├── App.tsx            # UI 组件（Gallery / ChatView / Settings）
│   ├── App.css            # 暗色主题样式
│   └── main.tsx           # 入口
├── vite.config.ts         # Vite + PWA 配置
├── index.html             # HTML 模板
└── docs/                  # 文档
```

## 核心模块

### 1. 角色卡解析（`lib/tavern.ts`）

从 FATI 主项目原样搬运（192 行），零修改。纯函数，无 DOM 依赖。

- `parseCharacterJson(raw)` — JSON v1/v2 角色卡
- `parsePngCard(arrayBuffer)` — PNG tEXt chunk 提取（base64 → JSON）
- `parseLorebookJson(raw)` — 世界书
- `cardToSystemPrompt(card)` — 角色卡 → system prompt
- `bookToContext(book)` — 世界书 → context 注入

### 2. API 客户端（`lib/api.ts`）

精简版 OpenAI 流式客户端，无 daemon / 无 LAN token / 无 thinking 抑制。

- `streamChat(endpoint, messages, signal, onChunk)` — SSE 流式读取
- `fetchModels(endpoint)` — GET /models 拉取可用模型列表
- `PRESETS` — 内置端点预设（DeepSeek / Kimi / OpenAI / LM Studio / Ollama）

### 3. 持久化层（`lib/db.ts`）

原生 IndexedDB，无第三方库。

- 两个 Object Store：`characters`（角色卡）、`conversations`（会话）
- conversations 按 `characterId` 建索引
- `extractAvatar(file)` — Canvas 裁切 PNG → 128px WebP data URL

### 4. 状态管理（`store.ts`）

Zustand 单 store，管理：

- 视图切换（gallery / chat）
- 角色库 CRUD + IndexedDB 同步
- 多会话管理（新建/切换/删除/重命名）
- 流式聊天（AbortController 取消）
- 端点配置（localStorage 持久化）

## 数据流

```
用户拖入 PNG/JSON
    ↓
tavern.ts 解析 → TavernCard
    ↓
db.ts 写入 IndexedDB（+ Canvas 提取头像）
    ↓
store.characters 更新 → Gallery 渲染

用户发送消息
    ↓
store.sendMessage()
    ↓
cardToSystemPrompt() 构建 system
    ↓
api.ts streamChat() → SSE 流式
    ↓
onChunk 回调 → store 更新 → UI 逐字渲染
    ↓
完成 → db.ts 持久化会话
```

## 部署架构

```
用户浏览器 ←→ Vercel CDN（静态文件）
     ↓
     直连用户配置的 API 端点（DeepSeek/OpenAI/本地）
```

- 无自有后端，无服务器成本
- Vercel 仅托管静态文件（HTML/JS/CSS），不经过任何用户数据
- 聊天请求从浏览器直接发往用户配置的第三方 API

## 构建与部署

```bash
# 本地开发
npm run dev

# 类型检查
npx tsc --noEmit

# 生产构建
npm run build    # tsc -b && vite build

# 部署（Vercel 自动，或手动）
npx vercel --prod
```

## 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 存储 | IndexedDB 而非 localStorage | 角色卡+会话数据量大，localStorage 5MB 不够 |
| 状态 | Zustand 而非 Redux | 项目小，不需要 middleware/DevTools 全套 |
| 样式 | 纯 CSS 而非 Tailwind | <100 行 CSS 够用，不引入构建依赖 |
| 头像 | Canvas 裁切 data URL | 避免额外请求，IndexedDB 直接存 |
| API | 原生 fetch + ReadableStream | 无 axios 依赖，SSE 天然支持 |
| PWA | Workbox generateSW | 零配置离线缓存 |

## 来源与复用

- `tavern.ts`：从 FATI 主项目（`/fati/src/tavern.ts`）原样搬运
- 流式 SSE 解析逻辑：参考 FATI 的 `utils/api-client.ts`，精简掉 daemon/thinking/LAN 相关
- 角色卡 → system prompt 拼接：复用 FATI 的 `cardToSystemPrompt` + `bookToContext`
