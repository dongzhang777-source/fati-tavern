/**
 * 轻量 i18n——零依赖，四语言字典（zh/en/ja/ko，与 fati 主项目语言覆盖一致）。
 * 品牌名规则：中文=「肥猫酒馆」，其他语言=「FATI Tavern」。
 */
export type Lang = 'zh' | 'en' | 'ja' | 'ko'

const LS_LANG_KEY = 'tavern-lang'

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_LANG_KEY)
    if (saved === 'zh' || saved === 'en' || saved === 'ja' || saved === 'ko') return saved
  } catch { /* ignore */ }
  const nav = navigator.language?.toLowerCase() ?? 'en'
  if (nav.startsWith('zh')) return 'zh'
  if (nav.startsWith('ja')) return 'ja'
  if (nav.startsWith('ko')) return 'ko'
  return 'en'
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

const dict: Record<string, { zh: string; en: string; ja: string; ko: string }> = {
  // ── 画廊 / 落地页 ──
  'gallery.dropOverlay': {
    zh: '松开导入角色卡或世界书（PNG / JSON）', en: 'Drop to import character cards or lorebooks (PNG / JSON)',
    ja: '離してキャラクターカードまたはワールドブックをインポート（PNG / JSON）', ko: '놓아서 캐릭터 카드 또는 월드북 가져오기 (PNG / JSON)',
  },
  'gallery.import': {
    zh: '+ 导入角色卡 / 世界书', en: '+ Import card / lorebook', ja: '+ カード／ワールドブックをインポート', ko: '+ 카드/월드북 가져오기',
  },
  'gallery.noDesc': {
    zh: '暂无描述', en: 'No description', ja: '説明なし', ko: '설명 없음',
  },
  'gallery.delete': {
    zh: '删除', en: 'Delete', ja: '削除', ko: '삭제',
  },
  'gallery.menuChat': {
    zh: '开始聊天', en: 'Start chatting', ja: 'チャットを開始', ko: '채팅 시작',
  },
  'chat.byokNote': {
    zh: 'BYOK · 你的 Key 和聊天记录不离开你的设备', en: 'BYOK · Your key and chats never leave your device',
    ja: 'BYOK · あなたのキーとチャットは端末の外に出ません', ko: 'BYOK · 키와 채팅은 기기 밖으로 나가지 않습니다',
  },
  // ── 底部 Tab 导航 ──
  'tab.chars': { zh: '角色', en: 'Chars', ja: 'キャラ', ko: '캐릭터' },
  'tab.chat': { zh: '聊天', en: 'Chat', ja: 'チャット', ko: '채팅' },
  'tab.books': { zh: '世界书', en: 'Lore', ja: '世界書', ko: '월드북' },
  'tab.settings': { zh: '设置', en: 'Settings', ja: '設定', ko: '설정' },
  'chat.pickFirst': {
    zh: '还没有进行中的聊天。去角色库挑一个角色，开始聊天吧',
    en: 'No active chat yet — pick a character from the library to start',
    ja: '進行中のチャットがありません。キャラライブラリから選んで開始しましょう',
    ko: '진행 중인 채팅이 없습니다. 캐릭터 라이브러리에서 선택해 시작하세요',
  },
  'landing.title': {
    zh: '拖一张角色卡进来，和 TA 聊天', en: 'Drop a character card in and start chatting',
    ja: 'キャラクターカードをドロップしてチャットを始めよう', ko: '캐릭터 카드를 끌어다 놓고 채팅을 시작하세요',
  },
  'landing.sub': {
    zh: '支持 SillyTavern 角色卡（PNG / JSON），3 分钟开始你的第一次对话',
    en: 'Supports SillyTavern cards (PNG / JSON) — first conversation in 3 minutes',
    ja: 'SillyTavernカード（PNG / JSON）対応 — 3分で最初の会話を', ko: 'SillyTavern 카드(PNG / JSON) 지원 — 3분 만에 첫 대화를',
  },
  'landing.step1': { zh: '拖入角色卡 / 世界书', en: 'Drop a card / lorebook', ja: 'カード／ワールドブックをドロップ', ko: '카드/월드북을 끌어오기' },
  'landing.step2': { zh: '填入你的 API Key', en: 'Add your API key', ja: 'APIキーを入力', ko: 'API 키 입력' },
  'landing.step3': { zh: '开始聊天', en: 'Start chatting', ja: 'チャット開始', ko: '채팅 시작' },
  'landing.cta': { zh: '导入第一张角色卡', en: 'Import your first card', ja: '最初のカードをインポート', ko: '첫 카드 가져오기' },
  'landing.ctaHint': {
    zh: '或者直接把文件拖到页面任意位置', en: 'or just drag a file anywhere on this page',
    ja: 'またはページ上のどこかにファイルをドラッグ', ko: '또는 이 페이지 아무 곳에나 파일을 끌어놓으세요',
  },
  'landing.privacyTitle': { zh: '🔒 隐私承诺', en: '🔒 Privacy promise', ja: '🔒 プライバシーの約束', ko: '🔒 프라이버시 약속' },
  'landing.privacyBody': {
    zh: '你的 API Key、角色卡、聊天记录全部只存在你的浏览器中。没有后端服务器，没有内容上传，没有账号注册；主动分享时，卡片数据只保存在链接 # 后面。我们仅统计匿名的功能使用计数（访问 / 导入 / 发消息 / 角色编辑 / 嘴替使用 / 二轮对话 / 分享创建 / 分享打开 / 截图分享），不含任何聊天内容、角色卡或 Key。',
    en: 'Your API key, character cards and chats live only in your browser. No backend, no content uploads, no sign-up; when you choose to share, card data stays only after the link’s #. We only collect anonymous feature-usage counts (visit / import / message / character edit / reply helper / second round / share created / share opened / screenshot share) — never any chat content, cards or keys.',
    ja: 'あなたのAPIキー、キャラクターカード、チャットはすべてブラウザ内にだけ保存されます。バックエンドサーバーも、コンテンツのアップロードも、アカウント登録もありません。共有を選択した場合、カードデータはリンクの#以降だけに保存されます。当サイトは匿名の機能利用回数（訪問／インポート／送信／キャラクター編集／返信アシスト／2回目の対話／共有作成／共有オープン／スクショ共有）のみを集計し、チャット内容・カード・キーは一切収集しません。',
    ko: 'API 키, 캐릭터 카드, 채팅은 모두 브라우저에만 저장됩니다. 백엔드 서버도, 콘텐츠 업로드도, 회원가입도 없습니다. 공유를 선택하면 카드 데이터는 링크의 # 뒤에만 저장됩니다. 당사는 익명의 기능 사용 횟수(방문/가져오기/메시지/캐릭터 편집/답변 도우미/2차 대화/공유 생성/공유 열기/스크린샷 공유)만 집계하며, 채팅 내용·카드·키는 절대 수집하지 않습니다.',
  },
  'landing.feat1': { zh: '纯前端 PWA<br/>零安装零注册', en: 'Pure frontend PWA<br/>No install, no sign-up', ja: '完全フロントエンドPWA<br/>インストール不要・登録不要', ko: '완전 프론트엔드 PWA<br/>설치·가입 불필요' },
  'landing.feat2': { zh: 'BYOK 自带 Key<br/>DeepSeek / Kimi / OpenAI / 本地', en: 'BYOK — bring your key<br/>DeepSeek / Kimi / OpenAI / local', ja: 'BYOK — 自分のキーを持ち込み<br/>DeepSeek / Kimi / OpenAI / ローカル', ko: 'BYOK — 본인 키 지참<br/>DeepSeek / Kimi / OpenAI / 로컬' },
  'landing.feat3': { zh: '手机电脑通用<br/>可添加到主屏幕', en: 'Works on phone & desktop<br/>Add to home screen', ja: 'スマホ・PC両対応<br/>ホーム画面に追加可', ko: '모바일·PC 모두 지원<br/>홈 화면에 추가 가능' },
  'landing.feat4': { zh: '数据存本地<br/>刷新不丢失', en: 'Data stored locally<br/>Survives refresh', ja: 'データはローカル保存<br/>更新しても消えません', ko: '데이터는 로컬 저장<br/>새로고침해도 유지됩니다' },
  // ── 零摩擦落地页 ──
  'landing.title2': { zh: '选一个角色，立即开聊', en: 'Pick a character and start chatting', ja: 'キャラクターを選んで今すぐチャット', ko: '캐릭터를 골라 바로 채팅' },
  'landing.subtitle2': { zh: '20 个精选角色 · 浏览器本地推理 · 零配置', en: '20 curated characters · Local AI · Zero setup', ja: '厳選20キャラクター · ブラウザ内ローカル推論 · 設定不要', ko: '엄선된 20개 캐릭터 · 브라우저 로컬 추론 · 무설정' },
  'landing.browseCatalog': { zh: '或导入你自己的角色卡', en: 'Or import your own character card', ja: 'または自分のカードをインポート', ko: '또는 본인 카드 가져오기' },
  'catalog.modelReady': {
    zh: '本地 AI 已就绪：{model}',
    en: 'Local AI ready: {model}',
    ja: 'ローカルAI準備完了：{model}',
    ko: '로컬 AI 준비 완료: {model}',
  },
  'catalog.modelUnavailable': {
    zh: '此浏览器不支持 WebGPU；请配置自带 API 端点',
    en: 'This browser does not support WebGPU; configure your own API endpoint',
    ja: 'このブラウザはWebGPU非対応です。自分のAPIエンドポイントを設定してください',
    ko: '이 브라우저는 WebGPU를 지원하지 않습니다. 본인 API 엔드포인트를 설정하세요',
  },
  'gallery.share': { zh: '分享', en: 'Share', ja: '共有', ko: '공유' },
  'gallery.sharing': { zh: '生成中…', en: 'Creating…', ja: '作成中…', ko: '생성 중…' },
  'share.copied': {
    zh: '分享链接已复制，卡片数据只保存在链接 # 中',
    en: 'Share link copied; card data stays only in the URL fragment',
    ja: '共有リンクをコピーしました。カードデータはURLフラグメント内だけに保存されます',
    ko: '공유 링크가 복사되었습니다. 카드 데이터는 URL 조각에만 저장됩니다',
  },
  'catalog.builtin': { zh: '内置', en: 'Built-in', ja: '内蔵', ko: '내장' },
  'catalog.free': { zh: '免费', en: 'Free', ja: '無料', ko: '무료' },
  'toast.imported': { zh: '✓ 已导入 {n} 张角色卡', en: '✓ Imported {n} card(s)', ja: '✓ {n}枚のカードをインポートしました', ko: '✓ 카드 {n}장을 가져왔습니다' },

  // ── PWA 安装引导 / 离线提示 / 消息分页 ──
  'install.banner': {
    zh: '把肥猫酒馆安装到设备——随时一键打开，离线也能用',
    en: 'Install FATI Tavern — one tap away, works offline',
    ja: 'FATI Tavernをインストール — ワンタップで起動、オフラインでも使えます',
    ko: 'FATI Tavern 설치 — 한 번의 탭으로 실행, 오프라인에서도 사용 가능',
  },
  'install.action': { zh: '安装', en: 'Install', ja: 'インストール', ko: '설치' },
  'install.dismiss': { zh: '以后再说', en: 'Later', ja: '後で', ko: '나중에' },
  'install.iosHint': {
    zh: 'iOS 安装方法：点浏览器底部「分享」按钮，选择「添加到主屏幕」',
    en: 'To install on iOS: tap the Share button in the browser bar, then choose "Add to Home Screen"',
    ja: 'iOSでのインストール：ブラウザの「共有」ボタンをタップし、「ホーム画面に追加」を選択',
    ko: 'iOS 설치 방법: 브라우저의 공유 버튼을 탭한 후 "홈 화면에 추가"를 선택하세요',
  },
  'offline.bar': {
    zh: '当前无网络——历史记录仍可查看，发送需联网',
    en: 'You’re offline — history is still readable, sending needs a connection',
    ja: 'オフライン — 履歴は閲覧できます。送信には接続が必要です',
    ko: '오프라인 상태 — 지난 대화는 볼 수 있고, 보내려면 연결이 필요합니다',
  },
  'chat.loadEarlier': {
    zh: '加载更早的消息', en: 'Load earlier messages', ja: '以前のメッセージを読み込む', ko: '이전 메시지 불러오기',
  },

  // ── 聊天 ──
  'chat.back': { zh: '← 角色库', en: '← Library', ja: '← ライブラリ', ko: '← 라이브러리' },
  'chat.convList': { zh: '对话列表', en: 'Conversations', ja: '会話一覧', ko: '대화 목록' },
  'chat.clear': { zh: '清空', en: 'Clear', ja: 'クリア', ko: '지우기' },
  'chat.screenshot': { zh: '截图分享', en: 'Screenshot', ja: 'スクショ共有', ko: '스크린샷 공유' },
  'chat.shotBusy': { zh: '生成中…', en: 'Rendering…', ja: '生成中…', ko: '생성 중…' },
  'chat.shotOk': { zh: '✓ 截图已生成', en: '✓ Screenshot ready', ja: '✓ スクリーンショット完成', ko: '✓ 스크린샷 생성됨' },
  'chat.shotFail': { zh: '截图生成失败', en: 'Screenshot failed', ja: 'スクリーンショット生成に失敗', ko: '스크린샷 생성 실패' },
  'shot.tagline': {
    zh: '免费 AI 角色扮演 · 隐私至上', en: 'Free AI roleplay · Privacy first',
    ja: '無料AIロールプレイ · プライバシー第一', ko: '무료 AI 롤플레이 · 프라이버시 우선',
  },
  'chat.convHeader': { zh: '对话', en: 'Chats', ja: 'チャット', ko: '채팅' },
  'chat.newConv': { zh: '+ 新对话', en: '+ New chat', ja: '+ 新しいチャット', ko: '+ 새 채팅' },
  'chat.newConvTitle': { zh: '新对话', en: 'New chat', ja: '新しいチャット', ko: '새 채팅' },
  'chat.placeholder': { zh: '对 {name} 说点什么…', en: 'Say something to {name}…', ja: '{name}に話しかける…', ko: '{name}에게 말을 걸어보세요…' },
  'chat.stop': { zh: '■ 停止', en: '■ Stop', ja: '■ 停止', ko: '■ 정지' },
  'chat.send': { zh: '发送', en: 'Send', ja: '送信', ko: '보내기' },
  'chat.aiDisclosure': { zh: 'AI 角色扮演 · 非真人', en: 'AI roleplay · not a real person', ja: 'AIロールプレイ · 実在の人物ではありません', ko: 'AI 롤플레이 · 실제 인물이 아닙니다' },
  'chat.crisis': {
    zh: '如果你正处在难以承受的情绪中，请记得你并不孤单。可拨打全国心理援助热线 12356（24 小时），或北京心理危机研究与干预中心 010-82951332。',
    en: 'If you are going through a difficult time, you are not alone. US: call or text 988 (Suicide & Crisis Lifeline). UK & ROI: Samaritans 116 123.',
    ja: 'つらい気持ちを抱えているなら、あなたは一人ではありません。よりそいホットライン 0120-279-338（24時間・無料）にご相談ください。',
    ko: '힘든 시간을 보내고 있다면, 당신은 혼자가 아닙니다. 자살예방상담전화 109(24시간)로 연락하세요.',
  },
  'chat.crisisDismiss': { zh: '我知道了', en: 'Got it', ja: '了解', ko: '확인' },
  'chat.loreTitle': { zh: '本聊天的世界书', en: 'Lorebook for this chat', ja: 'このチャットのワールドブック', ko: '이 채팅의 월드북' },
  'chat.lorePick': { zh: '选择世界书', en: 'Pick a lorebook', ja: 'ワールドブックを選択', ko: '월드북 선택' },
  'chat.loreCurrent': { zh: '当前：{name}', en: 'Current: {name}', ja: '現在：{name}', ko: '현재: {name}' },
  'chat.loreNone': { zh: '当前未绑定世界书（卡自带或全局激活的书仍会生效）', en: 'No bound lorebook (card-embedded or globally active books still apply)', ja: 'ワールドブック未紐付け（カード内蔵または全体有効の本は引き続き有効）', ko: '연결된 월드북 없음(카드 내장 또는 전체 활성화 책은 계속 적용)' },
  'error.noEndpoint': { zh: '请先在设置中配置 API 端点', en: 'Please configure an API endpoint in settings first', ja: '先に設定でAPIエンドポイントを構成してください', ko: '먼저 설정에서 API 엔드포인트를 구성하세요' },
  'error.request': { zh: '请求失败', en: 'Request failed', ja: 'リクエスト失敗', ko: '요청 실패' },

  // ── 设置 ──
  'settings.title': { zh: 'API 端点', en: 'API Endpoint', ja: 'APIエンドポイント', ko: 'API 엔드포인트' },
  'settings.lang': { zh: '语言 / Language', en: 'Language / 语言', ja: '言語 / Language', ko: '언어 / Language' },
  'settings.baseUrl': { zh: 'Base URL', en: 'Base URL', ja: 'ベースURL', ko: '기본 URL' },
  'settings.apiKey': { zh: 'API Key（只存本地，不离开你的设备）', en: 'API Key (stored locally, never leaves your device)', ja: 'APIキー（ローカル保存のみ、端末の外に出ません）', ko: 'API 키(로컬에만 저장, 기기 밖으로 나가지 않음)' },
  'settings.keySharedHint': { zh: 'Key 仅存于本浏览器（localStorage）。共用设备请在离开前清除。', en: 'Your key is stored only in this browser (localStorage). Clear it before leaving a shared device.', ja: 'キーはこのブラウザ（localStorage）にのみ保存されます。共用端末では離席前に削除してください。', ko: '키는 이 브라우저(localStorage)에만 저장됩니다. 공용 기기에서는 떠나기 전에 지워 주세요.' },
  'settings.clearEndpoint': { zh: '清除端点与 Key', en: 'Clear endpoint & key', ja: 'エンドポイントとキーを削除', ko: '엔드포인트 및 키 지우기' },
  'settings.clearEndpointDone': { zh: '已清除，已恢复为本地默认', en: 'Cleared, restored to local default', ja: '削除しました。ローカル既定に戻しました', ko: '지웠습니다. 로컬 기본값으로 복원됨' },
  'settings.model': { zh: '模型', en: 'Model', ja: 'モデル', ko: '모델' },
  'settings.temp': { zh: '温度（0–2）', en: 'Temperature (0–2)', ja: '温度（0–2）', ko: '온도 (0–2)' },
  'settings.maxTokens': { zh: '最大回复 tokens', en: 'Max response tokens', ja: '最大応答トークン数', ko: '최대 응답 토큰 수' },
  'settings.test': { zh: '测试连接 & 拉取模型', en: 'Test connection & fetch models', ja: '接続テストとモデル取得', ko: '연결 테스트 & 모델 가져오기' },
  'settings.testing': { zh: '测试中…', en: 'Testing…', ja: 'テスト中…', ko: '테스트 중…' },
  'settings.testOk': { zh: '连接成功，发现 {n} 个模型', en: 'Connected — found {n} models', ja: '接続成功 — {n}個のモデルを発見', ko: '연결 성공 — 모델 {n}개 발견' },
  'settings.testFail': { zh: '连接失败', en: 'Connection failed', ja: '接続失敗', ko: '연결 실패' },
  'settings.sendTest': { zh: '发送测试消息', en: 'Send test message', ja: 'テストメッセージを送信', ko: '테스트 메시지 보내기' },
  'settings.sending': { zh: '发送中…', en: 'Sending…', ja: '送信中…', ko: '전송 중…' },
  'settings.chatOk': { zh: '聊天链路正常，模型有回复', en: 'Chat endpoint works — model replied', ja: 'チャット連携は正常 — モデルが応答しました', ko: '채팅 정상 — 모델이 응답했습니다' },
  'settings.chatEmpty': { zh: '模型无回复（可能为思考型模型消耗了全部 token）', en: 'Model returned empty (thinking model may have consumed all tokens)', ja: 'モデルが空返答（思考モデルがトークンを消費した可能性）', ko: '모델 빈 응답（사고 모델이 토큰 소진 가능）' },
  'settings.chatFail': { zh: '测试失败', en: 'Test failed', ja: 'テスト失敗', ko: '테스트 실패' },
  'settings.corsHint': {
    zh: '⚠ 本地端点需开启 CORS 才能被网页访问：LM Studio 在 Server 设置中打开「Enable CORS」；Ollama 启动前设置环境变量 OLLAMA_ORIGINS=*。',
    en: '⚠ Local endpoints need CORS enabled: turn on "Enable CORS" in LM Studio server settings; for Ollama set OLLAMA_ORIGINS=* before starting.',
    ja: '⚠ ローカルエンドポイントはWebからアクセスするためにCORSの有効化が必要です：LM Studioはサーバー設定で「Enable CORS」をオン、Ollamaは起動前に環境変数 OLLAMA_ORIGINS=* を設定。',
    ko: '⚠ 로컬 엔드포인트는 웹 접근을 위해 CORS를 켜야 합니다: LM Studio는 서버 설정에서 "Enable CORS"를 켜고, Ollama는 시작 전 환경변수 OLLAMA_ORIGINS=*를 설정하세요.',
  },

  // ── 用户 persona ──
  'persona.title': { zh: '我的扮演', en: 'My persona', ja: '私のペルソナ', ko: '내 페르소나' },
  'persona.name': { zh: '我的名字（替换卡片里的 {{user}}）', en: 'My name (replaces {{user}} in cards)', ja: '私の名前（カード内の{{user}}を置換）', ko: '내 이름(카드의 {{user}}를 대체)' },
  'persona.namePlaceholder': { zh: '留空则为 User', en: 'Defaults to "User"', ja: '空欄なら「User」', ko: '비우면 "User"' },
  'persona.desc': { zh: '我在故事里扮演谁（可选，角色会据此回应你）', en: 'Who I play in the story (optional — characters respond accordingly)', ja: '物語で誰を演じるか（任意・キャラクターがこれに合わせて応答）', ko: '이야기 속 내 역할(선택 — 캐릭터가 이에 맞춰 응답)' },
  'persona.descPlaceholder': { zh: '例：一名初入酒馆的年轻冒险者，话不多但重情义', en: 'e.g. A young adventurer new to the tavern, quiet but loyal', ja: '例：酒場に来たばかりの若い冒険者。口数は少ないが義理堅い', ko: '예: 술집에 새로 온 젊은 모험가, 말수는 적지만 의리 있음' },

  // ── 嘴替（帮我接话）──
  'imp.entry': { zh: '帮我接话', en: 'Help me reply', ja: '返信を手伝って', ko: '답장 도와줘' },
  'imp.close': { zh: '收起', en: 'Close', ja: '閉じる', ko: '닫기' },
  'imp.loading': { zh: '正在想…', en: 'Thinking…', ja: '考え中…', ko: '생각 중…' },
  'imp.empty': { zh: '没有生成建议，再试一次？', en: 'No suggestions — try again?', ja: '候補がありません — もう一度？', ko: '제안이 없습니다 — 다시 시도할까요?' },
  'imp.refine': { zh: '润色我的话', en: 'Polish my draft', ja: '私の文章を整える', ko: '내 글 다듬기' },
  'imp.refining': { zh: '润色中…', en: 'Polishing…', ja: '整形中…', ko: '다듬는 중…' },
  'imp.regen': { zh: '换一批', en: 'Regenerate', ja: '再生成', ko: '다시 생성' },
  'imp.costHint': { zh: '每次生成消耗一次模型调用，仅在你点击时发生', en: 'Each generation uses one model call, only when you click', ja: '生成ごとにモデル呼び出し1回分を消費（クリック時のみ）', ko: '생성마다 모델 호출 1회 소모(클릭 시에만)' },
  'imp.expandLow': { zh: '稳妥', en: 'Safe', ja: '控えめ', ko: '안정적' },
  'imp.expandHigh': { zh: '大胆', en: 'Bold', ja: '大胆', ko: '과감' },
  'imp.expandLabel': { zh: '拓展度', en: 'Expansion', ja: '広げ具合', ko: '확장 정도' },
  'imp.fail': { zh: '接话生成失败', en: 'Failed to generate reply', ja: '返信の生成に失敗しました', ko: '답장 생성 실패' },

  // ── 导入错误 ──
  'import.jsonFail': { zh: 'JSON 解析失败', en: 'Failed to parse JSON', ja: 'JSONの解析に失敗しました', ko: 'JSON 구문 분석 실패' },
  'import.unknownFormat': { zh: '无法识别的角色卡格式', en: 'Unrecognized card format', ja: '認識できないカード形式', ko: '인식할 수 없는 카드 형식' },
  'import.unsupported': { zh: '仅支持 .png / .json 文件', en: 'Only .png / .json files are supported', ja: '.png / .json ファイルのみ対応', ko: '.png / .json 파일만 지원' },
  'import.fail': { zh: '导入失败', en: 'Import failed', ja: 'インポート失敗', ko: '가져오기 실패' },
  'import.tooLarge': { zh: '文件过大，已拒绝（PNG≤50MB / JSON≤20MB）', en: 'File too large, rejected (PNG≤50MB / JSON≤20MB)', ja: 'ファイルが大きすぎます（PNG≤50MB / JSON≤20MB）', ko: '파일이 너무 큽니다(PNG≤50MB / JSON≤20MB)' },

  // ── 世界书 ──
  'toast.importedBooks': { zh: '✓ 已导入 {n} 本世界书', en: '✓ Imported {n} lorebook(s)', ja: '✓ {n}冊のワールドブックをインポートしました', ko: '✓ 월드북 {n}권을 가져왔습니다' },
  'lore.section': { zh: '世界书', en: 'Lorebooks', ja: 'ワールドブック', ko: '월드북' },
  'lore.empty': {
    zh: '还没有世界书。把世界书 JSON 拖进页面即可导入。激活后聊天自动引用设定，还能一键进入剧情模式。',
    en: 'No lorebooks yet. Drag a lorebook JSON onto the page to import it. Once active, its lore is woven into chats, and you can dive into story mode with one click.',
    ja: 'ワールドブックはまだありません。JSONをページにドラッグしてインポートできます。有効化するとチャットに自動で反映され、ワンクリックでストーリーモードに入れます。',
    ko: '아직 월드북이 없습니다. 월드북 JSON을 페이지로 끌어다 놓으면 가져올 수 있습니다. 활성화하면 채팅에 자동 반영되고, 원클릭으로 스토리 모드에 진입할 수 있습니다.',
  },
  'lore.hint': { zh: '世界书为聊天提供世界观设定；★ 设为全局激活，或展开绑定到指定角色。点「进入剧情」直接在这个世界里开始互动剧情。', en: 'Lorebooks supply world lore for chats — ★ activates globally, or expand to bind to a character. Hit "Enter story" to play an interactive story in this world.', ja: 'ワールドブックはチャットに世界観を提供します。★で全体有効化、または展開してキャラクターに紐付け。「ストーリーへ」でこの世界のインタラクティブストーリーを開始。', ko: '월드북은 채팅에 세계관 설정을 제공합니다. ★로 전체 활성화하거나 펼쳐서 캐릭터에 연결하세요. "스토리 입장"을 눌러 이 세계에서 인터랙티브 스토리를 시작하세요.' },
  'lore.untitled': { zh: '未命名世界书', en: 'Untitled lorebook', ja: '無題のワールドブック', ko: '제목 없는 월드북' },
  'lore.active': { zh: '全局激活', en: 'Active', ja: '全体有効', ko: '전체 활성화' },
  'lore.builtin': { zh: '内置示例', en: 'Built-in', ja: '内蔵サンプル', ko: '내장 샘플' },
  'lore.entries': { zh: '{n} 条设定', en: '{n} entries', ja: '{n}件の設定', ko: '설정 {n}개' },
  'lore.bound': { zh: '已绑定 {n} 个角色', en: 'bound to {n} character(s)', ja: '{n}キャラクターに紐付け済み', ko: '캐릭터 {n}명에 연결됨' },
  'lore.progress': { zh: '剧情已推进 {n} 幕', en: 'story at scene {n}', ja: 'ストーリー{n}幕まで進行', ko: '스토리 {n}막 진행' },
  'lore.enterStory': { zh: '进入剧情', en: 'Enter story', ja: 'ストーリーへ', ko: '스토리 입장' },
  'lore.activateHint': { zh: '设为全局激活（所有未绑定世界书的聊天都注入这本书）', en: 'Activate globally (injected into all chats without a bound lorebook)', ja: '全体有効化（ワールドブック未紐付けの全チャットに注入）', ko: '전체 활성화(월드북 미연결 채팅에 모두 주입)' },
  'lore.deleteConfirm': { zh: '删除这本世界书？相关剧情进度也会一并删除。', en: 'Delete this lorebook? Related story progress will be removed too.', ja: 'このワールドブックを削除しますか？関連するストーリー進行も削除されます。', ko: '이 월드북을 삭제할까요? 관련 스토리 진행도 함께 삭제됩니다.' },
  'lore.bindChar': { zh: '绑定到角色（该角色聊天时优先用这本书）', en: 'Bind to a character (this book takes priority in their chats)', ja: 'キャラクターに紐付け（そのキャラのチャットでこの本を優先使用）', ko: '캐릭터에 연결(해당 캐릭터 채팅에서 이 책 우선 사용)' },
  'lore.bindPick': { zh: '选择角色…', en: 'Pick a character…', ja: 'キャラクターを選択…', ko: '캐릭터 선택…' },
  'lore.safeHidden': { zh: '安全模式已开启：{n} 本成人世界书已隐藏', en: 'Safe mode on — {n} adult lorebook(s) hidden', ja: 'セーフモード有効：成人向けワールドブック {n} 件を非表示中', ko: '세이프 모드 켜짐 — 성인 월드북 {n}권 숨김' },

  // ── 剧情模式 ──
  'story.back': { zh: '← 返回', en: '← Back', ja: '← 戻る', ko: '← 뒤로' },
  'story.backGallery': { zh: '回到角色库', en: 'Back to library', ja: 'ライブラリへ戻る', ko: '라이브러리로 돌아가기' },
  'story.noActive': { zh: '还没有进行中的剧情。回画廊选一本世界书，点「进入剧情」开始。', en: 'No story in progress. Go back to the library, pick a lorebook and hit "Enter story".', ja: '進行中のストーリーはありません。ライブラリに戻り、ワールドブックを選んで「ストーリーへ」を押してください。', ko: '진행 중인 스토리가 없습니다. 라이브러리로 돌아가 월드북을 고르고 "스토리 입장"을 누르세요.' },
  'story.sceneCount': { zh: '已推进 {n} 幕', en: '{n} scene(s)', ja: '{n}幕進行済み', ko: '{n}막 진행' },
  'story.sceneNo': { zh: '第 {n} 幕', en: 'Scene {n}', ja: '第{n}幕', ko: '제{n}막' },
  'story.restart': { zh: '重新开始这个世界', en: 'Restart this world', ja: 'この世界をリスタート', ko: '이 세계 다시 시작' },
  'story.restartConfirm': { zh: '清空当前剧情进度，从第一幕重新开始？', en: 'Clear current progress and restart from scene 1?', ja: '現在の進行を消去し、第1幕からやり直しますか？', ko: '현재 진행을 지우고 1막부터 다시 시작할까요?' },
  'story.premise': { zh: '世界设定', en: 'World setting', ja: '世界設定', ko: '세계 설정' },
  'story.directing': { zh: '导演正在构思下一幕…', en: 'The director is crafting the next scene…', ja: '監督が次の幕を構想中…', ko: '감독이 다음 장면을 구상 중…' },
  'story.begin': { zh: '▶ 开始剧情', en: '▶ Begin story', ja: '▶ ストーリー開始', ko: '▶ 스토리 시작' },
  'story.beginPlaceholder': { zh: '可选：给个开场引子，或直接开始…', en: 'Optional: give an opening hook, or just begin…', ja: '任意：冒頭のきっかけを入力、またはそのまま開始…', ko: '선택: 시작 힌트를 입력하거나 바로 시작…' },
  'story.inputPlaceholder': { zh: '你想怎么做…', en: 'What do you do…', ja: 'あなたはどうする…', ko: '당신은 무엇을 하나요…' },
  'story.fail': { zh: '剧情生成失败', en: 'Failed to generate scene', ja: 'シーンの生成に失敗しました', ko: '장면 생성 실패' },
  'story.plainHint': { zh: '本地小模型剧情档：无选项按钮，用输入框自由推进', en: 'Local small-model story mode: no choice buttons — drive the story via the input box', ja: 'ローカル小型モデルのストーリーモード：選択肢ボタンなし、入力欄で自由に進行', ko: '로컬 소형 모델 스토리 모드: 선택 버튼 없음, 입력창으로 자유롭게 진행' },

  // ── 模型选择器 ──
  'model.picker': { zh: '选择模型', en: 'Select model', ja: 'モデルを選択', ko: '모델 선택' },
  'model.recommended': { zh: '编辑推荐', en: 'Editor\'s pick', ja: '編集部のおすすめ', ko: '편집자 추천' },
  'model.tier.phone': { zh: '手机/低配', en: 'Phone / low-end', ja: 'スマホ／低スペック', ko: '모바일/저사양' },
  'model.tier.balanced': { zh: '中等性能', en: 'Balanced', ja: 'バランス型', ko: '균형형' },
  'model.tier.high': { zh: '高性能', en: 'High performance', ja: 'ハイパフォーマンス', ko: '고성능' },
  'model.usage.phone': { zh: '适合低端手机或旧设备，响应快、耗资源少', en: 'Best for low-end phones or older devices — fast and light', ja: '低端スマホや旧端末向け — 高速・省リソース', ko: '저사양 폰이나 구형 기기에 적합 — 빠르고 가벼움' },
  'model.usage.balanced': { zh: '适合普通手机或平板，质量与速度均衡', en: 'Good for most phones or tablets — balanced quality and speed', ja: '一般的なスマホ・タブレット向け — 品質と速度のバランス型', ko: '일반 폰이나 태블릿에 적합 — 품질과 속도 균형' },
  'model.usage.high': { zh: '适合高性能设备或桌面端，效果最好但更慢更占资源', en: 'Best for powerful devices or desktop — top quality but slower and heavier', ja: '高性能端末・デスクトップ向け — 最高品質だが遅く重い', ko: '고성능 기기나 데스크톱에 적합 — 최고 품질이지만 느리고 무거움' },
  'model.other': { zh: '其他模型', en: 'Other models', ja: 'その他のモデル', ko: '기타 모델' },
  'model.selectDefault': { zh: '根据你的设备自动选择', en: 'Auto-select based on your device', ja: '端末に合わせて自動選択', ko: '기기에 맞춰 자동 선택' },

  // ── WebLLM 免 Key 体验档 ──
  'webllm.preset': { zh: '免 Key 体验', en: 'Free demo (local)', ja: 'キー不要デモ（ローカル）', ko: '키 무료 체험(로컬)' },
  'webllm.hint': {
    zh: '⚡ 免 Key 体验：模型完全在你的浏览器本地运行，无需任何 API Key。首次使用需下载 300–900MB 模型（按设备档位，之后有缓存），需要支持 WebGPU 的浏览器（Chrome / Edge 113+）。',
    en: '⚡ Free demo: the model runs entirely in your browser — no API key needed. First use downloads 300–900MB depending on device tier (cached afterwards). Requires a WebGPU-capable browser (Chrome / Edge 113+).',
    ja: '⚡ キー不要デモ：モデルは完全にブラウザ内で動作し、APIキーは不要です。初回利用時はデバイス階層に応じて300〜900MBをダウンロード（以降はキャッシュ）。WebGPU対応ブラウザ（Chrome / Edge 113+）が必要です。',
    ko: '⚡ 키 무료 체험: 모델은 완전히 브라우저 안에서 실행되며 API 키가 필요 없습니다. 첫 사용 시 기기 등급에 따라 300–900MB를 내려받습니다(이후 캐시됨). WebGPU 지원 브라우저(Chrome / Edge 113+)가 필요합니다.',
  },
  'webllm.unsupported': {
    zh: '当前浏览器不支持 WebGPU，免 Key 体验档无法运行。请改用 Chrome / Edge 113+，或配置 BYOK 端点。',
    en: 'Your browser does not support WebGPU, so the free demo cannot run. Use Chrome / Edge 113+, or configure a BYOK endpoint.',
    ja: 'お使いのブラウザはWebGPUに対応していないため、キー不要デモは実行できません。Chrome / Edge 113+をご利用いただくか、BYOKエンドポイントを構成してください。',
    ko: '현재 브라우저가 WebGPU를 지원하지 않아 키 무료 체험을 실행할 수 없습니다. Chrome / Edge 113+를 사용하거나 BYOK 엔드포인트를 구성하세요.',
  },
  'webllm.loading': { zh: '正在准备本地模型：', en: 'Preparing local model: ', ja: 'ローカルモデルを準備中：', ko: '로컬 모델 준비 중: ' },

  // ── 角色卡编辑器 ──
  'editor.title': { zh: '编辑角色卡', en: 'Edit character card', ja: 'キャラクターカードを編集', ko: '캐릭터 카드 편집' },
  'editor.name': { zh: '名称', en: 'Name', ja: '名前', ko: '이름' },
  'editor.description': { zh: '背景描述', en: 'Description', ja: '背景説明', ko: '배경 설명' },
  'editor.personality': { zh: '性格', en: 'Personality', ja: '性格', ko: '성격' },
  'editor.scenario': { zh: '场景', en: 'Scenario', ja: 'シナリオ', ko: '시나리오' },
  'editor.firstMes': { zh: '开场白', en: 'First message', ja: '最初のメッセージ', ko: '첫 메시지' },
  'editor.mesExample': { zh: '对话示例', en: 'Example dialogue', ja: '会話例', ko: '대화 예시' },
  'editor.systemPrompt': { zh: '系统提示词', en: 'System prompt', ja: 'システムプロンプト', ko: '시스템 프롬프트' },
  'editor.tags': { zh: '标签（逗号分隔）', en: 'Tags (comma separated)', ja: 'タグ（カンマ区切り）', ko: '태그(쉼표로 구분)' },
  'editor.contentRating': { zh: '内容分级', en: 'Content rating', ja: 'コンテンツレーティング', ko: '콘텐츠 등급' },
  'editor.save': { zh: '保存', en: 'Save', ja: '保存', ko: '저장' },
  'editor.titleCopy': { zh: '创建角色副本', en: 'Create character copy', ja: 'キャラクターのコピーを作成', ko: '캐릭터 사본 만들기' },
  'editor.saveCopy': { zh: '创建副本', en: 'Create Copy', ja: 'コピーを作成', ko: '사본 만들기' },
  'editor.cancel': { zh: '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
  'editor.builtinNote': { zh: '这是内置角色，保存后将创建你的个人副本', en: 'This is a built-in character. Saving will create your personal copy.', ja: 'これは内蔵キャラクターです。保存するとあなた用のコピーが作成されます。', ko: '이것은 내장 캐릭터입니다. 저장하면 개인용 사본이 만들어집니다.' },
  'gallery.edit': { zh: '编辑', en: 'Edit', ja: '編集', ko: '편집' },
  'gallery.copyEdit': { zh: '副本编辑', en: 'Copy & Edit', ja: 'コピーして編集', ko: '복사 후 편집' },
  'toast.builtinCopied': { zh: '✓ 已创建内置角色副本「{name}」', en: '✓ Created personal copy "{name}"', ja: '✓ 内蔵キャラクターのコピー「{name}」を作成しました', ko: '✓ 내장 캐릭터 사본 "{name}"을(를) 만들었습니다' },
  'settings.safeMode': { zh: '安全模式', en: 'Safe mode', ja: 'セーフモード', ko: '세이프 모드' },
  'settings.safeModeDesc': { zh: '开启后隐藏标记为 18+ 的角色卡', en: 'Hide character cards marked as 18+ when enabled', ja: '有効にすると18+とマークされたカードを非表示にします', ko: '활성화하면 18+로 표시된 카드를 숨깁니다' },
  'settings.safeModeLocked': { zh: '未满 18 岁，安全模式已锁定开启', en: 'Locked on because you are under 18', ja: '18歳未満のためセーフモードはロックされています', ko: '18세 미만이므로 세이프 모드가 잠겨 있습니다' },
  'age.title': { zh: '年龄确认', en: 'Age Check', ja: '年齢確認', ko: '연령 확인' },
  'age.desc': { zh: '请输入你的年龄，用于决定是否开启安全模式（隐藏 18+ 角色卡）。仅保存在你的设备上。', en: 'Enter your age so we can decide whether to enable safe mode (hides 18+ cards). Stored only on your device.', ja: '年齢を入力してください。セーフモード（18+カードを非表示）の有効判定に使用します。デバイスにのみ保存されます。', ko: '나이를 입력해 주세요. 세이프 모드(18+ 카드 숨김) 활성화 여부를 결정하는 데 사용됩니다. 기기에만 저장됩니다.' },
  'age.placeholder': { zh: '你的年龄', en: 'Your age', ja: '年齢', ko: '나이' },
  'age.confirm': { zh: '确认', en: 'Confirm', ja: '確認', ko: '확인' },
  'age.invalid': { zh: '请输入有效年龄（1-120）', en: 'Please enter a valid age (1–120)', ja: '有効な年齢を入力してください（1〜120）', ko: '유효한 나이를 입력해 주세요 (1–120)' },
  'gallery.safeHidden': { zh: '安全模式已开启：{n} 张 18+ 角色卡已隐藏', en: 'Safe mode on — {n} 18+ card(s) hidden', ja: 'セーフモード有効：18+カード {n} 枚を非表示中', ko: '세이프 모드 켜짐 — 18+ 카드 {n}장 숨김' },
  'settings.disclaimerByok': {
    zh: 'BYOK · 你的 Key 和聊天记录不离开你的设备',
    en: 'BYOK · Your API key and chat history never leave your device',
    ja: 'BYOK · APIキーとチャット履歴はお使いのデバイスから外に出ません',
    ko: 'BYOK · API 키와 대화 기록은 기기를 떠나지 않습니다',
  },
  'settings.disclaimerContent': {
    zh: '角色卡为用户自行导入的第三方内容，本站不托管、不分发；标记为 18+ 的内容仅限成年人使用。',
    en: 'Character cards are third-party content imported by users; this site neither hosts nor distributes them. Content marked 18+ is for adults only.',
    ja: 'キャラクターカードはユーザーが自らインポートした第三者コンテンツであり、当サイトはホスト・配布を行いません。18+とマークされたコンテンツは成人のみ利用可能です。',
    ko: '캐릭터 카드는 사용자가 직접 가져온 제3자 콘텐츠이며, 본 사이트는 호스팅·배포하지 않습니다. 18+로 표시된 콘텐츠는 성인만 이용할 수 있습니다.',
  },

  // ── P2P 群聊 ──
  p2pTitle: { zh: 'P2P 群聊', en: 'P2P Group Chat', ja: 'P2Pグループチャット', ko: 'P2P 그룹 채팅' },
  p2pCreateInvite: { zh: '创建邀请', en: 'Create Invite', ja: '招待を作成', ko: '초대 만들기' },
  p2pJoinRoom: { zh: '加入房间', en: 'Join Room', ja: 'ルームに参加', ko: '방 참여' },
  p2pPasteToken: { zh: '粘贴邀请票据…', en: 'Paste invite token…', ja: '招待トークンを貼り付け…', ko: '초대 토큰 붙여넣기…' },
  p2pJoin: { zh: '加入', en: 'Join', ja: '参加', ko: '참여' },
  p2pCopy: { zh: '复制', en: 'Copy', ja: 'コピー', ko: '복사' },
  p2pCopied: { zh: '已复制', en: 'Copied', ja: 'コピーしました', ko: '복사됨' },
  p2pDisconnect: { zh: '断开', en: 'Disconnect', ja: '切断', ko: '연결 해제' },
  p2pEnterChat: { zh: '进入群聊', en: 'Enter Chat', ja: 'チャットに入る', ko: '채팅 입장' },
  p2pMembers: { zh: '成员', en: 'Members', ja: 'メンバー', ko: '멤버' },
  p2pComputeNode: { zh: '算力端', en: 'Compute node', ja: '計算ノード', ko: '컴퓨팅 노드' },
  p2pTabSolo: { zh: '单聊', en: 'Solo', ja: 'ソロ', ko: '개인' },
  p2pTabGroup: { zh: '群聊', en: 'Group', ja: 'グループ', ko: '그룹' },
  p2pSend: { zh: '发送', en: 'Send', ja: '送信', ko: '보내기' },
  p2pInputPlaceholder: { zh: '说点什么…', en: 'Say something…', ja: '何か入力…', ko: '말을 입력하세요…' },
  p2pBorrowCompute: { zh: '借算力', en: 'Borrow Compute', ja: '計算力を借りる', ko: '컴퓨팅 빌리기' },
  p2pComputePlaceholder: { zh: '输入 prompt，借桌面端算力…', en: 'Enter prompt to borrow desktop compute…', ja: 'プロンプトを入力してデスクトップの計算力を借用…', ko: '프롬프트를 입력해 데스크톱 컴퓨팅 빌리기…' },
  p2pCancel: { zh: '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
  p2pRetry: { zh: '重试', en: 'Retry', ja: '再試行', ko: '다시 시도' },
  p2pRelayLabel: { zh: 'P2P Relay 地址', en: 'P2P Relay URL', ja: 'P2PリレーURL', ko: 'P2P 릴레이 URL' },
  p2pRelayHint: { zh: '默认 ws://127.0.0.1:8081，公网用 wss://', en: 'Default ws://127.0.0.1:8081; use wss:// for public', ja: 'デフォルト ws://127.0.0.1:8081、公開にはwss://を使用', ko: '기본 ws://127.0.0.1:8081, 공개용은 wss:// 사용' },
  p2pConnecting: { zh: '连接中…', en: 'Connecting…', ja: '接続中…', ko: '연결 중…' },
  p2pJoined: { zh: '已连接', en: 'Connected', ja: '接続済み', ko: '연결됨' },
  p2pDisconnected: { zh: '已断开', en: 'Disconnected', ja: '切断済み', ko: '연결 해제됨' },
  p2pReconnectFailed: { zh: '重连失败，请手动重连', en: 'Reconnect failed, retry manually', ja: '再接続に失敗しました。手動で再接続してください', ko: '재연결 실패, 수동으로 다시 연결하세요' },
  p2pReconnect: { zh: '重新连接', en: 'Reconnect', ja: '再接続', ko: '재연결' },
  p2pE2E: { zh: '端到端加密', en: 'End-to-end encrypted', ja: 'エンドツーエンド暗号化', ko: '종단간 암호화' },
  p2pPlaintext: { zh: '未加密（房间无算力端）', en: 'Not encrypted (no compute node)', ja: '暗号化なし（ルームに計算ノードなし）', ko: '암호화 안 됨(방에 컴퓨팅 노드 없음)' },
  p2pSelfHostWarn: { zh: '⚠️ 自建房无算力端、所有消息明文经 relay，建议加入桌面端 FATI 创建的房间', en: '⚠️ Self-hosted rooms have no compute node — all messages are plaintext via relay. Join a room created by desktop FATI instead', ja: '⚠️ 自己ホストのルームには計算ノードがなく、全メッセージがリレー経由で平文になります。デスクトップ版FATIが作成したルームへの参加を推奨', ko: '⚠️ 자체 호스팅 방에는 컴퓨팅 노드가 없어 모든 메시지가 릴레이를 통해 평문으로 전달됩니다. 데스크톱 FATI가 만든 방에 참여하세요' },
  p2pPlaintextWarn: { zh: '⚠️ 当前房间未加密，消息明文经 relay 可见，请勿发送敏感内容', en: '⚠️ This room is unencrypted — messages are visible to relay. Do not send sensitive content', ja: '⚠️ このルームは暗号化されておらず、メッセージがリレーに見えます。機密内容を送らないでください', ko: '⚠️ 이 방은 암호화되지 않아 메시지가 릴레이에 보입니다. 민감한 내용을 보내지 마세요' },
  p2pMixedContentWarn: { zh: 'https 页面无法连接 ws:// 地址，请使用局域网开发服务或 wss://', en: 'https pages cannot connect to ws://; use LAN dev server or wss://', ja: 'httpsページはws://に接続できません。LAN開発サーバーまたはwss://をご利用ください', ko: 'https 페이지는 ws://에 연결할 수 없습니다. LAN 개발 서버나 wss://를 사용하세요' },
  p2pUnsupported: { zh: '当前浏览器不支持所需加密能力（需 Safari 17+ / Chrome 113+）', en: 'Browser lacks required crypto support (Safari 17+ / Chrome 113+)', ja: 'お使いのブラウザは必要な暗号機能をサポートしていません（Safari 17+ / Chrome 113+が必要）', ko: '현재 브라우저가 필요한 암호 기능을 지원하지 않습니다(Safari 17+ / Chrome 113+ 필요)' },
  p2pRoomId: { zh: '房间', en: 'Room', ja: 'ルーム', ko: '방' },
  p2pComputePlaintextWarn: {
    zh: '⚠️ 算力请求与结果不经过加密，Relay 可见，请勿发送敏感内容',
    en: '⚠️ Compute requests and results are unencrypted and visible to Relay. Do not send sensitive content.',
    ja: '⚠️ 計算リクエストと結果は暗号化されずリレーに見えます。機密内容を送らないでください。',
    ko: '⚠️ 컴퓨팅 요청과 결과는 암호화되지 않아 릴레이에 보입니다. 민감한 내용을 보내지 마세요.',
  },
  p2pComputePlaintextShort: { zh: '⚠️ 算力明文', en: '⚠️ Compute Plaintext', ja: '⚠️ 計算が平文', ko: '⚠️ 컴퓨팅 평문' },
  p2pQueueOverflowChat: { zh: '发送队列已满，已丢弃最旧的聊天消息', en: 'Send queue full, oldest chat message dropped', ja: '送信キューが満杯です。最も古いチャットメッセージを破棄しました', ko: '전송 큐가 가득 찼습니다. 가장 오래된 채팅 메시지를 버렸습니다' },
  p2pQueueOverflowCompute: { zh: '发送队列已满，已丢弃最旧的算力消息', en: 'Send queue full, oldest compute message dropped', ja: '送信キューが満杯です。最も古い計算メッセージを破棄しました', ko: '전송 큐가 가득 찼습니다. 가장 오래된 컴퓨팅 메시지를 버렸습니다' },
  p2pQueueOverflowDefault: { zh: '发送队列已满，已丢弃最旧的消息', en: 'Send queue full, oldest message dropped', ja: '送信キューが満杯です。最も古いメッセージを破棄しました', ko: '전송 큐가 가득 찼습니다. 가장 오래된 메시지를 버렸습니다' },
  p2pUndecryptable: { zh: '[无法解密的消息]', en: '[Undecryptable message]', ja: '[復号できないメッセージ]', ko: '[복호화할 수 없는 메시지]' },
  p2pEncFail: { zh: '消息加密失败，未发送', en: 'Message encryption failed, not sent', ja: 'メッセージの暗号化に失敗しました。送信されていません', ko: '메시지 암호화 실패, 전송되지 않음' },
  p2pComputeTimeout: { zh: '算力请求超时（30s），已取消', en: 'Compute request timed out (30s), cancelled', ja: '計算リクエストがタイムアウトしました（30秒）。キャンセルしました', ko: '컴퓨팅 요청 시간 초과(30초), 취소됨' },
  // L-5：reject reason 白名单映射（恶意 relay 不得向 UI 注入任意文案）
  p2pRejectExpired: { zh: '邀请票已过期', en: 'Invite token expired', ja: '招待トークンの期限切れ', ko: '초대 토큰이 만료됨' },
  p2pRejectInvalid: { zh: '邀请票无效', en: 'Invite token invalid', ja: '招待トークンが無効', ko: '초대 토큰이 유효하지 않음' },
  p2pRejectFull: { zh: '房间已满', en: 'Room is full', ja: 'ルームが満員', ko: '방이 가득 참' },
  p2pRejectGeneric: { zh: '连接被拒绝', en: 'Connection rejected', ja: '接続が拒否されました', ko: '연결이 거부됨' },
  p2pSendFailed: { zh: '消息加密失败，未发送', en: 'Message encryption failed, not sent', ja: '暗号化に失敗し、送信されませんでした', ko: '암호화 실패로 전송되지 않음' },
  // M-3：WebLLM 模型来源披露
  'webllm.modelSource': { zh: '模型权重从 huggingface.co/mlc-ai 下载，缓存于浏览器本地', en: 'Model weights are downloaded from huggingface.co/mlc-ai and cached locally in your browser', ja: 'モデルはhuggingface.co/mlc-aiからダウンロードし、ブラウザにローカルキャッシュされます', ko: '모델은 huggingface.co/mlc-ai에서 다운로드되어 브라우저에 로컬 캐시됩니다' },
  // ── StoryPack 试玩阅读器 ──
  'sp.tab': { zh: '故事', en: 'Stories', ja: 'ストーリー', ko: '스토리' },
  'sp.subtitle': { zh: '纯文本互动故事 · 无需 API Key', en: 'Text adventures · No API key needed', ja: 'テキストアドベンチャー · APIキー不要', ko: '텍스트 어드벤처 · API 키 불필요' },
  'sp.play': { zh: '开始游玩', en: 'Play', ja: 'プレイ', ko: '플레이' },
  'sp.continue': { zh: '继续', en: 'Continue', ja: '続ける', ko: '계속' },
  'sp.ending': { zh: '结局', en: 'Ending', ja: 'エンディング', ko: '엔딩' },
  'sp.endingTitle': { zh: '故事结束', en: 'Story ended', ja: 'ストーリー終了', ko: '스토리 종료' },
  'sp.restart': { zh: '重新开始', en: 'Restart', ja: 'やり直す', ko: '다시 시작' },
  'sp.backToList': { zh: '返回故事列表', en: 'Back to stories', ja: 'ストーリー一覧に戻る', ko: '스토리 목록으로' },
  'sp.nodes': { zh: '{n} 个场景', en: '{n} scenes', ja: '{n}シーン', ko: '{n}개 장면' },
  'sp.endings': { zh: '{n} 个结局', en: '{n} endings', ja: '{n}エンディング', ko: '{n}개 엔딩' },
  'sp.share': { zh: '分享结局', en: 'Share ending', ja: 'エンディングを共有', ko: '엔딩 공유' },
  'sp.copyText': { zh: '复制文本', en: 'Copy text', ja: 'テキストをコピー', ko: '텍스트 복사' },
  'sp.copied': { zh: '已复制', en: 'Copied', ja: 'コピーしました', ko: '복사됨' },
  'sp.loadFail': { zh: '故事加载失败', en: 'Failed to load story', ja: 'ストーリーの読み込みに失敗', ko: '스토리 로드 실패' },
  // ── 冷启动体验（§2.4：下载等待期玩法卡片 / 示例对话）──
  'cs.cardChatT': { zh: '拖卡即聊', en: 'Drop a card, chat', ja: 'カードを入れるだけ', ko: '카드를 놓고 대화' },
  'cs.cardChatD': { zh: '把角色卡 PNG 拖进页面，立刻开始对话', en: 'Drag a character card PNG onto the page to start chatting', ja: 'キャラカードのPNGをドラッグしてすぐ会話', ko: '캐릭터 카드 PNG를 끌어다 놓으면 바로 대화' },
  'cs.cardFreeT': { zh: '免 Key 试玩', en: 'No key needed', ja: 'キー不要で試玩', ko: '키 없이 즐기기' },
  'cs.cardFreeD': { zh: '内置故事无需 API Key，本地模型免费用', en: 'Built-in stories need no key; local models are free', ja: '内蔵ストーリーはAPIキー不要、ローカルモデルも無料', ko: '내장 스토리는 API 키가 필요 없고 로컬 모델도 무료' },
  'cs.cardPrivacyT': { zh: '隐私承诺', en: 'Privacy promise', ja: 'プライバシー保証', ko: '프라이버시 약속' },
  'cs.cardPrivacyD': { zh: '聊天只存本机，Key 不上传，无后端', en: 'Chats stay on-device · keys never uploaded · no server', ja: 'チャットは端末内のみ・キー送信なし・サーバーなし', ko: '대화는 기기에만 · 키 미전송 · 서버 없음' },
  'cs.exampleNote': { zh: '示例对话 · 和角色聊天是这种感觉', en: 'Example · what chatting here feels like', ja: '例 ・ キャラとの会話はこんな感じ', ko: '예시 대화 · 캐릭터와 이런 대화를 나눠요' },
  'cs.exampleUser': { zh: '今晚有什么推荐的酒？', en: 'Anything you would recommend tonight?', ja: '今夜のおすすめはありますか？', ko: '오늘 밤 추천할 만한 술이 있나요?' },
  'cs.exampleAI': { zh: '试试「猫尾薄荷」吧——喝过的人都说，能听见自己的心跳。第一次来？那这杯算我请。', en: 'Try the Catmint Breeze—regulars say you can hear your own heartbeat after it. First time here? This one is on me.', ja: '「キャットミント風」はいかが？常連は心臓の音が聞こえると言いますよ。初めてですか？では私のおごりです。', ko: '「캣민트 브리즈」를 드셔보세요—단골들은 심장 소리가 들린다고 하죠. 처음 오셨나요? 그럼 이 잔은 제가 살게요.' },
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
// 非中文界面下按映射表翻译，未命中则原样展示
const errorMap: [string, string, string, string][] = [
  ['不是有效的 PNG 文件', 'Not a valid PNG file', '有効なPNGファイルではありません', '유효한 PNG 파일이 아닙니다'],
  ['PNG 中没有角色卡数据（缺少 ccv3 / chara 区块）', 'No character card data in PNG (missing ccv3 / chara chunk)', 'PNGにキャラクターカードデータがありません（ccv3 / charaチャンク欠落）', 'PNG에 캐릭터 카드 데이터가 없습니다(ccv3 / chara 청크 없음)'],
  ['zTXt 区块使用了未知压缩方法', 'Unknown compression method in zTXt chunk', 'zTXtチャンクに不明な圧縮方式', 'zTXt 청크에 알 수 없는 압축 방식'],
  ['角色卡数据 base64 解码失败', 'Failed to decode card data (base64)', 'カードデータのbase64デコードに失敗', '카드 데이터 base64 디코딩 실패'],
  ['角色卡 JSON 解析失败', 'Failed to parse character card JSON', 'キャラクターカードJSONの解析に失敗', '캐릭터 카드 JSON 구문 분석 실패'],
  ['无法识别的角色卡数据结构', 'Unrecognized character card structure', '認識できないキャラクターカード構造', '인식할 수 없는 캐릭터 카드 구조'],
  ['角色卡数据解压失败', 'Failed to decompress card data', 'カードデータの解凍に失敗', '카드 데이터 압축 해제 실패'], // 前缀匹配（gzip/deflate）
]

export function localizeError(lang: Lang, message: string): string {
  if (lang === 'zh') return message
  const col = lang === 'ja' ? 2 : lang === 'ko' ? 3 : 1
  for (const row of errorMap) {
    if (message.startsWith(row[0])) return row[col]
  }
  return message
}
