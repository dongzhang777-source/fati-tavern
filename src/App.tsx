import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { useStore } from './store'
import { parseCharacterJson, parsePngCard, parseLorebookJson, detectImportKind, passesContentFilter, deriveBookRating, type TavernCard } from './lib/tavern'
import { PRESETS, fetchModels, testChat, WEBLLM_MODELS, TIER_DEFAULT_MODEL, EDIT_RECOMMENDED, type EndpointConfig } from './lib/api'
import { webllmSupported, loadWebLLMModel, loadedWebLLMModel, modelBlocked } from './lib/webllm'
import { t, brandName, docTitle, localizeError, type Lang } from './lib/i18n'
import { trackOnce } from './lib/analytics'
import { pickShotMessages, renderChatScreenshot, shareOrDownload, shotFilename } from './lib/screenshot'
import { createShareLink, ShareCardTooLargeError } from './lib/share'
import type { StoredCharacter } from './lib/db'
import { useP2PStore } from './store/slices/p2p'
import { loadRelayUrl, saveRelayUrl } from './store/slices/p2p'
import { useLoreStore } from './store/slices/lore'
import { P2PInvitePanel } from './components/p2p/P2PInvitePanel'
import { P2PJoinPanel } from './components/p2p/P2PJoinPanel'
import { P2PChatPanel } from './components/p2p/P2PChatPanel'
import { LorebookPanel } from './components/LorebookPanel'
import { StoryView } from './components/StoryView'
import { StoryPackReader } from './components/StoryPackReader'
import './App.css'

// ─── PWA 安装事件捕获（模块加载即注册）───
// Chrome/Edge/Android 会派发 beforeinstallprompt；iOS Safari 不会，另行图文引导
type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferredInstall: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstall = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event('tavern-install-ready'))
  })
}

// 键盘收缩高度计算：差值 >= 100px 视为键盘弹起并收缩 body，否则返回 null 避免 iOS standalone/Capacitor 底部漏黑条
export function computeVvHeight(vvHeight: number, innerHeight: number): number | null {
  return vvHeight >= innerHeight - 100 ? null : Math.round(vvHeight)
}

// 探测是否处于已安装/独立应用模式（PWA standalone、iOS standalone 或 Capacitor 原生壳）
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  const match = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  const nav = (navigator as unknown as { standalone?: boolean })?.standalone === true
  const cap = !!(window as unknown as { Capacitor?: unknown })?.Capacitor
  return match || nav || cap
}

export default function App() {
  const store = useStore()
  const { view, lang } = store
  const hasActiveChar = useStore((s) => s.characters.some((c) => c.id === s.activeCharId))

  useEffect(() => { store.init() }, [])
  // 中文=肥猫酒馆，其他语言=FATI Tavern
  useEffect(() => { document.title = docTitle(lang) }, [lang])

  // 移动端键盘适配，分平台两种模型：
  // - iOS：键盘悬浮不收缩布局视口，WebKit 会自动平移页面让聚焦输入框可见。
  //   body 恒定全高（--app-height 钉死实测像素，防 dvh 滞后），聚焦期间禁止夹回滚动
  //   （与 WebKit 平移打架会把输入条顶到屏幕顶端），失焦后统一复位。
  // - Android（viewport 带 interactive-widget=resizes-content）：布局视口原生收缩，
  //   --vv-height 兜底；滚动夹回逻辑同失焦时机。
  useEffect(() => {
    const vv = window.visualViewport
    const iOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isTextInputFocused = () => {
      const t = document.activeElement?.tagName
      return t === 'INPUT' || t === 'TEXTAREA'
    }
    const resetScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0)
      if (document.scrollingElement && document.scrollingElement.scrollTop !== 0) document.scrollingElement.scrollTop = 0
    }
    // iOS standalone/壳：真机实测键盘收起后 innerHeight/dvh 会卡在缩小值不恢复
    // （webview 满屏、html 底色铺满，仅视口数值撒谎），改用物理屏幕高度钉死。
    // 仅 standalone/壳可用——浏览器标签页有工具栏，screen.height 会超出可视区。
    // iPhone 仅竖屏（Info.plist），screen.height 恒等全屏高，无旋转失真。
    const fullScreenHeight = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true
      || !!(window as unknown as { Capacitor?: unknown })?.Capacitor
    // Capacitor 壳的 WKWebView 键盘走原生滚动视图平移（会把头部推出屏幕），
    // 不吃主屏幕 Web App 的原生视口收缩，故壳与安卓用 --vv-height 收缩模型；
    // iOS PWA/浏览器用悬浮键盘模型（body 恒定全高）
    const capShell = !!(window as unknown as { Capacitor?: unknown })?.Capacitor
    let focusAt = 0
    // Gboard 等第三方键盘在 iOS PWA 会把页面过量平移（实测约两倍键盘高，头部/角标全被推出屏），
    // 系统无 API 关闭该行为（VirtualKeyboard API Safari 不支持，fixed 元素也会被拖走）。
    // 对策：聚焦稳定后自测输入框应在位置（键盘正上方），偏差超死区一次性纠偏；
    // 苹果键盘偏差天然为零，此函数不动作
    const panCheck = () => {
      const el = document.activeElement
      if (!vv || !el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return
      if (Date.now() - focusAt < 400) return
      const rect = el.getBoundingClientRect()
      const desired = vv.height - rect.height - 12
      const delta = Math.round(rect.top - desired)
      if (Math.abs(delta) > 12) window.scrollBy(0, delta)
    }
    const sync = () => {
      const root = document.documentElement
      const focused = isTextInputFocused()
      if (iOS && !capShell) {
        root.style.removeProperty('--vv-height')
        root.style.setProperty('--app-height', `${fullScreenHeight ? window.screen.height : window.innerHeight}px`)
        // 聚焦期间让 WebKit 自己平移，不夹回；稳定后过量平移纠偏；失焦才整体复位
        if (!focused) resetScroll()
        else panCheck()
        return
      }
      const targetHeight = vv && focused ? computeVvHeight(vv.height, window.innerHeight) : null
      if (targetHeight === null) {
        root.style.removeProperty('--vv-height')
        root.style.setProperty('--app-height', `${window.innerHeight}px`)
      } else {
        root.style.setProperty('--vv-height', `${targetHeight}px`)
        root.style.removeProperty('--app-height')
      }
      // 壳里必须始终夹回：WKWebView 聚焦时会原生平移整个页面（头部被推出屏幕），
      // body 收缩到 vv.height 后输入框已在键盘上方，把平移撤掉才不双补偿；
      // 实测（5:00 壳轮）此路径聚焦期夹回是干净的
      resetScroll()
    }
    if (vv) {
      vv.addEventListener('resize', sync)
      vv.addEventListener('scroll', sync)
      sync()
    }
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', () => { if (!isTextInputFocused()) resetScroll() })
    const onFocusChange = () => {
      focusAt = Date.now()
      // 失焦后 iOS 派发事件不可靠，多级延时兜底（平滑收起动画各阶段+极端慢恢复）
      setTimeout(sync, 120)
      setTimeout(sync, 400)
      setTimeout(sync, 1000)
    }
    window.addEventListener('focusin', onFocusChange)
    window.addEventListener('focusout', onFocusChange)
    return () => {
      if (vv) {
        vv.removeEventListener('resize', sync)
        vv.removeEventListener('scroll', sync)
      }
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', resetScroll)
      window.removeEventListener('focusin', onFocusChange)
      window.removeEventListener('focusout', onFocusChange)
      document.documentElement.style.removeProperty('--vv-height')
    }
  }, [])

  // 首启年龄确认门：未确认前不展示任何内容
  if (store.ageGate === 'unset') return <AgeGate />

  // 聊天 / 剧情是沉浸式全屏页（自带返回），不显示底部 tab
  const inChat = view === 'chat' && hasActiveChar
  const inStory = view === 'story'
  const showTabBar = !inChat && !inStory

  return (
    <div className="app">
      <VpDebugHud />
      <OfflineBanner />
      {inStory ? <StoryView /> : inChat ? <ChatView /> : (
        <>
          {view === 'gallery' && <Gallery />}
          {view === 'chat' && <ChatTabEmpty />}
          {view === 'storypack' && <div className="tab-page"><StoryPackReader /></div>}
          {view === 'lore' && <div className="tab-page"><LorebookPanel /></div>}
          {view === 'settings' && <SettingsTab />}
        </>
      )}
      {showTabBar && <TabBar />}
      {showTabBar && <InstallBanner />}
    </div>
  )
}

