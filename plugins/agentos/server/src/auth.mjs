// Local sign-in for the person who owns this AgentOS. The username and password are NOT created in the web: the owner
// writes them in a `.env` file or a config file, and that is what the sign-in form checks.
//
// Where the credentials come from (per key, first one found wins):
//   1. environment variables  AGENTOS_USER / AGENTOS_PASSWORD
//   2. `~/.agentos/.env`      (AGENTOS_HOME overrides the folder)   AGENTOS_USER=ana  AGENTOS_PASSWORD=...
//   3. `~/.agentos/config.json`                                      {"user": "ana", "password": "..."}
// They are re-read on every sign-in, so editing the file needs no restart; changing them signs everyone out.
//
// Scope (be honest about it): this protects the WEB UI. Requests from a browser (they carry `Origin` or `Sec-Fetch-Site`)
// need a valid session; requests from local processes (Claude hooks, the MCP server, curl) carry neither header and are
// let through, exactly like anything else running as the same OS user who can already read ~/.agentos. The server only
// listens on 127.0.0.1, so this is not network-facing. The password sits in plain text in the file on purpose (it is the
// owner's own machine): keep that file private (`chmod 600`), never commit it.
//
// Sessions: 32 random bytes in an HttpOnly cookie; only their SHA-256 is stored, together with a fingerprint of the credentials.
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { agentosHome } from './paths.mjs'
import { join } from 'node:path'
import { AppError } from './store.mjs'

export const COOKIE = 'agentos_session'
export const SESSION_MS = 30 * 24 * 3600 * 1000
const MAX_FAILS = 5
const LOCK_MS = 60_000

const sha = (s) => createHash('sha256').update(s).digest()
const shaHex = (s) => createHash('sha256').update(s).digest('hex')
/** Constant-time string comparison (both sides hashed first so lengths do not leak). */
const same = (a, b) => timingSafeEqual(sha(String(a)), sha(String(b)))

export function parseCookie(header, name = COOKIE) {
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export const cookieHeader = (token, maxAgeSec = SESSION_MS / 1000) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAgeSec)}`
export const clearCookieHeader = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`

/** Parses `KEY=VALUE` lines (`export` prefix, quotes and `#` comments allowed). */
export function parseEnv(text) {
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.replace(/^export\s+/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    out[m[1]] = v
  }
  return out
}

const readOptional = (file) => { try { return readFileSync(file, 'utf8') } catch { return null } }

/** The configured credentials, or null when the owner has not set them. `files` lists the files that were read (for the permissions warning). */
export function loadCredentials({ env = process.env, home = agentosHome({ env }) } = {}) {
  const dotenvPath = join(home, '.env')
  const jsonPath = join(home, 'config.json')
  const fromDotenv = parseEnv(readOptional(dotenvPath) ?? '')
  let fromJson = {}
  try { fromJson = JSON.parse(readOptional(jsonPath) ?? '{}') } catch { /* invalid JSON = ignored */ }
  const pick = (a, b, c) => [a, b, c].find((v) => typeof v === 'string' && v !== '')
  const user = pick(env.AGENTOS_USER, fromDotenv.AGENTOS_USER, fromJson.user)
  const password = pick(env.AGENTOS_PASSWORD, fromDotenv.AGENTOS_PASSWORD, fromJson.password)
  if (!user || !password) return null
  return { user, password, files: [dotenvPath, jsonPath] }
}

/** Files with credentials that other users of this computer can read (`chmod 600` fixes it). POSIX only. */
export function looseFiles(creds) {
  if (!creds || process.platform === 'win32') return []
  return creds.files.filter((f) => { try { return (statSync(f).mode & 0o077) !== 0 } catch { return false } })
}

export const SETUP_HELP = 'Crea el archivo data/.env (dentro de la carpeta de AgentOS) con dos líneas: AGENTOS_USER=tu-usuario y AGENTOS_PASSWORD=tu-contraseña'

export function createAuth(db, { enabled = true, now = () => Date.now(), credentials = loadCredentials } = {}) {
  const fails = { n: 0, until: 0 }
  const fingerprint = (c) => shaHex(`${c.user}\n${c.password}`)

  const startSession = (c) => {
    const token = randomBytes(32).toString('base64url')
    db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now())
    db.prepare('INSERT INTO auth_sessions (token_hash, fp, created_at, expires_at) VALUES (?, ?, ?, ?)').run(shaHex(token), fingerprint(c), now(), now() + SESSION_MS)
    return token
  }

  return {
    enabled,
    configured: () => !!credentials(),
    /** The configured user name, shown after sign-in. */
    userName: () => credentials()?.user ?? null,
    login({ user, password }) {
      const c = credentials()
      if (!c) throw new AppError('not_configured', SETUP_HELP, 409)
      if (now() < fails.until) throw new AppError('locked', 'Demasiados intentos. Espera un minuto.', 429)
      // Both are always compared (no early exit) so the response time does not tell which one was wrong.
      const okUser = same(user ?? '', c.user)
      const okPass = same(password ?? '', c.password)
      if (!(okUser && okPass)) {
        if (++fails.n >= MAX_FAILS) { fails.n = 0; fails.until = now() + LOCK_MS }
        throw new AppError('bad_credentials', 'Usuario o contraseña incorrectos.', 401)
      }
      fails.n = 0
      return { name: c.user, token: startSession(c) }
    },
    /** A session is valid while it has not expired AND the credentials are still the ones it was opened with. */
    verify(token) {
      if (!token) return false
      const c = credentials()
      if (!c) return false
      const r = db.prepare('SELECT fp, expires_at FROM auth_sessions WHERE token_hash = ?').get(shaHex(token))
      return !!r && r.expires_at > now() && r.fp === fingerprint(c)
    },
    logout(token) {
      if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(shaHex(token))
    },
  }
}
