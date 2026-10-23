// Asegura que el servidor local de AgentOS esté corriendo. Lo usan el hook de SessionStart y el MCP.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import { isMain, repoRoot } from './paths.mjs'

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

/** What every surface says when the server is down and could not be started. */
export const DOWN_MESSAGE = 'AgentOS está apagado: abre tu carpeta AgentOS y corre ./bin/agentos start (o pídele a Claude «enciende AgentOS»).'

const isAgentOS = (dir) => !!dir && existsSync(join(dir, '.claude-plugin', 'marketplace.json')) && existsSync(join(dir, 'plugins', 'agentos'))
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }

/**
 * Where this computer's AgentOS folder is, WITHOUT relying on the caller's env. A plugin added from Claude Desktop
 * (Customize → Plugins, what Cowork loads) or a desktop extension does not get the `env` of ~/.claude/settings.json, so
 * the plugin-cache copy of this file looks, in order: AGENTOS_HOME/AGENTOS_ROOT → the clone this code runs from →
 * `env` in ~/.claude/settings.json → Claude Desktop's `mcpServers.agentos.env` (both written by the installer) →
 * ~/Documents/AgentOS. Read-only. Returns { home, root, repo } (repo null for an old ~/.agentos install) or null.
 */
export function locateInstall({ env = process.env, home = homedir(), repo = repoRoot() } = {}) {
  const fromVars = (v) => {
    if (!v?.AGENTOS_HOME) return null
    const r = basename(v.AGENTOS_HOME) === 'data' && isAgentOS(dirname(v.AGENTOS_HOME)) ? dirname(v.AGENTOS_HOME) : null
    return { home: v.AGENTOS_HOME, root: v.AGENTOS_ROOT || (r ? join(r, 'workspaces') : join(home, 'AgentOS')), repo: r }
  }
  const fromRepo = (r) => (isAgentOS(r) ? { home: join(r, 'data'), root: join(r, 'workspaces'), repo: r } : null)
  const desktopDirs = [join(home, 'Library', 'Application Support', 'Claude'), join(home, '.config', 'Claude'), ...(env.APPDATA ? [join(env.APPDATA, 'Claude')] : [])]
  return (
    fromVars(env) ??
    fromRepo(repo) ??
    fromVars(readJson(join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json'))?.env) ??
    desktopDirs.map((d) => fromVars(readJson(join(d, 'claude_desktop_config.json'))?.mcpServers?.agentos?.env)).find(Boolean) ??
    fromRepo(join(home, 'Documents', 'AgentOS')) ??
    null
  )
}

// Node that can run the server (it needs node:sqlite, Node 22.5+). Claude Desktop may run plugins and extensions with its
// own built-in Node; if that one cannot, use the person's Node (the installer requires one). AGENTOS_NODE overrides.
export async function serverNode({ env = process.env } = {}) {
  if (env.AGENTOS_NODE) return env.AGENTOS_NODE
  if (!process.versions.electron) {
    try { await import('node:sqlite'); return process.execPath } catch { /* too old */ }
  }
  const win = process.platform === 'win32'
  const c = win ? [join(env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')] : ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']
  return c.find((p) => existsSync(p)) ?? (win ? 'node.exe' : 'node')
}

// Starts the server of the person's own AgentOS folder (not this plugin-cache copy: the server version must match their
// data), detached, with AGENTOS_HOME/ROOT set. Without a known folder nothing is started (it would create data outside
// the AgentOS folder) and it returns false.
export async function ensureServer({ waitMs = 3000 } = {}) {
  if (await healthy()) return true
  const loc = locateInstall()
  if (!loc) return false
  const inRepo = loc.repo && join(loc.repo, 'plugins', 'agentos', 'server', 'src', 'server.mjs')
  const serverJs = inRepo && existsSync(inRepo) ? inRepo : fileURLToPath(new URL('./server.mjs', import.meta.url))
  try {
    const logs = join(loc.home, 'logs')
    mkdirSync(logs, { recursive: true })
    const log = openSync(join(logs, 'server.log'), 'a')
    const child = spawn(await serverNode(), [serverJs], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, AGENTOS_HOME: loc.home, AGENTOS_ROOT: loc.root, AGENTOS_PORT: String(PORT) },
    })
    child.on('error', () => {})
    child.unref()
  } catch { return false }
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
