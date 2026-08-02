/**
 * 剧情模式引擎（Director-lite）。
 * 把世界书浓缩成的剧情世界续写成「场景 + 选项」：
 * - BYOK 档：要求模型输出 JSON {sceneText, choices[]}，解析失败逐级降级；
 * - WebLLM 小模型档：JSON 输出不稳定，强制纯续写模式（无选项）。
 * 纯 prompt 构造 + 解析函数，网络调用由 store slice 负责。
 */
import type { StoryScene } from './db'

export interface StoryRequest {
  title: string
  premise: string
  scenes: StoryScene[] // 已生成场景（最近几幕会被拼入 prompt）
  lang: 'zh' | 'en'
  /** 小模型/移动端降级：只续写正文，不要 JSON 选项 */
  plainMode: boolean
  /** 用户自由输入（选择某个选项或自己打字） */
  userInput?: string
}

const MAX_SCENE = 500 // 单幕正文目标长度（字符），提示模型控制篇幅

// 只带最近 3 幕进 prompt（小上下文模型友好）；返回偏移量保证编号连续
function recentScenes(scenes: StoryScene[]): { list: StoryScene[]; offset: number } {
  const offset = Math.max(0, scenes.length - 3)
  return { list: scenes.slice(offset), offset }
}

export function buildStoryPrompt(req: StoryRequest): { system: string; user: string } {
  const zh = req.lang === 'zh'
  const { list, offset } = recentScenes(req.scenes)
  const history = list
    .map((s, i) => `${zh ? '第' : 'Scene '}${offset + i + 1}${zh ? '幕' : ''}\n${s.text}`)
    .join('\n\n')

  const worldBlock = `${zh ? '世界设定' : 'World setting'}「${req.title}」：\n${req.premise}`

  let system: string
  if (zh) {
    system = `你是沉浸式互动剧情的导演。基于下面的世界设定续写剧情。\n\n${worldBlock}\n\n要求：
- 每幕正文 ${MAX_SCENE} 字左右，第二人称视角（"你"），有画面感、有冲突、推进剧情；
- 严格遵守世界设定，不脱离设定乱编；
- 内容面向成年读者但仍需有叙事张力，避免流水账。`
    if (!req.plainMode) {
      system += `
- 输出严格 JSON（不要 markdown 代码块、不要任何多余文字）：
{"sceneText":"本幕正文","choices":["选项1","选项2","选项3"]}
- choices 给 2~4 个，每个不超过 20 字，方向要有差异。`
    }
  } else {
    system = `You are the director of an immersive interactive story. Continue the story based on the world setting below.\n\n${worldBlock}\n\nRequirements:
- Each scene about ${MAX_SCENE} characters, second-person POV ("you"), vivid, with conflict, moving the plot forward;
- Stay faithful to the world setting;
- Write for adult readers with narrative tension; avoid flat recaps.`
    if (!req.plainMode) {
      system += `
- Output strict JSON only (no markdown fences, no extra text):
{"sceneText":"scene body","choices":["choice 1","choice 2","choice 3"]}
- Provide 2-4 choices, each under 15 words, meaningfully different directions.`
    }
  }

  let user: string
  if (req.scenes.length === 0) {
    user = zh ? '写第一幕，把"你"带入这个世界。' : 'Write the opening scene, drawing "you" into this world.'
  } else {
    user = zh
      ? `已有剧情：\n${history}\n\n${req.userInput ? `玩家的选择/行动：${req.userInput}\n\n` : ''}写下一幕。`
      : `Story so far:\n${history}\n\n${req.userInput ? `Player's choice/action: ${req.userInput}\n\n` : ''}Write the next scene.`
  }

  return { system, user }
}

export interface ParsedScene {
  text: string
  choices: string[]
}

/**
 * 解析模型输出，三级降级链：
 * 1. 合法 JSON → sceneText + choices；
 * 2. JSON 嵌在 markdown 代码块里 → 剥掉围栏再试；
 * 3. 全失败 → 整段当正文、无选项（plainMode 也走这里）。
 * 永不抛错——剧情模式宁可没选项也不中断。
 */
export function parseSceneOutput(raw: string): ParsedScene {
  const text = raw.trim()
  if (!text) return { text: '', choices: [] }

  const candidates: string[] = [text]
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.unshift(fence[1].trim())
  // 有的模型在 JSON 前后加解说，尝试截取第一个 { 到最后一个 }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1))
  }

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c)
      if (obj && typeof obj === 'object' && typeof obj.sceneText === 'string' && obj.sceneText.trim()) {
        const choices = Array.isArray(obj.choices)
          ? obj.choices.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 4)
          : []
        return { text: obj.sceneText.trim(), choices }
      }
    } catch { /* 试下一个候选 */ }
  }
  // 降级：整段正文
  return { text, choices: [] }
}