// ─── 首启年龄确认门 ─────────────────────────────────────
// 未确认年龄前不进入应用；<18 岁强制开启并锁定安全模式
function AgeGate() {
  const lang = useStore((s) => s.lang)
  const confirmAge = useStore((s) => s.confirmAge)
  const [age, setAge] = useState('')
  const [err, setErr] = useState(false)
  function submit() {
    const n = parseInt(age, 10)
    if (Number.isNaN(n) || n < 1 || n > 120) { setErr(true); return }
    confirmAge(n)
  }
  return (
    <div className="age-gate">
      <div className="age-gate-card">
        <h2>{t(lang, 'age.title')}</h2>
        <p className="age-gate-desc">{t(lang, 'age.desc')}</p>
        <input
          className="age-gate-input"
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          value={age}
          placeholder={t(lang, 'age.placeholder')}
          onChange={(e) => { setAge(e.target.value); setErr(false) }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {err && <p className="age-gate-err">{t(lang, 'age.invalid')}</p>}
        <button className="age-gate-btn" onClick={submit}>{t(lang, 'age.confirm')}</button>
      </div>
    </div>
  )
}

// ─── 底部 Tab 导航 ───────────────────────────────────────
function TabBar() {
  const view = useStore((s) => s.view)
  const lang = useStore((s) => s.lang)
  const hasActiveChar = useStore((s) => s.characters.some((c) => c.id === s.activeCharId))
  const { backToGallery, showChatTab, showStoryPack, showLore, showSettings } = useStore.getState()

  // 顺序为镜面反转：设置 → 世界书 → 故事 → 聊天 → 角色（老张 2026-08-02 指定）
  const tabs: { key: string; icon: string; label: string; active: boolean; go: () => void }[] = [
    { key: 'settings', icon: '⚙️', label: t(lang, 'tab.settings'), active: view === 'settings', go: showSettings },
    { key: 'books', icon: '📚', label: t(lang, 'tab.books'), active: view === 'lore', go: showLore },
    { key: 'storypack', icon: '📖', label: t(lang, 'sp.tab'), active: view === 'storypack', go: showStoryPack },
    { key: 'chat', icon: '💬', label: t(lang, 'tab.chat'), active: view === 'chat' && hasActiveChar, go: showChatTab },
    { key: 'chars', icon: '🎭', label: t(lang, 'tab.chars'), active: view === 'gallery', go: backToGallery },
  ]

  return (
    <nav className="tabbar">
      {tabs.map((tab) => (
        <button key={tab.key} className={tab.active ? 'active' : ''} onClick={tab.go}>
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ─── PWA 安装引导横幅 ──────────────────────────────────
// 有 beforeinstallprompt（Chrome/Edge/Android）→ 一键安装；
// iOS Safari 无此事件 → 图文引导「分享 → 添加到主屏幕」。
// 已安装（standalone / Capacitor 壳）或用户关闭后本机不再提示
function InstallBanner() {
  const lang = useStore((s) => s.lang)
  const [ready, setReady] = useState(() => deferredInstall !== null)
  const [hidden, setHidden] = useState(() => localStorage.getItem('tavern-install-dismissed') === '1')

  useEffect(() => {
    const onReady = () => setReady(true)
    window.addEventListener('tavern-install-ready', onReady)
    return () => window.removeEventListener('tavern-install-ready', onReady)
  }, [])

  const standalone = isStandaloneApp()
  if (hidden || standalone) return null
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (!ready && !ios) return null

  function dismiss() {
    try { localStorage.setItem('tavern-install-dismissed', '1') } catch { /* ignore */ }
    setHidden(true)
  }

  async function install() {
    if (!deferredInstall) return
    try {
      await deferredInstall.prompt()
      await deferredInstall.userChoice
    } catch { /* ignore */ }
    deferredInstall = null
    setHidden(true)
  }

  return (
    <div className="install-banner">
      <span className="install-text">{ios && !ready ? t(lang, 'install.iosHint') : t(lang, 'install.banner')}</span>
      {ready && <button className="install-go" onClick={() => void install()}>{t(lang, 'install.action')}</button>}
      <button className="install-dismiss" onClick={dismiss}>{ready ? t(lang, 'install.dismiss') : '✕'}</button>
    </div>
  )
}

// ─── 离线指示条 ───────────────────────────────────────
// 断网时非阻断提示；SW 已缓存应用壳与历史数据，仅发送不可用
// ─── 临时诊断角标：真机键盘收起后视口数值抓取（定因后删除）───
function VpDebugHud() {
  const [vals, setVals] = useState({ ih: 0, vv: 0, dvh: 0, scr: 0, app: '', vvh: '' })
  useEffect(() => {
    const vv = window.visualViewport
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;height:100dvh;visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
    const read = () => {
      setVals({
        ih: Math.round(window.innerHeight),
        vv: vv ? Math.round(vv.height) : -1,
        dvh: Math.round(probe.getBoundingClientRect().height),
        scr: window.screen.height,
        app: document.documentElement.style.getPropertyValue('--app-height').trim(),
        vvh: document.documentElement.style.getPropertyValue('--vv-height').trim(),
      })
    }
    let raf = 0
    const onEv = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(read) }
    vv?.addEventListener('resize', onEv)
    vv?.addEventListener('scroll', onEv)
    window.addEventListener('resize', onEv)
    const t = setInterval(read, 500)
    read()
    return () => {
      vv?.removeEventListener('resize', onEv)
      vv?.removeEventListener('scroll', onEv)
      window.removeEventListener('resize', onEv)
      clearInterval(t)
      cancelAnimationFrame(raf)
      probe.remove()
    }
  }, [])
  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 2px)', right: 2, zIndex: 9999, pointerEvents: 'none', font: '10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', color: '#4cff4c', background: 'rgba(0,0,0,.75)', padding: '4px 6px', borderRadius: 6, whiteSpace: 'pre', textAlign: 'left' }}>
      {`inner ${vals.ih}\nvv    ${vals.vv}\ndvh   ${vals.dvh}\nscr   ${vals.scr}\napp ${vals.app || '-'} vvh ${vals.vvh || '-'}`}
    </div>
  )
}

function OfflineBanner() {
  const lang = useStore((s) => s.lang)
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return <div className="offline-bar">📴 {t(lang, 'offline.bar')}</div>
}

// 「聊天」tab：还没有可恢复的聊天时的占位页
function ChatTabEmpty() {
  const lang = useStore((s) => s.lang)
  const backToGallery = useStore((s) => s.backToGallery)
  return (
    <div className="tab-page chat-tab-empty">
      <p>{t(lang, 'chat.pickFirst')}</p>
      <button className="btn-import" onClick={backToGallery}>{t(lang, 'tab.chars')}</button>
    </div>
  )
}

// 「设置」tab：P2P 联机面板 + 模型/语言/安全设置
function SettingsTab() {
  const lang = useStore((s) => s.lang)
  const characters = useStore((s) => s.characters)
  const activeCharId = useStore((s) => s.activeCharId)
  const openCharacter = useStore((s) => s.openCharacter)
  const p2pState = useP2PStore((s) => s.p2pState)
  const p2pMembers = useP2PStore((s) => s.p2pMembers)
  const disconnectP2P = useP2PStore((s) => s.disconnectP2P)
  const [showP2P, setShowP2P] = useState(false)
  const [p2pMode, setP2PMode] = useState<'invite' | 'join'>('join')

  return (
    <div className="tab-page settings-tab">
      <button className="btn-import settings-p2p-toggle" onClick={() => setShowP2P((v) => !v)}>
        👥 {t(lang, 'p2pTitle')}
      </button>
      {showP2P && (
        <div className="p2p-panel">
          <h3>{t(lang, 'p2pTitle')}</h3>
          {p2pState === 'idle' || p2pState === 'disconnected' ? (
            <>
              <div className="chat-tabs">
                <button className={`chat-tab ${p2pMode === 'join' ? 'active' : ''}`} onClick={() => setP2PMode('join')}>{t(lang, 'p2pJoinRoom')}</button>
                <button className={`chat-tab ${p2pMode === 'invite' ? 'active' : ''}`} onClick={() => setP2PMode('invite')}>{t(lang, 'p2pCreateInvite')}</button>
              </div>
              {p2pMode === 'join' ? <P2PJoinPanel /> : <P2PInvitePanel />}
            </>
          ) : (
            <div className="p2p-panel">
              <p>{t(lang, 'p2pJoined')} · {t(lang, 'p2pMembers')}: {p2pMembers.length + 1}</p>
              <button className="btn-p2p" disabled={characters.length === 0} onClick={() => {
                useP2PStore.getState().setP2PChatTab('group')
                const id = activeCharId || characters[0]?.id
                if (id) { openCharacter(id); setShowP2P(false) }
              }}>{t(lang, 'p2pEnterChat')}</button>
              <button className="btn-p2p" onClick={disconnectP2P}>{t(lang, 'p2pDisconnect')}</button>
            </div>
          )}
        </div>
      )}
      <SettingsPanel />
    </div>
  )
}

// ─── 品牌 Logo（内联 SVG）─────────────────────────────
function BrandLogo() {
  return (
    <svg className="brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320">
      <defs>
        <radialGradient id="bodyGrad" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FFA050" />
          <stop offset="60%" stopColor="#FF8C42" />
          <stop offset="100%" stopColor="#E07020" />
        </radialGradient>
        <radialGradient id="bellyGrad" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#FFE8CC" />
          <stop offset="100%" stopColor="#FFD699" />
        </radialGradient>
        <radialGradient id="headGrad" cx="45%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FFB060" />
          <stop offset="100%" stopColor="#FF8C42" />
        </radialGradient>
        <radialGradient id="earInner" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD699" />
          <stop offset="100%" stopColor="#FFB060" />
        </radialGradient>
        <filter id="softShadow">
          <feOffset dx="0" dy="4" />
          <feGaussianBlur stdDeviation="4" />
          <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
        </filter>
      </defs>
      <circle cx="200" cy="140" r="120" fill="none" stroke="#3d3028" strokeWidth="1.5" opacity="0.5" />
      <ellipse cx="200" cy="195" rx="85" ry="70" fill="url(#bodyGrad)" filter="url(#softShadow)" />
      <ellipse cx="200" cy="205" rx="55" ry="45" fill="url(#bellyGrad)" />
      <path d="M 280,175 Q 320,140 310,100 Q 305,80 290,85 Q 275,90 280,105 Q 285,120 275,140" fill="none" stroke="#E07020" strokeWidth="6" strokeLinecap="round" />
      <circle cx="200" cy="95" r="50" fill="url(#headGrad)" />
      <path d="M 165,70 L 150,30 L 180,55 Z" fill="#FF8C42" />
      <path d="M 165,70 L 153,38 L 176,58 Z" fill="url(#earInner)" />
      <path d="M 235,70 L 250,30 L 220,55 Z" fill="#FF8C42" />
      <path d="M 235,70 L 247,38 L 224,58 Z" fill="url(#earInner)" />
      <ellipse cx="183" cy="88" rx="8" ry="7" fill="#3D2B1F" />
      <circle cx="185" cy="86" r="2.5" fill="#FFE8CC" />
      <ellipse cx="217" cy="88" rx="8" ry="7" fill="#3D2B1F" />
      <circle cx="219" cy="86" r="2.5" fill="#FFE8CC" />
      <path d="M 200,100 L 196,105 L 204,105 Z" fill="#FF6B35" />
      <path d="M 192,110 Q 200,118 208,110" fill="none" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" />
      <line x1="165" y1="98" x2="130" y2="93" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="163" y1="106" x2="128" y2="106" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="165" y1="114" x2="130" y2="117" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="235" y1="98" x2="270" y2="93" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="237" y1="106" x2="272" y2="106" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="235" y1="114" x2="270" y2="117" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M 200,45 L 196,25 L 204,28 L 202,45" fill="#FF8C42" stroke="#E07020" strokeWidth="1" />
    </svg>
  )
}

// ─── 角色库画廊 ───────────────────────────────────────────
interface ImportResult {
  okCards: number
  okBooks: number
  customToast?: string
  fails: { name: string; reason: string }[]
  shareLink?: string
}

function Gallery() {
  const { characters, endpoint, importCard, removeCharacter, updateCharacter, openCharacter, lang, safeMode, ageGate } = useStore()
  const importLorebook = useLoreStore((s) => s.importLorebook)
  const [dragOver, setDragOver] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [editingChar, setEditingChar] = useState<StoredCharacter | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 触屏长按出操作菜单：500ms 定时，移动 >10px 取消
  // 真机坑：安卓抬手后必发一个合成 click（落点被刚挂载的遮罩盖住会瞬间关菜单）；iOS 则不一定发。
  // 用布尔标志会在 iOS 上泄漏（没 click 来清标志 → 下次真实点击被误吞）。
  // 改用时间戳窗口：抬手后 400ms 内的 click 视为补发忽略，超时自愈，两端都不会误吞用户的下一次真实操作。
  const [menuChar, setMenuChar] = useState<StoredCharacter | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStart = useRef({ x: 0, y: 0 })
  const pressFired = useRef(false)
  const pressEndAt = useRef(0)
  const isSyntheticClick = () => Date.now() - pressEndAt.current < 400

  function cardPressStart(c: StoredCharacter, e: React.TouchEvent) {
    pressFired.current = false
    pressStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    pressTimer.current = setTimeout(() => {
      pressFired.current = true
      navigator.vibrate?.(10)
      setMenuChar(c)
    }, 500)
  }
  function cardPressMove(e: React.TouchEvent) {
    if (!pressTimer.current) return
    const dx = e.touches[0].clientX - pressStart.current.x
    const dy = e.touches[0].clientY - pressStart.current.y
    if (dx * dx + dy * dy > 100) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  function cardPressEnd() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    // 已触发的长按：标记抬手时刻，短窗口内的 click 当作补发吞掉
    if (pressFired.current) pressEndAt.current = Date.now()
  }
  function cardOpen(c: StoredCharacter) {
    if (isSyntheticClick()) return
    openCharacter(c.id)
  }

  // 区分内置角色和用户导入角色
  const userChars = characters.filter((c) => !c.builtin)
  const showCatalog = userChars.length === 0 // 没导入过卡 → 显示内置目录
  // 安全模式：隐藏 adult 卡（内置卡均为 all，不受影响）；H-3：minor 下 unknown 也隐藏
  const isMinor = ageGate === 'minor'
  const passesSafeMode = (c: StoredCharacter) => passesContentFilter(c.card.contentRating, safeMode, isMinor)
  // 被安全模式隐藏的卡数（给用户可见的反馈）
  const hiddenCount = safeMode ? characters.filter((c) => !passesSafeMode(c)).length : 0
  const localAiReady = endpoint.baseUrl === 'webllm' && webllmSupported()

  // 每个文件独立解析，成功/失败都必须给用户可见反馈
  // JSON 先用 detectImportKind 分流：角色卡 → 角色库，世界书 → 世界书库
  async function handleFiles(files: FileList | File[]) {
    let okCards = 0
    let okBooks = 0
    const fails: { name: string; reason: string }[] = []
    for (const file of Array.from(files)) {
      try {
        // M-5：导入文件大小上限，防 GB 级文件直接吃内存（PNG≤50MB / JSON≤20MB）
        const isPng = file.name.toLowerCase().endsWith('.png')
        const isJson = file.name.toLowerCase().endsWith('.json')
        const sizeLimit = isPng ? 50 * 1024 * 1024 : isJson ? 20 * 1024 * 1024 : 0
        if (sizeLimit > 0 && file.size > sizeLimit) {
          throw new Error(t(lang, 'import.tooLarge'))
        }
        if (isPng) {
          const buf = await file.arrayBuffer()
          const card = await parsePngCard(buf)
          await importCard(card, file)
          okCards++
        } else if (isJson) {
          const text = await file.text()
          let json: any
          try {
            json = JSON.parse(text)
          } catch {
            throw new Error(t(lang, 'import.jsonFail'))
          }
          const kind = detectImportKind(file.name, json)
          if (kind === 'lorebook') {
            const book = parseLorebookJson(json)
            if (!book) throw new Error(t(lang, 'import.unknownFormat'))
            await importLorebook(book, file.name)
            okBooks++
          } else {
            const card = parseCharacterJson(json)
            if (!card) throw new Error(t(lang, 'import.unknownFormat'))
            await importCard(card, file)
            okCards++
          }
        } else {
          throw new Error(t(lang, 'import.unsupported'))
        }
      } catch (e: any) {
        fails.push({ name: file.name, reason: localizeError(lang, e?.message || t(lang, 'import.fail')) })
      }
    }
    setImportResult({ okCards, okBooks, fails })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    // 有失败时多停留一会儿让用户看清原因
    toastTimer.current = setTimeout(() => setImportResult(null), fails.length > 0 ? 8000 : 3000)
  }

  async function handleShare(character: StoredCharacter) {
    setSharingId(character.id)
    try {
      const link = await createShareLink(character.card)
      try {
        await navigator.clipboard.writeText(link)
      } catch { /* UI 仍展示链接，用户可手动复制 */ }
      setImportResult({ okCards: 0, okBooks: 0, fails: [], shareLink: link })
      trackOnce('share_create')
    } catch (e) {
      const reason = e instanceof ShareCardTooLargeError
        ? e.message
        : '链接分享不可用，请导出文件后分享'
      setImportResult({ okCards: 0, okBooks: 0, fails: [{ name: character.card.name, reason }] })
    } finally {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setImportResult(null), 12000)
      setSharingId(null)
    }
  }

  return (
    <div
      className="gallery"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
    >
      {dragOver && <div className="drop-overlay">{t(lang, 'gallery.dropOverlay')}</div>}

      <header className="gallery-header">
        <h1><BrandLogo />{brandName(lang)}</h1>
        <div className="gallery-actions">
          <button className="btn-import" onClick={() => fileRef.current?.click()}>{t(lang, 'gallery.import')}</button>
        </div>
      </header>

      <input
        ref={fileRef} type="file" accept=".png,.json" multiple hidden
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
      />

      <div className="gallery-content">
        {hiddenCount > 0 && (
          <p className="safe-hidden-note">{t(lang, 'gallery.safeHidden', { n: hiddenCount })}</p>
        )}
        {showCatalog ? (
        <div className="catalog-view">
          <div className="catalog-hero">
            <h2>{t(lang, 'landing.title2')}</h2>
            <p className="catalog-sub">{t(lang, 'landing.subtitle2')}</p>
            <p className={localAiReady ? 'catalog-model-ready' : 'catalog-model-warning'}>
              {localAiReady ? t(lang, 'catalog.modelReady', { model: endpoint.model }) : t(lang, 'catalog.modelUnavailable')}
            </p>
          </div>

          <div className="card-grid">
            {characters.filter((c) => c.builtin && passesSafeMode(c)).map((c) => (
            <div key={c.id} className="char-card"
              onClick={() => cardOpen(c)}
              onTouchStart={(e) => cardPressStart(c, e)}
              onTouchMove={cardPressMove}
              onTouchEnd={cardPressEnd}
              onTouchCancel={cardPressEnd}
            >
                <div className="card-avatar">
                  <span className="avatar-placeholder">{c.card.name[0]}</span>
                </div>
                <div className="card-info">
                  <strong className="card-name">
                    {c.card.name}
                    <span className="badge-free">{t(lang, 'catalog.free')}</span>
                  </strong>
                  <span className="card-desc">{c.card.description?.slice(0, 60) || c.card.personality?.slice(0, 60) || t(lang, 'gallery.noDesc')}</span>
                  {c.card.tags?.length > 0 && (
                    <span className="card-tags">{c.card.tags.slice(0, 3).join(' · ')}</span>
                  )}
                </div>
                <button className="btn-edit" onClick={(e) => { e.stopPropagation(); setEditingChar(c) }}>{t(lang, 'gallery.copyEdit')}</button>
              </div>
            ))}
          </div>

          <div className="catalog-import-hint">
            <button className="btn-import-secondary" onClick={() => fileRef.current?.click()}>
              {t(lang, 'landing.browseCatalog')}
            </button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {characters.filter(passesSafeMode).map((c) => (
            <div key={c.id} className="char-card"
              onClick={() => cardOpen(c)}
              onTouchStart={(e) => cardPressStart(c, e)}
              onTouchMove={cardPressMove}
              onTouchEnd={cardPressEnd}
              onTouchCancel={cardPressEnd}
            >
              <div className="card-avatar">
                {c.avatarUrl
                  ? <img src={c.avatarUrl} alt={c.card.name} />
                  : <span className="avatar-placeholder">{c.card.name[0]}</span>
                }
              </div>
              <div className="card-info">
                <strong className="card-name">
                  {c.card.name}
                  {c.card.contentRating === 'adult' && <span className="badge-18">18+</span>}
                  {c.builtin && <span className="badge-free">{t(lang, 'catalog.free')}</span>}
                </strong>
                <span className="card-desc">{c.card.description?.slice(0, 60) || c.card.personality?.slice(0, 60) || t(lang, 'gallery.noDesc')}</span>
                {c.card.tags?.length > 0 && (
                  <span className="card-tags">{c.card.tags.slice(0, 3).join(' · ')}</span>
                )}
              </div>
              <button className="btn-edit" onClick={(e) => { e.stopPropagation(); setEditingChar(c) }}>{c.builtin ? t(lang, 'gallery.copyEdit') : t(lang, 'gallery.edit')}</button>
              {!c.builtin && (
                <button
                  className="btn-share"
                  disabled={sharingId === c.id}
                  onClick={(e) => { e.stopPropagation(); void handleShare(c) }}
                >
                  {sharingId === c.id ? t(lang, 'gallery.sharing') : t(lang, 'gallery.share')}
                </button>
              )}
              <button className="btn-del" onClick={(e) => { e.stopPropagation(); removeCharacter(c.id) }} title={t(lang, 'gallery.delete')}>×</button>
            </div>
          ))}
        </div>
      )}
      </div>



      {importResult && (
        <div className={`import-toast ${importResult.fails.length > 0 ? 'has-fail' : ''}`} onClick={() => setImportResult(null)}>
          {importResult.okCards > 0 && <p>{t(lang, 'toast.imported', { n: importResult.okCards })}</p>}
          {importResult.okBooks > 0 && <p>{t(lang, 'toast.importedBooks', { n: importResult.okBooks })}</p>}
          {importResult.customToast && <p>{importResult.customToast}</p>}
          {importResult.shareLink && (
            <p>
              {t(lang, 'share.copied')}
              <input className="share-link" readOnly value={importResult.shareLink} onFocus={event => event.currentTarget.select()} />
            </p>
          )}
          {importResult.fails.map((f) => (
            <p key={f.name} className="fail-line">✗ {f.name}：{f.reason}</p>
          ))}
        </div>
      )}

      {editingChar && (
        <CharacterEditor
          character={editingChar}
          onSave={async (card) => {
            const isBuiltin = !!editingChar.builtin
            await updateCharacter(editingChar.id, card)
            setEditingChar(null)
            if (isBuiltin) {
              setImportResult({
                okCards: 0,
                okBooks: 0,
                customToast: t(lang, 'toast.builtinCopied', { name: card.name }),
                fails: [],
              })
              if (toastTimer.current) clearTimeout(toastTimer.current)
              toastTimer.current = setTimeout(() => setImportResult(null), 4000)
            }
          }}
          onClose={() => setEditingChar(null)}
        />
      )}

      {/* 触屏长按操作菜单（底部弹层） */}
      {menuChar && (
        <>
          <div className="card-menu-backdrop" onClick={() => { if (isSyntheticClick()) return; setMenuChar(null) }} />
          <div className="card-menu" role="menu">
            <div className="card-menu-title">{menuChar.card.name}</div>
            <button onClick={() => { openCharacter(menuChar.id); setMenuChar(null) }}>{t(lang, 'gallery.menuChat')}</button>
            <button onClick={() => { setEditingChar(menuChar); setMenuChar(null) }}>
              {menuChar.builtin ? t(lang, 'gallery.copyEdit') : t(lang, 'gallery.edit')}
            </button>
            {!menuChar.builtin && (
              <button onClick={() => { void handleShare(menuChar); setMenuChar(null) }}>{t(lang, 'gallery.share')}</button>
            )}
            {!menuChar.builtin && (
              <button className="danger" onClick={() => { removeCharacter(menuChar.id); setMenuChar(null) }}>{t(lang, 'gallery.delete')}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── 角色卡编辑器弹窗 ─────────────────────────────────────
function CharacterEditor({ character, onSave, onClose }: {
  character: StoredCharacter
  onSave: (card: TavernCard) => void
  onClose: () => void
}) {
  const { lang } = useStore()
  const [form, setForm] = useState<TavernCard>({ ...character.card })
  const [tagsInput, setTagsInput] = useState(character.card.tags?.join(', ') || '')

  function updateField<K extends keyof TavernCard>(key: K, value: TavernCard[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSave() {
    // 解析标签
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const updated = { ...form, tags }
    onSave(updated)
  }

  return (
    <div className="editor-overlay" onClick={onClose}>
      <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-header">
          <h3>{character.builtin ? t(lang, 'editor.titleCopy') : t(lang, 'editor.title')}</h3>
        </div>
        <div className="editor-body">
          {character.builtin && (
            <p className="editor-builtin-note">{t(lang, 'editor.builtinNote')}</p>
          )}
          <div className="editor-field">
            <label>{t(lang, 'editor.name')}</label>
            <input value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.description')}</label>
            <textarea value={form.description || ''} onChange={(e) => updateField('description', e.target.value)} rows={3} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.personality')}</label>
            <textarea value={form.personality || ''} onChange={(e) => updateField('personality', e.target.value)} rows={2} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.scenario')}</label>
            <textarea value={form.scenario || ''} onChange={(e) => updateField('scenario', e.target.value)} rows={2} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.firstMes')}</label>
            <textarea value={form.first_mes || ''} onChange={(e) => updateField('first_mes', e.target.value)} rows={4} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.mesExample')}</label>
            <textarea value={form.mes_example || ''} onChange={(e) => updateField('mes_example', e.target.value)} rows={3} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.systemPrompt')}</label>
            <textarea value={form.system_prompt || ''} onChange={(e) => updateField('system_prompt', e.target.value)} rows={3} />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.tags')}</label>
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="fantasy, adventure, magic" />
          </div>
          <div className="editor-field">
            <label>{t(lang, 'editor.contentRating')}</label>
            <select value={form.contentRating || 'unknown'} onChange={(e) => updateField('contentRating', e.target.value as any)}>
              <option value="unknown">Unknown</option>
              <option value="safe">Safe</option>
              <option value="suggestive">Suggestive</option>
              <option value="adult">Adult (18+)</option>
            </select>
          </div>
        </div>
        <div className="editor-footer">
          <button className="btn-editor-cancel" onClick={onClose}>{t(lang, 'editor.cancel')}</button>
          <button className="btn-editor-save" onClick={handleSave}>{character.builtin ? t(lang, 'editor.saveCopy') : t(lang, 'editor.save')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── 聊天视图 ───────────────────────────────────────────
// 消息窗口化：长对话只渲染最近 80 条，更早的按需加载（移动端 DOM/内存预算）
const MSG_WINDOW = 80

function ChatView() {
  const {
    characters, activeCharId, conversations, activeConvId,
    streaming, error, sendMessage, stopStreaming, clearChat,
    newConversation, selectConversation, deleteConversation, backToGallery,
    lang, safetyNotice, dismissSafetyNotice, webllmProgress,
    impSuggestions, impLoading, impRefining, impExpansion,
    fetchImpersonate, refineImpersonate, setImpExpansion, clearImpersonate,
    bindLorebookToCharacter, safeMode, ageGate,
  } = useStore()
  const lorebooks = useLoreStore(s => s.lorebooks)
  const activeLorebookId = useLoreStore(s => s.activeLorebookId)

  const [input, setInput] = useState('')
  const [showConvList, setShowConvList] = useState(false)
  // 左滑删除：当前展开的行（同时只允许一行）
  const [openConvSwipe, setOpenConvSwipe] = useState<string | null>(null)
  const [impOpen, setImpOpen] = useState(false)
  const [showLorePicker, setShowLorePicker] = useState(false)
  const [shotBusy, setShotBusy] = useState(false)
  const [shotNotice, setShotNotice] = useState<string | null>(null)
  const shotTimer = useRef<number | null>(null)
  const p2pTab = useP2PStore(s => s.p2pChatTab)
  const setP2PChatTab = useP2PStore(s => s.setP2PChatTab)
  const p2pActive = useP2PStore(s => s.p2pState !== 'idle')
  const p2pSafetyNotice = useP2PStore(s => s.p2pSafetyNotice)
  const dismissP2PSafetyNotice = useP2PStore(s => s.dismissP2PSafetyNotice)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messagesBoxRef = useRef<HTMLDivElement>(null)
  // 点击瞬间的滚动快照：浏览器在 DOM 前插时会把 scrollTop 归零，只能在点击时记录
  const scrollSnapRef = useRef<{ top: number; height: number } | null>(null)
  // 长对话只渲染最近 MSG_WINDOW 条，顶部按需加载更早（移动端 DOM 预算）
  const [visibleCount, setVisibleCount] = useState(MSG_WINDOW)

  // BYOK 隐私提示：非固定、可关闭，关闭后本机不再显示
  const [byokNoteDismissed, setByokNoteDismissed] = useState(() => localStorage.getItem('tavern-byok-note-dismissed') === '1')
  function dismissByokNote() {
    localStorage.setItem('tavern-byok-note-dismissed', '1')
    setByokNoteDismissed(true)
  }

  const char = characters.find((c) => c.id === activeCharId)
  const conv = conversations.find((c) => c.id === activeConvId)
  const messages = conv?.messages ?? []

  // 窗口化：只显示最近 visibleCount 条，切换会话时重置
  const hiddenCount = Math.max(0, messages.length - visibleCount)
  const visibleMsgs = messages.slice(hiddenCount)
  useEffect(() => { setVisibleCount(MSG_WINDOW) }, [activeConvId])

  function loadEarlier() {
    const el = messagesBoxRef.current
    if (el) scrollSnapRef.current = { top: el.scrollTop, height: el.scrollHeight }
    setVisibleCount((c) => c + MSG_WINDOW)
  }
  // 顶部插入更早消息后用绝对值恢复滚动位置（相对补偿不可靠，见 scrollSnapRef 注释）
  useLayoutEffect(() => {
    const el = messagesBoxRef.current
    const snap = scrollSnapRef.current
    if (snap && el) {
      el.scrollTop = snap.top + (el.scrollHeight - snap.height)
      scrollSnapRef.current = null
    }
  }, [visibleCount])

  // 当前生效的世界书（与 sendMessage 注入优先级一致：角色绑定 > 卡自带 > 全局激活）
  // safeMode：adult 世界书视为不生效（与注入端一致）
  const effectiveBook = char
    ? [
        char.boundLorebookId ? lorebooks.find((l) => l.id === char.boundLorebookId)?.book : undefined,
        char.card.character_book,
        activeLorebookId ? lorebooks.find((l) => l.id === activeLorebookId)?.book : undefined,
      ].find((b): b is NonNullable<typeof b> => !!b && passesContentFilter(deriveBookRating(b), safeMode, ageGate === 'minor'))
    : undefined

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  // 键盘弹起/收起改变可见区域——保持最新消息可见
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  // 卸载时清掉截图提示的悬挂定时器
  useEffect(() => {
    return () => {
      if (shotTimer.current) clearTimeout(shotTimer.current)
    }
  }, [])

  function handleSend() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    sendMessage(text)
  }

  // 嘴替入口：开 = 立即生成一批建议（仅此时调用模型）；关 = 中断并清空
  function toggleImpersonate() {
    if (impOpen) {
      setImpOpen(false)
      clearImpersonate()
    } else {
      setImpOpen(true)
      fetchImpersonate()
    }
  }

  // 点候选卡 = 只填入输入框（覆盖草稿），绝不自动发送
  function pickSuggestion(text: string) {
    setInput(text)
    trackOnce('impersonate_used') // 漏斗对照：使用者 vs 非使用者的 second_round 转化
  }

  async function handleRefine() {
    const draft = input.trim()
    if (!draft || impRefining) return
    const refined = await refineImpersonate(draft)
    if (refined) setInput(refined)
  }

  function showShotNotice(text: string) {
    setShotNotice(text)
    if (shotTimer.current) clearTimeout(shotTimer.current)
    shotTimer.current = window.setTimeout(() => setShotNotice(null), 3000)
  }

  // 截图分享：端侧 Canvas 手绘，聊天内容不出设备（T-A TA-1）
  async function handleScreenshot() {
    if (shotBusy || !char) return
    const shotMessages = pickShotMessages(messages)
    if (shotMessages.length === 0) return
    setShotBusy(true)
    try {
      const blob = await renderChatScreenshot({
        messages: shotMessages,
        characterName: char.card.name,
        avatarDataUrl: char.avatarUrl,
        brand: brandName(lang),
        tagline: t(lang, 'shot.tagline'),
      })
      const outcome = await shareOrDownload(blob, shotFilename(char.card.name))
      if (outcome !== 'cancelled') {
        trackOnce('share_screenshot')
        showShotNotice(t(lang, 'chat.shotOk'))
      }
    } catch {
      showShotNotice(t(lang, 'chat.shotFail'))
    } finally {
      setShotBusy(false)
    }
  }

  if (!char) return null

  return (
    <div className="chat-layout">
      {/* 会话侧边栏 */}
      {showConvList && (
        <>
          <div className="conv-backdrop" onClick={() => setShowConvList(false)} />
          <aside className="conv-sidebar">
            <div className="conv-header">
              <h3>{t(lang, 'chat.convHeader')}</h3>
              <button onClick={() => newConversation()}>{t(lang, 'chat.newConv')}</button>
            </div>
            <ul className="conv-list">
              {conversations.map((c) => (
                <ConvItem key={c.id} conv={c} active={c.id === activeConvId}
                  openSwipe={openConvSwipe === c.id}
                  onSwipeOpen={(open) => setOpenConvSwipe(open ? c.id : null)}
                  onSelect={() => {
                    selectConversation(c.id)
                    if (window.matchMedia('(max-width: 640px)').matches) setShowConvList(false)
                  }}
                  onDelete={() => deleteConversation(c.id)}
                />
              ))}
            </ul>
          </aside>
        </>
      )}

      {/* 主聊天区 */}
      <main className="chat-main">
        <header className="chat-header">
          <button className="btn-back" onClick={backToGallery}>{t(lang, 'chat.back')}</button>
          <div className="chat-title">
            {char.avatarUrl && <img className="header-avatar" src={char.avatarUrl} alt="" />}
            <div className="chat-title-text">
              <strong>{char.card.name}</strong>
              {/* AI 身份披露——州级陪聊法规底线要求，常驻不可关闭 */}
              <span className="ai-disclosure">{t(lang, 'chat.aiDisclosure')}</span>
            </div>
          </div>
          <div className="chat-actions">
            {lorebooks.length > 0 && (
              <button
                className={`chat-lore-btn ${effectiveBook ? 'has-book' : ''}`}
                onClick={() => setShowLorePicker(!showLorePicker)}
                title={t(lang, 'chat.loreTitle')}
              >
                📖{effectiveBook ? '' : '＋'}
              </button>
            )}
            <button
              onClick={handleScreenshot}
              disabled={shotBusy || messages.length === 0}
              title={t(lang, shotBusy ? 'chat.shotBusy' : 'chat.screenshot')}
            >
              {shotBusy ? '…' : '📸'}
            </button>
            <button onClick={() => setShowConvList(!showConvList)} title={t(lang, 'chat.convList')}>☰</button>
            <button onClick={clearChat} title={t(lang, 'chat.clear')}>🗑</button>
          </div>
          {showLorePicker && char && (
            <div className="chat-lore-picker">
              <p className="chat-lore-picker-label">{t(lang, 'chat.lorePick')}</p>
              <p className="chat-lore-picker-current">
                {effectiveBook
                  ? t(lang, 'chat.loreCurrent', { name: effectiveBook.name || t(lang, 'lore.untitled') })
                  : t(lang, 'chat.loreNone')}
              </p>
              {lorebooks.filter((lb) => passesContentFilter(deriveBookRating(lb.book), safeMode, ageGate === 'minor')).map((lb) => (
                <button
                  key={lb.id}
                  className={`chat-lore-option ${char.boundLorebookId === lb.id ? 'bound' : ''}`}
                  onClick={() => {
                    const bind = char.boundLorebookId === lb.id ? null : lb.id
                    void bindLorebookToCharacter(char.id, bind)
                    setShowLorePicker(false)
                  }}
                >
                  {lb.book.name || lb.source || t(lang, 'lore.untitled')}
                  {char.boundLorebookId === lb.id && <span className="lore-badge-active">{t(lang, 'lore.active')}</span>}
                </button>
              ))}
            </div>
          )}
          {p2pActive && (
            <div className="chat-tabs">
              <button className={`chat-tab ${p2pTab === 'solo' ? 'active' : ''}`} onClick={() => setP2PChatTab('solo')}>{t(lang, 'p2pTabSolo')}</button>
              <button className={`chat-tab ${p2pTab === 'group' ? 'active' : ''}`} onClick={() => setP2PChatTab('group')}>{t(lang, 'p2pTabGroup')}</button>
            </div>
          )}
        </header>

        {/* 自伤关键词命中后的危机资源提示（非阻断、可关闭，单聊/群聊均可见） */}
        {(safetyNotice || p2pSafetyNotice) && (
          <div className="crisis-bar">
            <span>💛 {t(lang, 'chat.crisis')}</span>
            <button onClick={() => { dismissSafetyNotice(); dismissP2PSafetyNotice() }}>{t(lang, 'chat.crisisDismiss')}</button>
          </div>
        )}

        {/* BYOK 隐私提示：不固定、可关闭 */}
        {!byokNoteDismissed && (
          <div className="byok-note">
            <span>🔒 {t(lang, 'chat.byokNote')}</span>
            <button onClick={dismissByokNote}>✕</button>
          </div>
        )}

        {p2pActive && p2pTab === 'group' ? (
          <P2PChatPanel />
        ) : (
        <>
        <div className="messages" ref={messagesBoxRef}>
          {messages.length === 0 && !streaming && (
            <div className="chat-example">
              <span className="chat-example-note">💬 {t(lang, 'cs.exampleNote')}</span>
              <div className="msg user"><div className="msg-content">{t(lang, 'cs.exampleUser')}</div></div>
              <div className="msg assistant"><div className="msg-content">{t(lang, 'cs.exampleAI')}</div></div>
            </div>
          )}
          {hiddenCount > 0 && (
            <button className="load-earlier" onClick={loadEarlier}>↑ {t(lang, 'chat.loadEarlier')}（{hiddenCount}）</button>
          )}
          {visibleMsgs.map((m, i) => {
            const idx = hiddenCount + i
            return (
              <div key={idx} className={`msg ${m.role}`}>
                <div className="msg-content">{m.content || (streaming && idx === messages.length - 1 ? '…' : '')}</div>
                {m.ts && <span className="msg-time">{new Date(m.ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        {/* WebLLM 模型下载/编译进度 + 等待期玩法介绍（§2.4，静态卡片不放任何推广） */}
        {webllmProgress !== null && (
          <div>
            <div className="webllm-progress">⏳ {t(lang, 'webllm.loading')}{webllmProgress}</div>
            <div className="cs-cards">
              <div className="cs-card"><strong>🃏 {t(lang, 'cs.cardChatT')}</strong><span>{t(lang, 'cs.cardChatD')}</span></div>
              <div className="cs-card"><strong>📖 {t(lang, 'cs.cardFreeT')}</strong><span>{t(lang, 'cs.cardFreeD')}</span></div>
              <div className="cs-card"><strong>🔒 {t(lang, 'cs.cardPrivacyT')}</strong><span>{t(lang, 'cs.cardPrivacyD')}</span></div>
            </div>
          </div>
        )}

        {error && <div className="error-bar">⚠ {error}</div>}

        {/* 截图分享提示条（非阻断，3 秒自动消失） */}
        {shotNotice && <div className="shot-notice">{shotNotice}</div>}

        {/* 嘴替抽屉：建议只供填入输入框，不入聊天记录 */}
        {impOpen && (
          <div className="imp-drawer">
            {impLoading ? (
              <div className="imp-status">⏳ {t(lang, 'imp.loading')}</div>
            ) : impSuggestions.length > 0 ? (
              <div className="imp-cards">
                {impSuggestions.map((s, i) => (
                  <button key={i} className="imp-card" onClick={() => pickSuggestion(s)}>{s}</button>
                ))}
              </div>
            ) : (
              <button className="imp-status imp-retry" onClick={fetchImpersonate}>{t(lang, 'imp.empty')}</button>
            )}
            <div className="imp-controls">
              <span className="imp-slider" title={t(lang, 'imp.expandLabel')}>
                <span>{t(lang, 'imp.expandLow')}</span>
                <input
                  type="range" min="0" max="1" step="0.1" value={impExpansion}
                  onChange={(e) => setImpExpansion(parseFloat(e.target.value))}
                />
                <span>{t(lang, 'imp.expandHigh')}</span>
              </span>
              <button className="imp-btn" onClick={fetchImpersonate} disabled={impLoading || streaming}>↻ {t(lang, 'imp.regen')}</button>
              <button className="imp-btn" onClick={handleRefine} disabled={!input.trim() || impRefining || streaming}>
                {impRefining ? t(lang, 'imp.refining') : `✨ ${t(lang, 'imp.refine')}`}
              </button>
            </div>
            <div className="imp-cost-hint">{t(lang, 'imp.costHint')}</div>
          </div>
        )}

        <footer className="input-bar">
          <button
            className={`btn-imp ${impOpen ? 'active' : ''}`}
            onClick={toggleImpersonate}
            disabled={streaming}
            title={impOpen ? t(lang, 'imp.close') : t(lang, 'imp.entry')}
          >💡</button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={t(lang, 'chat.placeholder', { name: char.card.name })}
            disabled={streaming}
            autoFocus
          />
          {streaming
            ? <button className="btn-stop" onClick={stopStreaming}>{t(lang, 'chat.stop')}</button>
            : <button className="btn-send" onClick={handleSend} disabled={!input.trim()}>{t(lang, 'chat.send')}</button>
          }
        </footer>
        </>
        )}
      </main>
    </div>
  )
}

// ─── 会话列表项（双击编辑标题）───────────────────────
function ConvItem({ conv, active, onSelect, onDelete, openSwipe, onSwipeOpen }: {
  conv: { id: string; title: string }
  active: boolean
  onSelect: () => void
  onDelete: () => void
  openSwipe: boolean
  onSwipeOpen: (open: boolean) => void
}) {
  const { renameConversation, lang } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)
  // 左滑露出删除：跟手位移，松手按半程阈值吸附（-72 展开 / 0 收起）
  const [swipeX, setSwipeX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; start: number; current: number; active: boolean } | null>(null)
  const touchEndAt = useRef(0)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  // 同一时间只允许一行展开：别的行打开时收起自己
  useEffect(() => { if (!openSwipe) setSwipeX(0) }, [openSwipe])

  function commit() {
    const t = draft.trim()
    if (t && t !== conv.title) renameConversation(conv.id, t)
    setEditing(false)
  }

  function onTouchStart(e: React.TouchEvent) {
    dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, start: swipeX, current: swipeX, active: false }
  }
  function onTouchMove(e: React.TouchEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.touches[0].clientX - d.x
    const dy = e.touches[0].clientY - d.y
    if (!d.active) {
      // 横向为主且超过阈值才认定为滑动手势，否则让位给列表纵向滚动
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      d.active = true
      setDragging(true)
    }
    d.current = Math.max(-88, Math.min(0, d.start + dx))
    setSwipeX(d.current)
  }
  function onTouchEnd() {
    const d = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!d?.active) return
    touchEndAt.current = Date.now()
    const open = d.current < -36
    setSwipeX(open ? -72 : 0)
    onSwipeOpen(open)
  }

  function handleClick() {
    // 刚结束滑动手势：浏览器补发的 click 不算选择
    if (Date.now() - touchEndAt.current < 400) return
    if (swipeX !== 0) {
      setSwipeX(0)
      onSwipeOpen(false)
      return
    }
    onSelect()
  }

  return (
    <li onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <button className="conv-swipe-del" onClick={(e) => { e.stopPropagation(); onDelete() }}>{t(lang, 'gallery.delete')}</button>
      <div
        className={`conv-row ${active ? 'active' : ''} ${dragging ? 'dragging' : ''}`}
        style={{ transform: `translateX(${swipeX}px)` }}
        onClick={handleClick}
        onDoubleClick={() => { setDraft(conv.title); setEditing(true) }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="conv-rename"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{conv.title}</span>
        )}
        <button className="btn-del" onClick={(e) => { e.stopPropagation(); onDelete() }}>×</button>
      </div>
    </li>
  )
}

// ─── WebLLM 模型选择器（卡片式 + 下载/启用按钮，借 fati ModelPicker 思路） ───────────
function WebLLMModelPicker({
  endpoint,
  setEndpoint,
  lang,
}: {
  endpoint: EndpointConfig
  setEndpoint: (cfg: Partial<EndpointConfig>) => void
  lang: Lang
}) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ pct: number; text: string }>({ pct: 0, text: '' })
  const [err, setErr] = useState<string | null>(null)

  const supported = webllmSupported()
  const loaded = endpoint.model && loadedWebLLMModel() === endpoint.model
  const deviceTier = (() => {
    if (typeof navigator === 'undefined') return 'balanced' as const
    const cores = navigator.hardwareConcurrency || 4
    const mem = (navigator as any).deviceMemory || 4
    if (cores <= 2 || mem <= 2) return 'phone' as const
    if (cores >= 8 && mem >= 8) return 'high' as const
    return 'balanced' as const
  })()

  async function handleDownload(modelId: string) {
    if (downloading) return
    setErr(null)
    setDownloading(modelId)
    setProgress({ pct: 0, text: '' })
    try {
      // 设置端点 + 选模型，下载/加载完成后即是当前模型
      setEndpoint({ model: modelId, baseUrl: 'webllm', apiKey: 'not-needed' })
      await loadWebLLMModel(modelId, (pct, text) => {
        setProgress({ pct, text })
      })
      setProgress({ pct: 100, text: '' })
    } catch (e: any) {
      const raw = String(e?.message || e)
      if (/adapter|WebGPU|gpu/i.test(raw)) {
        setErr(t(lang, 'webllm.unsupported'))
      } else if (/import.*module|module.*script|Failed to load/i.test(raw)) {
        setErr('加载引擎失败（网络中断）。请检查网络后重试，已下载部分会自动续传。')
      } else if (/network|fetch|Failed to load|timeout|abort/i.test(raw)) {
        setErr('下载中断（网络问题）。模型较大，请保持网络通畅后重试，已下载部分会续传。')
      } else {
        setErr(raw.slice(0, 200) || '下载失败')
      }
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="webllm-picker">
      <p className="cors-hint">{t(lang, 'webllm.hint')}</p>
      {/* M-3：模型来源披露——供应链透明度（权重下载自 HF mlc-ai 组织） */}
      <p className="cors-hint">{t(lang, 'webllm.modelSource')}</p>

      {!supported && (
        <div className="webllm-unsupported">{t(lang, 'webllm.unsupported')}</div>
      )}

      {/* 当前已启用模型 */}
      {endpoint.model && (
        <div className="webllm-current">
          当前模型：<strong>{endpoint.model}</strong>
          {loaded && <span className="webllm-ready"> · 已就绪</span>}
        </div>
      )}

      {/* 三档卡片 */}
      <div className="webllm-cards">
        {WEBLLM_MODELS.map((m) => {
          const isDownloading = downloading === m.id
          const isLoaded = loadedWebLLMModel() === m.id
          const isCurrent = endpoint.model === m.id
          const iosBlock = modelBlocked(m.id)
          const disabled = !supported || iosBlock.blocked
          return (
            <div
              key={m.id}
              className={`webllm-card tier-${m.tier} ${isCurrent ? 'active' : ''} ${iosBlock.blocked ? 'ios-locked' : ''}`}
            >
              <div className="webllm-card-head">
                <span className="webllm-card-name">{m.name}</span>
                {m.recommended && <span className="webllm-badge">推荐</span>}
                {m.tier === deviceTier && <span className="webllm-badge auto">适合你的设备</span>}
              </div>
              <div className="webllm-card-desc">{m.desc}</div>
              <div className="webllm-card-size">约 {m.sizeGB} GB</div>
              {iosBlock.blocked && (
                <div className="webllm-ios-locked">🚫 {iosBlock.reason}</div>
              )}

              {isDownloading ? (
                <div className="webllm-progress-wrap">
                  <div className="webllm-progress-bar">
                    <div className="webllm-progress-fill" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <div className="webllm-progress-text">
                    {progress.pct < 100 ? `下载中 ${progress.pct}%` : '加载中…'}
                    {progress.text && <span className="webllm-progress-detail"> · {progress.text}</span>}
                  </div>
                </div>
              ) : isLoaded ? (
                <button
                  className="webllm-btn ready"
                  onClick={() => setEndpoint({ model: m.id })}
                  disabled={isCurrent || iosBlock.blocked}
                >
                  {isCurrent ? '✓ 使用中' : '使用'}
                </button>
              ) : (
                <button
                  className="webllm-btn"
                  onClick={() => handleDownload(m.id)}
                  disabled={disabled}
                >
                  下载并启用
                </button>
              )}
            </div>
          )
        })}
      </div>

      {err && <div className="webllm-err">{err}</div>}
    </div>
  )
}

// ─── 设置面板 ───────────────────────────────────────────
function SettingsPanel() {
  const { endpoint, setEndpoint, clearEndpoint, lang, setLang, persona, setPersona, safeMode, setSafeMode, ageGate } = useStore()
  // 未成年：安全模式锁定开启
  const safeLocked = ageGate === 'minor'
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [chatStatus, setChatStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [chatMsg, setChatMsg] = useState('')
  const [relayUrl, setRelayUrl] = useState(loadRelayUrl())

  // 本地端点需要用户自行开启 CORS，否则从 HTTPS 页面必然连不上
  const isLocalEndpoint = /localhost|127\.0\.0\.1/.test(endpoint.baseUrl)
  // WebLLM 免 Key 档：浏览器本地推理，无 HTTP 端点可测
  const isWebllm = endpoint.baseUrl === 'webllm'

  // 检测当前设备/性能档位
  const deviceTier = (() => {
    if (typeof navigator === 'undefined') return 'balanced' as const
    const cores = navigator.hardwareConcurrency || 4
    const mem = (navigator as any).deviceMemory || 4
    if (cores <= 2 || mem <= 2) return 'phone' as const
    if (cores >= 8 && mem >= 8) return 'high' as const
    return 'balanced' as const
  })()

  // 选中的档
  const selectedTier = endpoint.tier || deviceTier

  async function handleTest() {
    setStatus('loading')
    setStatusMsg('')
    try {
      const list = await fetchModels(endpoint)
      setModels(list)
      setStatus('ok')
      setStatusMsg(t(lang, 'settings.testOk', { n: list.length }))
    } catch (e: any) {
      setStatus('error')
      setStatusMsg(e.message || t(lang, 'settings.testFail'))
      setModels([])
    }
  }

  // /models 通了不代表聊天可用——真实走一次 /chat/completions
  async function handleTestChat() {
    setChatStatus('loading')
    setChatMsg('')
    try {
      // 接收返回值并校验非空：极端全-think 场景下 HTTP 200 但 content 为空串，
      // 不能算"测试成功"（cbc 审计 P1-4，R4 修复）
      const reply = await testChat(endpoint)
      if (!reply.trim()) throw new Error(t(lang, 'settings.chatEmpty'))
      setChatStatus('ok')
      setChatMsg(t(lang, 'settings.chatOk'))
    } catch (e: any) {
      setChatStatus('error')
      setChatMsg(e.message || t(lang, 'settings.chatFail'))
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-head">
        <h3>{t(lang, 'settings.title')}</h3>
        <div className="lang-toggle" title={t(lang, 'settings.lang')}>
          {(['zh', 'en', 'ja', 'ko'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
              {l === 'zh' ? '中文' : l === 'en' ? 'EN' : l === 'ja' ? '日本' : '한국'}
            </button>
          ))}
        </div>
      </div>
      <div className="safe-mode-row">
        <label className="safe-mode-label">
          <input type="checkbox" checked={safeMode} disabled={safeLocked} onChange={(e) => setSafeMode(e.target.checked)} />
          <span>{t(lang, 'settings.safeMode')}</span>
        </label>
        <span className="safe-mode-hint">{safeLocked ? t(lang, 'settings.safeModeLocked') : t(lang, 'settings.safeModeDesc')}</span>
      </div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={endpoint.baseUrl === p.baseUrl ? 'active' : ''}
            onClick={() => { setEndpoint({ baseUrl: p.baseUrl, model: p.hint || endpoint.model }); setModels([]); setStatus('idle') }}
          >{p.baseUrl === 'webllm' ? t(lang, 'webllm.preset') : p.label}</button>
        ))}
      </div>
      {isWebllm ? (
        <WebLLMModelPicker
          endpoint={endpoint}
          setEndpoint={setEndpoint}
          lang={lang}
        />
      ) : (
        <>
          <label>{t(lang, 'settings.baseUrl')}
            <input value={endpoint.baseUrl} onChange={(e) => setEndpoint({ baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" />
          </label>
          {isLocalEndpoint && (
            <p className="cors-hint">{t(lang, 'settings.corsHint')}</p>
          )}
          <label>{t(lang, 'settings.apiKey')}
            <input type="password" value={endpoint.apiKey} onChange={(e) => setEndpoint({ apiKey: e.target.value })} placeholder="sk-..." />
          </label>
          {/* M-2：共用设备风险提示 + 一键清除（Key 明文存 localStorage 的配套自控件） */}
          <p className="cors-hint">{t(lang, 'settings.keySharedHint')}</p>
          <button
            className="btn-p2p"
            onClick={() => { clearEndpoint(); setModels([]); setStatus('idle') }}
          >{t(lang, 'settings.clearEndpoint')}</button>
          {/* ── 模型选择下拉 ── */}
          <label>{t(lang, 'model.picker')}
            <select
              value={endpoint.model}
              onChange={(e) => setEndpoint({ model: e.target.value })}
            >
              {/* 自动推荐 */}
              <optgroup label={t(lang, 'model.selectDefault')}>
                <option value={TIER_DEFAULT_MODEL[selectedTier]}>
                  {t(lang, `model.tier.${selectedTier}`)} — {TIER_DEFAULT_MODEL[selectedTier]}
                </option>
              </optgroup>
              {/* 编辑推荐 */}
              <optgroup label={t(lang, 'model.recommended')}>
                {EDIT_RECOMMENDED.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
              {/* 其他模型 */}
              {models.length > 0 && models.filter((m) => !EDIT_RECOMMENDED.includes(m)).length > 0 && (
                <optgroup label={t(lang, 'model.other')}>
                  {models.filter((m) => !EDIT_RECOMMENDED.includes(m)).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </optgroup>
              )}
              {!models.includes(endpoint.model) && endpoint.model && (
                <option value={endpoint.model}>{endpoint.model}</option>
              )}
            </select>
          </label>
          {/* 档位说明 */}
          <p className="tier-hint">
            {t(lang, `model.usage.${selectedTier}`)}
          </p>
        </>
      )}
      <div className="param-row">
        <label>{t(lang, 'settings.temp')}
          <input
            type="number" min="0" max="2" step="0.1"
            value={endpoint.temperature ?? 0.8}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setEndpoint({ temperature: v }) }}
          />
        </label>
        <label>{t(lang, 'settings.maxTokens')}
          <input
            type="number" min="128" max="8192" step="128"
            value={endpoint.maxTokens ?? 2048}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setEndpoint({ maxTokens: v }) }}
          />
        </label>
      </div>
      <label>{t(lang, 'p2pRelayLabel')}
        <input
          type="text"
          value={relayUrl}
          placeholder="ws://127.0.0.1:8081"
          onChange={e => setRelayUrl(e.target.value)}
          onBlur={() => saveRelayUrl(relayUrl)}
        />
      </label>
      <p className="p2p-hint">{t(lang, 'p2pRelayHint')}</p>
      {/* ── 用户 persona：名字填 {{user}} 宏，描述告诉角色“我扮演谁” ── */}
      <div className="persona-section">
        <h4>{t(lang, 'persona.title')}</h4>
        <label>{t(lang, 'persona.name')}
          <input
            value={persona.name}
            onChange={(e) => setPersona({ name: e.target.value })}
            placeholder={t(lang, 'persona.namePlaceholder')}
          />
        </label>
        <label>{t(lang, 'persona.desc')}
          <textarea
            value={persona.description}
            onChange={(e) => setPersona({ description: e.target.value })}
            placeholder={t(lang, 'persona.descPlaceholder')}
            rows={2}
          />
        </label>
      </div>
      {!isWebllm && (
        <>
          <div className="test-row">
            <button className="btn-test" onClick={handleTest} disabled={status === 'loading' || !endpoint.baseUrl}>
              {status === 'loading' ? t(lang, 'settings.testing') : t(lang, 'settings.test')}
            </button>
            {statusMsg && <span className={`test-msg ${status}`}>{statusMsg}</span>}
          </div>
          <div className="test-row">
            <button className="btn-test" onClick={handleTestChat} disabled={chatStatus === 'loading' || !endpoint.baseUrl || !endpoint.model}>
              {chatStatus === 'loading' ? t(lang, 'settings.sending') : t(lang, 'settings.sendTest')}
            </button>
            {chatMsg && <span className={`test-msg ${chatStatus}`}>{chatMsg}</span>}
          </div>
        </>
      )}
      <footer className="settings-disclaimer">
        <p>{t(lang, 'settings.disclaimerByok')}</p>
        <p>{t(lang, 'settings.disclaimerContent')}</p>
      </footer>
    </div>
  )
}
