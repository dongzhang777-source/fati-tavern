/**
 * 轻量 i18n——零依赖，两语言字典。
 * 品牌名规则：中文=「肥猫酒馆」，其他语言=「FATI Tavern」。
 */
export type Lang = 'zh' | 'en'

const LS_LANG_KEY = 'tavern-lang'

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_LANG_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function saveLang(lang: Lang) {
  localStorage.setItem(LS_LANG_KEY, lang)
}

export function brandName(lang: Lang): string {
  return lang === 'zh' ? '肥猫酒馆' : 'FATI Tavern'
}

export function docTitle(lang: Lang): string {
  return lang === 'zh' ? '肥猫酒馆 · FATI Tavern' : 'FATI Tavern'
}

const dict: Record<string, { zh: string; en: string }> = {
  // ── 画廊 / 落地页 ──
  'gallery.dropOverlay': { zh: '松开导入角色卡（PNG / JSON）', en: 'Drop to import character cards (PNG / JSON)' },
  'gallery.import': { zh: '+ 导入角色卡', en: '+ Import card' },
  'gallery.noDesc': { zh: '暂无描述', en: 'No description' },
  'gallery.delete': { zh: '删除', en: 'Delete' },
  'gallery.footer': { zh: 'BYOK · 你的 Key 和聊天记录不离开你的设备', en: 'BYOK · Your key and chats never leave your device' },
  'gallery.ugcNote': {
    zh: '角色卡为用户自行导入的第三方内容，本站不托管、不分发；标记为 18+ 的内容仅限成年人使用。',
    en: 'Character cards are third-party content imported by users — this site hosts and distributes nothing; 18+ content is for adults only.',
  },
  'landing.title': { zh: '拖一张角色卡进来，和 TA 聊天', en: 'Drop a character card in and start chatting' },
  'landing.sub': { zh: '支持 SillyTavern 角色卡（PNG / JSON），3 分钟开始你的第一次对话', en: 'Supports SillyTavern cards (PNG / JSON) — first conversation in 3 minutes' },
  'landing.step1': { zh: '拖入角色卡', en: 'Drop a card' },
  'landing.step2': { zh: '填入你的 API Key', en: 'Add your API key' },
  'landing.step3': { zh: '开始聊天', en: 'Start chatting' },
  'landing.cta': { zh: '导入第一张角色卡', en: 'Import your first card' },
  'landing.ctaHint': { zh: '或者直接把文件拖到页面任意位置', en: 'or just drag a file anywhere on this page' },
  'landing.privacyTitle': { zh: '🔒 隐私承诺', en: '🔒 Privacy promise' },
  'landing.privacyBody': {
    zh: '你的 API Key、角色卡、聊天记录全部只存在你的浏览器中。没有后端服务器，没有内容上传，没有账号注册。关闭页面后一切仍在本地。我们仅统计匿名的功能使用计数（访问 / 导入 / 发消息），不含任何聊天内容、角色卡或 Key。',
    en: 'Your API key, character cards and chats live only in your browser. No backend, no content uploads, no sign-up. Everything stays local after you close the page. We only collect anonymous feature-usage counts (visit / import / message) — never any chat content, cards or keys.',
  },
  'landing.feat1': { zh: '纯前端 PWA<br/>零安装零注册', en: 'Pure frontend PWA<br/>No install, no sign-up' },
  'landing.feat2': { zh: 'BYOK 自带 Key<br/>DeepSeek / Kimi / OpenAI / 本地', en: 'BYOK — bring your key<br/>DeepSeek / Kimi / OpenAI / local' },
  'landing.feat3': { zh: '手机电脑通用<br/>可添加到主屏幕', en: 'Works on phone & desktop<br/>Add to home screen' },
  'landing.feat4': { zh: '数据存本地<br/>刷新不丢失', en: 'Data stored locally<br/>Survives refresh' },
  // ── 零摩擦落地页 ──
  'landing.title2': { zh: '选一个角色，立即开聊', en: 'Pick a character and start chatting' },
  'landing.subtitle2': { zh: '20 个精选角色 · 浏览器本地推理 · 零配置', en: '20 curated characters · Local AI · Zero setup' },
  'landing.browseCatalog': { zh: '或导入你自己的角色卡', en: 'Or import your own character card' },
  'catalog.builtin': { zh: '内置', en: 'Built-in' },
  'catalog.free': { zh: '免费', en: 'Free' },
  'toast.imported': { zh: '✓ 已导入 {n} 张角色卡', en: '✓ Imported {n} card(s)' },

  // ── 聊天 ──
  'chat.back': { zh: '← 角色库', en: '← Library' },
  'chat.convList': { zh: '对话列表', en: 'Conversations' },
  'chat.clear': { zh: '清空', en: 'Clear' },
  'chat.convHeader': { zh: '对话', en: 'Chats' },
  'chat.newConv': { zh: '+ 新对话', en: '+ New chat' },
  'chat.newConvTitle': { zh: '新对话', en: 'New chat' },
  'chat.placeholder': { zh: '对 {name} 说点什么…', en: 'Say something to {name}…' },
  'chat.stop': { zh: '■ 停止', en: '■ Stop' },
  'chat.send': { zh: '发送', en: 'Send' },
  'chat.aiDisclosure': { zh: 'AI 角色扮演 · 非真人', en: 'AI roleplay · not a real person' },
  'chat.crisis': {
    zh: '如果你正处在难以承受的情绪中，请记得你并不孤单。可拨打全国心理援助热线 12356（24 小时），或北京心理危机研究与干预中心 010-82951332。',
    en: 'If you are going through a difficult time, you are not alone. US: call or text 988 (Suicide & Crisis Lifeline). UK & ROI: Samaritans 116 123.',
  },
  'chat.crisisDismiss': { zh: '我知道了', en: 'Got it' },
  'error.noEndpoint': { zh: '请先在设置中配置 API 端点', en: 'Please configure an API endpoint in settings first' },
  'error.request': { zh: '请求失败', en: 'Request failed' },

  // ── 设置 ──
  'settings.title': { zh: 'API 端点', en: 'API Endpoint' },
  'settings.lang': { zh: '语言 / Language', en: 'Language / 语言' },
  'settings.baseUrl': { zh: 'Base URL', en: 'Base URL' },
  'settings.apiKey': { zh: 'API Key（只存本地，不离开你的设备）', en: 'API Key (stored locally, never leaves your device)' },
  'settings.model': { zh: '模型', en: 'Model' },
  'settings.temp': { zh: '温度（0–2）', en: 'Temperature (0–2)' },
  'settings.maxTokens': { zh: '最大回复 tokens', en: 'Max response tokens' },
  'settings.test': { zh: '测试连接 & 拉取模型', en: 'Test connection & fetch models' },
  'settings.testing': { zh: '测试中…', en: 'Testing…' },
  'settings.testOk': { zh: '连接成功，发现 {n} 个模型', en: 'Connected — found {n} models' },
  'settings.testFail': { zh: '连接失败', en: 'Connection failed' },
  'settings.sendTest': { zh: '发送测试消息', en: 'Send test message' },
  'settings.sending': { zh: '发送中…', en: 'Sending…' },
  'settings.chatOk': { zh: '聊天链路正常，模型有回复', en: 'Chat endpoint works — model replied' },
  'settings.chatFail': { zh: '测试失败', en: 'Test failed' },
  'settings.corsHint': {
    zh: '⚠ 本地端点需开启 CORS 才能被网页访问：LM Studio 在 Server 设置中打开「Enable CORS」；Ollama 启动前设置环境变量 OLLAMA_ORIGINS=*。',
    en: '⚠ Local endpoints need CORS enabled: turn on "Enable CORS" in LM Studio server settings; for Ollama set OLLAMA_ORIGINS=* before starting.',
  },

  // ── 导入错误 ──
  'import.jsonFail': { zh: 'JSON 解析失败', en: 'Failed to parse JSON' },
  'import.unknownFormat': { zh: '无法识别的角色卡格式', en: 'Unrecognized card format' },
  'import.unsupported': { zh: '仅支持 .png / .json 文件', en: 'Only .png / .json files are supported' },
  'import.fail': { zh: '导入失败', en: 'Import failed' },

  // ── 模型选择器 ──
  'model.picker': { zh: '选择模型', en: 'Select model' },
  'model.recommended': { zh: '编辑推荐', en: 'Editor\'s pick' },
  'model.tier.phone': { zh: '手机/低配', en: 'Phone / low-end' },
  'model.tier.balanced': { zh: '中等性能', en: 'Balanced' },
  'model.tier.high': { zh: '高性能', en: 'High performance' },
  'model.usage.phone': { zh: '适合低端手机或旧设备，响应快、耗资源少', en: 'Best for low-end phones or older devices — fast and light' },
  'model.usage.balanced': { zh: '适合普通手机或平板，质量与速度均衡', en: 'Good for most phones or tablets — balanced quality and speed' },
  'model.usage.high': { zh: '适合高性能设备或桌面端，效果最好但更慢更占资源', en: 'Best for powerful devices or desktop — top quality but slower and heavier' },
  'model.other': { zh: '其他模型', en: 'Other models' },
  'model.selectDefault': { zh: '根据你的设备自动选择', en: 'Auto-select based on your device' },

  // ── WebLLM 免 Key 体验档 ──
  'webllm.preset': { zh: '免 Key 体验', en: 'Free demo (local)' },
  'webllm.hint': {
    zh: '⚡ 免 Key 体验：模型完全在你的浏览器本地运行，无需任何 API Key。首次使用需下载约 900MB 模型（之后有缓存），需要支持 WebGPU 的浏览器（Chrome / Edge 113+）。',
    en: '⚡ Free demo: the model runs entirely in your browser — no API key needed. First use downloads ~900MB (cached afterwards). Requires a WebGPU-capable browser (Chrome / Edge 113+).',
  },
  'webllm.unsupported': {
    zh: '当前浏览器不支持 WebGPU，免 Key 体验档无法运行。请改用 Chrome / Edge 113+，或配置 BYOK 端点。',
    en: 'Your browser does not support WebGPU, so the free demo cannot run. Use Chrome / Edge 113+, or configure a BYOK endpoint.',
  },
  'webllm.loading': { zh: '正在准备本地模型：', en: 'Preparing local model: ' },

  // ── 角色卡编辑器 ──
  'editor.title': { zh: '编辑角色卡', en: 'Edit character card' },
  'editor.name': { zh: '名称', en: 'Name' },
  'editor.description': { zh: '背景描述', en: 'Description' },
  'editor.personality': { zh: '性格', en: 'Personality' },
  'editor.scenario': { zh: '场景', en: 'Scenario' },
  'editor.firstMes': { zh: '开场白', en: 'First message' },
  'editor.mesExample': { zh: '对话示例', en: 'Example dialogue' },
  'editor.systemPrompt': { zh: '系统提示词', en: 'System prompt' },
  'editor.tags': { zh: '标签（逗号分隔）', en: 'Tags (comma separated)' },
  'editor.contentRating': { zh: '内容分级', en: 'Content rating' },
  'editor.save': { zh: '保存', en: 'Save' },
  'editor.cancel': { zh: '取消', en: 'Cancel' },
  'editor.builtinNote': { zh: '这是内置角色，保存后将创建你的个人副本', en: 'This is a built-in character. Saving will create your personal copy.' },
  'gallery.edit': { zh: '编辑', en: 'Edit' },
}

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let text = dict[key]?.[lang] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v))
  }
  return text
}

// ── 解析层错误翻译 ──────────────────────────────────────
// tavern.ts 抛出的错误以中文为准（保持库与 UI 解耦），
// 英文界面下按映射表翻译，未命中则原样展示
const errorMap: [string, string][] = [
  ['不是有效的 PNG 文件', 'Not a valid PNG file'],
  ['PNG 中没有角色卡数据（缺少 ccv3 / chara 区块）', 'No character card data in PNG (missing ccv3 / chara chunk)'],
  ['zTXt 区块使用了未知压缩方法', 'Unknown compression method in zTXt chunk'],
  ['角色卡数据 base64 解码失败', 'Failed to decode card data (base64)'],
  ['角色卡 JSON 解析失败', 'Failed to parse character card JSON'],
  ['无法识别的角色卡数据结构', 'Unrecognized character card structure'],
  ['角色卡数据解压失败', 'Failed to decompress card data'], // 前缀匹配（gzip/deflate）
]

export function localizeError(lang: Lang, message: string): string {
  if (lang === 'zh') return message
  for (const [zh, en] of errorMap) {
    if (message.startsWith(zh)) return en
  }
  return message
}
