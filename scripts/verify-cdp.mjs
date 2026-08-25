#!/usr/bin/env node
import { spawn } from 'node:child_process'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = Number(process.env.CDP_PORT ?? 9223)
const targetURL = process.env.VERIFY_URL ?? 'http://127.0.0.1:4173/'
let websocket
let sendRef = () => { throw new Error('CDP not connected') }

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--user-data-dir=/private/tmp/fati-cdp-profile',
  '--no-first-run',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--ignore-certificate-errors',
  `--remote-debugging-address=127.0.0.1`,
], { stdio: ['ignore', 'inherit', 'inherit'] })

chrome.on('exit', code => {
  if (code !== 0 && code !== null) {
    console.error(`Chrome exited ${code}`)
    process.exit(1)
  }
})

try {
  const wsURL = await waitForDebuggerEndpoint(port)
  websocket = new WebSocket(wsURL.webSocketDebuggerUrl)
  const localPending = new Map()
  let localMessageId = 0

  websocket.onopen = async () => {
    sendRef = (method, params) => new Promise((resolve, reject) => {
      const id = ++localMessageId
      localPending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message))
      websocket.send(JSON.stringify({ id, method, params }))
    })
    await send('Runtime.enable')
    await navigate(targetURL)
    const ageGate = await send('Runtime.evaluate', {
      expression: 'document.querySelector(".age-gate") !== null',
      returnByValue: true,
    })
    if (!ageGate.result?.result?.value) throw new Error('Age gate not rendered')

    await send('Runtime.evaluate', {
      expression: 'localStorage.setItem("tavern-age-gate", "adult")',
    })
    await navigate(targetURL)
    const catalog = await send('Runtime.evaluate', {
      expression: 'Boolean(document.querySelector(".gallery-header"))',
      returnByValue: true,
    })
    const modelStatus = await send('Runtime.evaluate', {
      expression: 'Boolean(document.querySelector(".catalog-model-ready,.catalog-model-warning"))',
      returnByValue: true,
    })
    if (!catalog.result?.result?.value) throw new Error('Gallery did not render over CDP')
    console.log(`CDP_CATALOG_OK MODEL_STATUS=${modelStatus.result?.result?.value}`)
    chrome.kill()
    process.exit(0)
  }

  websocket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id && localPending.has(message.id)) {
      localPending.get(message.id)(message)
      localPending.delete(message.id)
    }
  }
  websocket.onerror = () => {
    chrome.kill()
    process.exit(1)
  }
} catch (error) {
  console.error(error)
  chrome.kill()
  process.exit(1)
}

async function waitForDebuggerEndpoint(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error('Chrome DevTools endpoint unavailable')
}

function send(method, params = {}) {
  return sendRef(method, params)
}

async function navigate(url) {
  await send('Page.enable')
  await send('Page.navigate', { url })
  await new Promise(resolve => setTimeout(resolve, 500))
}

process.on('exit', () => {
  try { chrome.kill() } catch { /* already exited */ }
})
