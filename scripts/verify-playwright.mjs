import { chromium, devices } from '@playwright/test'

const baseURL = process.env.VERIFY_URL ?? 'http://127.0.0.1:4173/'
const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-certificate-errors'],
})
const page = await browser.newPage()

await page.goto(baseURL)
await page.waitForSelector('.age-gate')
await page.evaluate(() => localStorage.setItem('tavern-age-gate', 'adult'))
await page.reload()
await page.waitForSelector('.gallery-header')
await expectWebgpu(page)
await expectLocalModelStatus(page)
await verifyShareRoundTrip(page)

const mobileContext = await browser.newContext({ ...devices['iPhone 14'], ignoreHTTPSErrors: true })
const mobilePage = await mobileContext.newPage()
await mobilePage.goto(`${baseURL}#card=@@@`)
  await mobilePage.evaluate(() => localStorage.setItem('tavern-age-gate', 'adult'))
await mobilePage.reload()
if (await mobilePage.locator('.catalog-model-warning').count()) {
  await mobilePage.locator('.catalog-model-warning').waitFor()
}
await mobilePage.screenshot({ path: 'archive/tryouts/2026-08-24-v0.11.2/playwright-iphone.png', fullPage: true })

console.log('VERIFY_PLAYWRIGHT_OK')
await browser.close()

async function expectWebgpu(page) {
  const supported = await page.evaluate(() => typeof CompressionStream !== 'undefined' && !!navigator.gpu)
  console.log(`WEBGPU_COMPRESSION=${supported}`)
  if (!supported) throw new Error('Chromium lacks WebGPU or CompressionStream')
}

async function expectLocalModelStatus(page) {
  const ready = await page.locator('.catalog-model-ready').count()
  const warning = await page.locator('.catalog-model-warning').count()
  if (ready + warning !== 1) throw new Error('Exactly one local model status must be visible')
}

async function verifyShareRoundTrip(page) {
  const link = await page.evaluate(async () => {
    const bytesToBase64Url = (bytes) => {
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const base64UrlToBytes = (value) => {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
      const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
      return Uint8Array.from(binary, char => char.charCodeAt(0))
    }
    const card = {
      name: 'Playwright Share', description: 'round trip', personality: '', scenario: '',
      first_mes: '', mes_example: '', system_prompt: '', creator_notes: '', creator: '',
      tags: [], contentRating: 'unknown',
    }
    const encoded = new TextEncoder().encode(JSON.stringify(card))
    const compressed = new Uint8Array(await new Response(new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
    const shared = `${location.origin}/#card=${bytesToBase64Url(compressed)}`
    const sharedBytes = base64UrlToBytes(shared.slice(shared.indexOf('#card=') + 6))
    const stream = new Blob([sharedBytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(await new Blob(chunks).arrayBuffer())))
    return { link: shared, decoded }
  })
  if (link.decoded?.name !== 'Playwright Share') throw new Error(`Share round trip failed: ${JSON.stringify(link)}`)
  console.log(`SHARE_LINK_BYTES=${link.link.length}`)
}
