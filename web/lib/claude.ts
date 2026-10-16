import type { Seat } from './team'

// Enlaces claude:// de Claude Desktop (support.claude.com, artículos 14729294 y 14898120): sesión de Code existente por id
// (claude://code/<id>), chat o proyecto existente, y conversaciones NUEVAS de Code o Cowork con texto prellenado.

// Para sesiones de Claude Code reales: retomar la misma sesión en la terminal.
// Un subagente vive como «<sesión>/<agent_id>»: se retoma la sesión que lo lanzó.
export const resumeCommand = (seat: Seat) =>
  seat.sessionId && !seat.sessionId.startsWith('mcp:') ? `claude --resume ${seat.sessionId.split('/')[0]}` : null

/** Rol como sustantivo dentro de una frase: «Líder técnico» → «líder técnico»; siglas como «CMO» o «QA web» se quedan. */
export const roleNoun = (role: string) => (/^\p{Lu}\p{Ll}/u.test(role) ? role[0].toLowerCase() + role.slice(1) : role)

/** Mensaje inicial de una conversación nueva: «Hola, ahora eres un líder técnico llamado Atlas.» (el nombre sólo si lo tiene). */
export function greeting({ role, name, female = false }: { role: string; name?: string | null; female?: boolean }): string {
  const n = name?.trim()
  return `Hola, ahora eres ${female ? 'una' : 'un'} ${roleNoun(role)}${n ? ` ${female ? 'llamada' : 'llamado'} ${n}` : ''}.`
}

/**
 * Conversación NUEVA para un personaje sin sesión ligada, con el saludo prellenado (la persona lo envía y luego copia el id al panel).
 * Los agentes abren una tarea de Cowork; Assistant, una sesión de Claude Code. `folder` = carpeta del proyecto (workspace).
 */
export function newConversationLink({ surface, role, name, female, folder }: { surface: 'cowork' | 'code'; role: string; name?: string | null; female?: boolean; folder?: string | null }): string {
  const q = encodeURIComponent(greeting({ role, name, female }))
  const f = folder ? `&folder=${encodeURIComponent(folder)}` : ''
  return `claude://${surface}/new?q=${q}${f}`
}

export type SessionLink = { url: string; kind: 'code' | 'chat' | 'project' | 'codex' }

// Conversación EXISTENTE de Claude a partir de lo que la persona pega: id de sesión de Code (cse_…, session_…,
// uuid), enlace https://claude.ai/{code,chat,project}/<id> o su forma claude://. Solo devuelve URLs claude://
// con ids [A-Za-z0-9_-]; cualquier otra cosa es null.
export function sessionLink(ref: string | null | undefined): SessionLink | null {
  const r = (ref ?? '').trim()
  if (!r) return null
  const ID = '([A-Za-z0-9_-]+)'
  const tail = '(?:[?#].*)?$'
  // Id suelto: sólo formatos reales de sesión (nube `cse_…`/`session_…`, Desktop `local_…`, o UUID de la CLI); una palabra cualquiera no.
  const SESSION_ID = /^(?:(?:cse|session|local)_[A-Za-z0-9_-]{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
  // Codex (app de escritorio de OpenAI): codex://threads/<uuid> o la forma corta codex:<uuid>.
  const cx = r.match(/^codex:(?:\/\/threads\/)?([0-9a-f-]{36})$/i)
  if (cx) return { url: `codex://threads/${cx[1].toLowerCase()}`, kind: 'codex' }
  let m = r.match(SESSION_ID) ? [r, r] : null
  if (m) return { url: `claude://code/${m[1]}`, kind: 'code' }
  m = r.match(new RegExp(`^(?:https://claude\\.ai/code|claude://code)/${ID}${tail}`))
  if (m && m[1] !== 'new') return { url: `claude://code/${m[1]}`, kind: 'code' }
  m = r.match(new RegExp(`^(?:https://claude\\.ai/chat|claude://claude\\.ai/chat)/${ID}${tail}`))
  if (m) return { url: `claude://claude.ai/chat/${m[1]}`, kind: 'chat' }
  m = r.match(new RegExp(`^(?:https://claude\\.ai/project|claude://claude\\.ai/project)/${ID}${tail}`))
  if (m) return { url: `claude://claude.ai/project/${m[1]}`, kind: 'project' }
  return null
}
