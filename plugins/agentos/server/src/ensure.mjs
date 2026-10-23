// Asegura que el servidor local de AgentOS esté corriendo. Lo usan el hook de SessionStart y el MCP.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isMain, agentosHome } from './paths.mjs'

const PORT = Number(process.env.AGENTOS_PORT || 4780)
const BASE = `http://127.0.0.1:${PORT}`

export const baseUrl = BASE

async function healthy(ms = 400) {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(ms) })
    return r.ok
  } catch {
    return false
  }
}

export async function ensureServer({ waitMs = 3000 } = {}) {
  if (await healthy()) return true
  const dir = agentosHome()
  mkdirSync(dir, { recursive: true })
  const log = openSync(join(dir, 'server.log'), 'a')
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: process.env,
  })
  child.unref()
  const until = Date.now() + waitMs
  while (Date.now() < until) {
    if (await healthy()) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  let raw = ''
  for await (const c of process.stdin) raw += c
  return raw
}

// Como hook de SessionStart: arranca el servidor y reenvía el evento (si no, el evento llegaría antes de que exista).
if (isMain(import.meta.url)) {
  try {
    const raw = await readStdin()
    if (await ensureServer() && raw.trim()) {
      const r = await fetch(`${BASE}/hooks/SessionStart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(process.env.AGENTOS_WORKSPACE ? { 'x-agentos-workspace': process.env.AGENTOS_WORKSPACE } : {}) },
        body: raw,
        signal: AbortSignal.timeout(2000),
      })
      const text = await r.text()
      if (text) process.stdout.write(text) // contexto del agente en el equipo activo (additionalContext)
    }
  } catch {}
  process.exit(0) // un hook nunca debe fallar ni bloquear a Claude
}
