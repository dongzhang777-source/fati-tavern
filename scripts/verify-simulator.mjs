import { chromium, devices } from '@playwright/test'

const baseURL = process.env.VERIFY_URL ?? 'http://127.0.0.1:4173/'
const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-certificate-errors'],
})

for (const deviceName of ['iPhone 14', 'Pixel 7']) {
  const context = await browser.newContext({
    ...devices[deviceName],
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}#card=not-gzip`)
  await page.evaluate(() => localStorage.setItem('tavern-age-gate', '"adult"'))
  await page.reload()
  await page.waitForLoadState('networkidle')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  const disclosure = await page.locator('body').textContent() ?? ''
  if (overflow) throw new Error(`${deviceName}: horizontal overflow`)
  if (disclosure.includes('AI 角色扮演 · 非真人')) throw new Error('Disclosure must not appear outside chat')

  await page.screenshot({ path: `archive/tryouts/2026-08-24-v0.11.2/simulator-${deviceName.replace(/\s+/g, '-').toLowerCase()}.png`, fullPage: true })
  console.log(`SIMULATOR_${deviceName.toUpperCase().replace(/\s+/g, '_')}_OK errors=${errors.length}`)
  await context.close()
}

await browser.close()
