// Roster global: todos los plugins, agentes y skills instalados (no depende del workspace).
// Una sola implementación del escaneo: la usan scripts/build-roster.mjs y el fallback del servidor. Sin dependencias.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_DESC = 300
export const PLUGINS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..') // plugins/
export const ROSTER_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'roster.json') // plugins/agentos-core/roster.json

const trim = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

// Frontmatter plano (`key: value`, con continuaciones indentadas y comillas opcionales). Suficiente para agents/*.md y SKILL.md.
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const out = {}
  if (!m) return out
  let key = null
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (kv && !/^\s/.test(line)) {
      key = kv[1]
      out[key] = kv[2].replace(/^(["'])(.*)\1$/, '$2').replace(/^[>|][-+]?$/, '')
    } else if (key && /^\s+\S/.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim()
  }
  return out
}

const dirs = (p) => { try { return readdirSync(p).filter((n) => !n.startsWith('.') && statSync(join(p, n)).isDirectory()).sort() } catch { return [] } }
const files = (p, ext) => { try { return readdirSync(p).filter((n) => n.endsWith(ext)).sort() } catch { return [] } }
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }

export function scanPlugins(pluginsDir = PLUGINS_DIR) {
  const plugins = []
  for (const dir of dirs(pluginsDir)) {
    const root = join(pluginsDir, dir)
    const manifest = readJson(join(root, '.claude-plugin', 'plugin.json'))
    const agents = []
    for (const f of files(join(root, 'agents'), '.md')) {
      try {
        const fm = parseFrontmatter(readFileSync(join(root, 'agents', f), 'utf8'))
        const a = { id: String(fm.name || f.replace(/\.md$/, '')).toLowerCase(), description: trim(fm.description, MAX_DESC), model: fm.model || null }
        agents.push(a)
      } catch {}
    }
    const skills = []
    for (const s of dirs(join(root, 'skills'))) {
      const f = join(root, 'skills', s, 'SKILL.md')
      if (!existsSync(f)) continue
      try {
        const fm = parseFrontmatter(readFileSync(f, 'utf8'))
        skills.push({ id: String(fm.name || s), description: trim(fm.description, MAX_DESC) })
      } catch {}
    }
    if (!manifest && !agents.length && !skills.length) continue
    agents.sort((a, b) => a.id.localeCompare(b.id))
    skills.sort((a, b) => a.id.localeCompare(b.id))
    plugins.push({ id: String(manifest?.name || dir), description: trim(manifest?.description, MAX_DESC), agents, skills })
  }
  return plugins.sort((a, b) => a.id.localeCompare(b.id))
}

// Contenido del archivo sin `generated_at` (lo que se compara para saber si cambió).
export const rosterContent = (pluginsDir) => ({ plugins: scanPlugins(pluginsDir) })

// Carga roster.json; si falta o está dañado, escanea los plugins hermanos. Nunca lanza.
export function loadRoster({ file = ROSTER_FILE, pluginsDir = PLUGINS_DIR } = {}) {
  const j = readJson(file)
  if (j && Array.isArray(j.plugins)) return { generated_at: j.generated_at ?? null, plugins: j.plugins, source: 'roster.json' }
  try { return { generated_at: null, plugins: scanPlugins(pluginsDir), source: 'scan' } } catch { return { generated_at: null, plugins: [], source: 'empty' } }
}
