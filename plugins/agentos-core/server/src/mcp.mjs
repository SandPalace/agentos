// MCP "agentos" por stdio. Corre en la computadora del cliente (no en la VM de Cowork),
// así que llega al servidor local aunque Cowork no pueda ver localhost.
import { createInterface } from 'node:readline'
import { ensureServer, baseUrl } from './ensure.mjs'
import { isMain } from './paths.mjs'

// Optional project selector. Team agents are scoped to their own project; the Assistant works across all of them.
const WS = { type: 'string', description: 'Project (workspace) id. Team agents normally omit it (they work in their own project). The Assistant uses it to work across projects; ids come from agentos_projects.' }
const WS_ALL = { type: 'string', description: 'Project (workspace) id, or "all" for a per-project summary. Team agents normally omit it (current project). The Assistant uses it to work across projects.' }

const LEAD_SOURCES = ['whatsapp', 'instagram', 'facebook', 'meta_form', 'email', 'web', 'referral', 'other']

const TOOLS = [
  {
    name: 'agentos_task_create',
    description: 'Crea una tarea en el tablero de AgentOS. Úsala al empezar un trabajo que tomará más de un paso.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Qué se va a hacer, en una frase' },
        description: { type: 'string' },
        agent: { type: 'string', description: 'Quién la hace (e.g. analyst, cmo)' },
        workspace: WS,
      },
      required: ['title'],
    },
  },
  {
    name: 'agentos_task_update',
    description:
      'Cambia el estado de una tarea: todo, doing, blocked o review. Para pasar a review debes indicar output_dir (carpeta con los entregables, ruta absoluta) o haber registrado un entregable con agentos_task_deliver. Nunca marques done: la persona lo aprueba en la web.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'doing', 'blocked', 'review'] },
        output_dir: { type: 'string', description: 'Ruta absoluta de la carpeta donde quedó el resultado' },
        workspace: WS,
      },
      required: ['id'],
    },
  },
  {
    name: 'agentos_task_deliver',
    description:
      'Registers deliverables of a task. Preferred: `files` = workspace files/folders saved with agentos_file_write (workspace-relative paths such as `marketing/acme/report.md`; a folder path delivers the whole folder) and/or inline `{name, content}` files. `path` (absolute disk path, or a URL when kind=link) is only for things that must live on disk, such as code projects. Give `files` or `path`.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id' },
        files: {
          type: 'array',
          description: 'Virtual deliverables (max 100). Each item: {path} of a workspace file/folder, or {name, content|content_base64, content_type?}. Optional per item: title, kind.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Workspace-relative path of a file or folder written with agentos_file_write' },
              name: { type: 'string', description: 'File name for an inline file (no slashes)' },
              content: { type: 'string', description: 'utf-8 text of an inline file' },
              content_base64: { type: 'string' },
              content_type: { type: 'string' },
              title: { type: 'string' },
              kind: { type: 'string', enum: ['file', 'folder', 'report', 'image', 'markdown', 'artifact'] },
            },
          },
        },
        path: { type: 'string', description: 'Absolute disk path (or URL if kind=link). Only when the thing must live on disk.' },
        kind: { type: 'string', enum: ['file', 'folder', 'report', 'image', 'markdown', 'artifact', 'link'] },
        title: { type: 'string', description: 'Readable name' },
        workspace: WS,
      },
      required: ['id'],
    },
  },
  {
    name: 'agentos_task_list',
    description: 'Lista las tareas del tablero, con sus entregables.',
    inputSchema: { type: 'object', properties: { status: { type: 'string' }, workspace: WS } },
  },
  {
    name: 'agentos_lead_create',
    description: 'Creates a lead (prospect) in the Leads Kanban of the project. Agents may use any stage except "won" (only the person marks a lead as won). Stage "lost" requires lost_reason or notes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Person or business name (1-120 chars)' },
        company: { type: 'string' },
        contact: { type: 'string', description: 'Free text: phone, email, handle (max 200)' },
        source: { type: 'string', enum: LEAD_SOURCES },
        interest: { type: 'string', description: 'What they want (max 300)' },
        stage: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal', 'lost'], description: 'Default new. Never "won".' },
        score: { type: 'integer', minimum: 0, maximum: 100, description: 'Lead temperature 0-100' },
        next_contact_at: { type: 'string', description: 'YYYY-MM-DD' },
        value: { type: 'number', description: 'Estimated deal value (MXN)' },
        notes: { type: 'string', description: 'Markdown notes (max 20000)' },
        lost_reason: { type: 'string', description: 'Required with stage "lost" unless notes explain it' },
        files: { type: 'string', description: 'Archivos folder prefix, e.g. ventas/prospectos/<slug>/' },
        workspace: WS,
      },
      required: ['name'],
    },
  },
  {
    name: 'agentos_lead_update',
    description: 'Updates a lead (partial: send only the fields to change). Agents cannot set stage "won"; stage "lost" requires lost_reason or notes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lead id (L-...)' },
        name: { type: 'string' },
        company: { type: ['string', 'null'] },
        contact: { type: ['string', 'null'] },
        source: { type: 'string', enum: LEAD_SOURCES },
        interest: { type: ['string', 'null'] },
        stage: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal', 'lost'] },
        score: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
        next_contact_at: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        value: { type: ['number', 'null'] },
        notes: { type: ['string', 'null'], description: 'Replaces the previous notes' },
        lost_reason: { type: ['string', 'null'] },
        files: { type: ['string', 'null'] },
        workspace: WS,
      },
      required: ['id'],
    },
  },
  {
    name: 'agentos_lead_list',
    description: 'Lists the leads of the project, optionally filtered by stage and/or a text query (name, company, contact, interest, notes).',
    inputSchema: { type: 'object', properties: { stage: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] }, query: { type: 'string' }, workspace: WS } },
  },
  {
    name: 'agentos_whatsapp_inbox',
    description: 'Lists the WhatsApp chats of the project (people who wrote in), with the last messages, how many inbound messages are unanswered and the lead id. By default only chats with unanswered messages. Read-only.',
    inputSchema: { type: 'object', properties: { only_unanswered: { type: 'boolean', description: 'Default true' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, workspace: WS } },
  },
  {
    name: 'agentos_whatsapp_draft',
    description: 'Creates a DRAFT reply for a WhatsApp chat that already wrote in (status "draft"). Agents never send: the person reviews and sends it from the web. Text up to 1500 characters; no cold outreach, no groups.',
    inputSchema: { type: 'object', properties: { chat_id: { type: 'string', description: 'e.g. 5218112345678@c.us (from agentos_whatsapp_inbox)' }, phone: { type: 'string', description: 'Alternative to chat_id (digits)' }, text: { type: 'string' }, lead_id: { type: 'string' }, workspace: WS }, required: ['text'] },
  },
  {
    name: 'agentos_overview',
    description:
      'Foto del momento de AgentOS: equipos, qué hace cada agente, tareas por estado, lo que espera a la persona y sesiones sueltas. Incluye `roster`: todos los plugins y agentes instalados (descripción corta, in_active_team, working_now, open_tasks) y `not_in_active_team`. Sin `workspace` es el proyecto de la sesión; con un id de proyecto es ese proyecto; con "all" un resumen por proyecto. El Assistant empieza con agentos_projects.',
    inputSchema: { type: 'object', properties: { workspace: WS_ALL } },
  },
  {
    name: 'agentos_projects',
    description:
      "Lists ALL projects (workspaces) of the owner: id, name, root folder, teams (active one marked), open / in-review / blocked task counts and agents waiting on the person. Start here when you are the Assistant (one Assistant for every project); then use the project id as `workspace` in the other tools.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentos_roster',
    description:
      'Roster completo de agentes y skills instalados (no sólo los del equipo activo), con la descripción completa. Sin argumentos devuelve todos los plugins; con `plugin` devuelve ese plugin (agentes + skills); con `agent` devuelve ese agente con su plugin y skills. Un id desconocido da un error claro. Léela antes de recomendar un agente.',
    inputSchema: {
      type: 'object',
      properties: {
        plugin: { type: 'string', description: 'Id del plugin (ej. dev-team)' },
        agent: { type: 'string', description: 'Id del agente (ej. tech-lead)' },
      },
    },
  },
  {
    name: 'agentos_team_context',
    description:
      'Devuelve el contexto que la persona definió para un agente en el equipo activo de AgentOS. Úsala al empezar si no recibiste contexto automáticamente (por ejemplo en Cowork).',
    inputSchema: { type: 'object', properties: { agent: { type: 'string', description: 'Id del agente (ej. cmo)' } }, required: ['agent'] },
  },
  {
    name: 'agentos_checkin',
    description:
      'Avisa a la oficina en qué estado está un agente (working, waiting, idle, error). Sirve donde los hooks no llegan, como Cowork.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        status: { type: 'string', enum: ['working', 'waiting', 'idle', 'error'] },
        detail: { type: 'string', description: 'Qué está haciendo, en pocas palabras' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'agentos_file_write',
    description:
      "Saves a file in this workspace's AgentOS storage (no disk path needed; the person sees it in the web). `path` is workspace-relative, e.g. `marketing/acme/facts.md`. Send `content` (utf-8 text) or `content_base64`. Overwrites by default. Max 50 MB.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path, e.g. marketing/acme/facts.md' },
        content: { type: 'string', description: 'utf-8 text content' },
        content_base64: { type: 'string', description: 'Binary content, base64' },
        content_type: { type: 'string', description: 'Optional; inferred from the extension' },
        overwrite: { type: 'boolean', description: 'Default true. false = fail if the file exists' },
        workspace: WS,
      },
      required: ['path'],
    },
  },
  {
    name: 'agentos_file_read',
    description:
      'Reads a file from this workspace\'s AgentOS storage. Returns utf-8 text (encoding "utf-8") or base64 with content_type for binary files. Limit 5 MB; larger files return a clear error.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path' },
        max_bytes: { type: 'integer', description: 'Optional: return only the first N bytes of a text file (truncated=true)' },
        workspace: WS,
      },
      required: ['path'],
    },
  },
  {
    name: 'agentos_file_list',
    description:
      'Lists folders and files (size, mtime) under a workspace-relative prefix, one level by default. Trash is excluded. Up to 5,000 entries per page (next_cursor).',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Folder path, e.g. marketing/acme. Empty = workspace root' },
        recursive: { type: 'boolean', description: 'List every file below the prefix' },
        cursor: { type: 'string', description: 'next_cursor from a previous page' },
        workspace: WS,
      },
    },
  },
  {
    name: 'agentos_file_delete',
    description: 'Soft-deletes a file or a whole folder: it moves to trash (nothing is erased). Not visible in listings afterwards.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Workspace-relative file or folder path' } }, required: ['path'] },
  },
  {
    name: 'agentos_file_move',
    description: 'Moves or renames a file or folder inside the workspace storage. Fails if the destination exists.',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'agentos_profile_read',
    description:
      "Reads the owner's profile (preferred name, about, personal goals, professional goals, current focus, work style) and the latest insights learned about them. Call it at the start of a conversation to adapt your tone and suggestions. Empty fields mean the person has not filled them in yet.",
    inputSchema: { type: 'object', properties: { insights: { type: 'integer', description: 'How many recent insights to return (default 20, max 200)' } } },
  },
  {
    name: 'agentos_profile_update',
    description:
      "Edits the owner's profile. Partial: send only the fields to change; each one REPLACES the previous text (read first and merge). Use it only with what the person explicitly said or asked you to save. Never store passwords, payment data, health data or other secrets.",
    inputSchema: {
      type: 'object',
      properties: {
        preferred_name: { type: 'string', description: 'How to address the person (max 120 chars)' },
        about: { type: 'string', description: 'Who they are and their business (max 4000)' },
        personal_goals: { type: 'string', description: 'Max 4000' },
        professional_goals: { type: 'string', description: 'Max 4000' },
        current_focus: { type: 'string', description: 'What they are focused on this quarter (max 4000)' },
        work_style: { type: 'string', description: 'How they like to be helped, communication preferences (max 4000)' },
      },
    },
  },
  {
    name: 'agentos_profile_note',
    description:
      'Records one short insight learned about the owner while talking (a durable preference, goal, context or communication style), so you adapt over time. Max 500 chars, one fact per note. Never record passwords, card or bank numbers, keys, health data or other sensitive information; obvious ones are rejected. Tell the person briefly that you noted it.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The insight, in the language the person speaks' },
        category: { type: 'string', enum: ['preference', 'goal', 'context', 'communication', 'other'] },
      },
      required: ['text'],
    },
  },
]

// El workspace sale de AGENTOS_WORKSPACE si está definido; si no, el servidor lo deduce de la carpeta de trabajo (cwd) de esta sesión.
// Así un agente del workspace B nunca ve las tareas ni los equipos del workspace A.
const scopeHeaders = () => (process.env.AGENTOS_WORKSPACE ? { 'x-agentos-workspace': process.env.AGENTOS_WORKSPACE } : { 'x-agentos-cwd': process.cwd() })

async function api(method, path, body, workspace) {
  const r = await fetch(baseUrl + path, {
    method,
    headers: { 'content-type': 'application/json', ...(workspace ? { 'x-agentos-workspace': workspace } : scopeHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  const json = text ? JSON.parse(text) : null
  if (!r.ok) throw new Error(json?.message || json?.error || `HTTP ${r.status}`)
  return json
}

// Valida el id de proyecto contra el servidor; el error lista los ids válidos.
async function targetWorkspace(id) {
  if (id === undefined || id === null || id === '') return undefined
  const list = await api('GET', '/api/workspaces')
  if (!list.some((w) => w.id === String(id))) throw new Error(`Unknown workspace "${id}". Valid project ids: ${list.map((w) => w.id).join(', ')} (see agentos_projects).`)
  return String(id)
}

async function callTool(name, a = {}) {
  await ensureServer()
  if (name === 'agentos_projects') return api('GET', '/api/projects')
  if (name === 'agentos_overview' && a.workspace === 'all') return { projects: await api('GET', '/api/projects'), hint: 'Per-project summary. Call agentos_overview with a project id as `workspace` for the full detail.' }
  const { workspace, ...args } = a
  const ws = await targetWorkspace(workspace)
  a = args
  switch (name) {
    case 'agentos_task_create':
      return api('POST', '/api/tasks', a, ws)
    case 'agentos_task_update': {
      const { id, ...patch } = a
      return api('PATCH', `/api/tasks/${id}`, patch, ws)
    }
    case 'agentos_task_deliver': {
      const { id, ...out } = a
      return api('POST', `/api/tasks/${id}/outputs`, out, ws)
    }
    case 'agentos_file_write':
      return api('POST', '/api/files/write', a, ws)
    case 'agentos_file_read':
      return api('GET', `/api/files/read?path=${encodeURIComponent(a.path ?? '')}${a.max_bytes ? `&max_bytes=${encodeURIComponent(a.max_bytes)}` : ''}`, undefined, ws)
    case 'agentos_file_list':
      return api('GET', `/api/files/list?prefix=${encodeURIComponent(a.prefix ?? '')}${a.recursive ? '&recursive=1' : ''}${a.cursor ? `&cursor=${encodeURIComponent(a.cursor)}` : ''}`, undefined, ws)
    case 'agentos_file_delete':
      return api('POST', '/api/files/delete', { path: a.path }, ws)
    case 'agentos_file_move':
      return api('POST', '/api/files/move', { from: a.from, to: a.to }, ws)
    case 'agentos_task_list': {
      const all = await api('GET', '/api/tasks', undefined, ws)
      return a.status ? all.filter((t) => t.status === a.status) : all
    }
    case 'agentos_lead_create':
      return api('POST', '/api/leads', a, ws)
    case 'agentos_lead_update': {
      const { id, ...patch } = a
      return api('PATCH', `/api/leads/${id}`, patch, ws)
    }
    case 'agentos_lead_list':
      return api('GET', `/api/leads?${a.stage ? `stage=${encodeURIComponent(a.stage)}&` : ''}${a.query ? `query=${encodeURIComponent(a.query)}` : ''}`, undefined, ws)
    case 'agentos_whatsapp_inbox':
      return api('GET', `/api/whatsapp/chats?only_unanswered=${a.only_unanswered === false ? 0 : 1}&recent=5${a.limit ? `&limit=${encodeURIComponent(a.limit)}` : ''}`, undefined, ws)
    case 'agentos_whatsapp_draft': {
      const d = await api('POST', '/api/whatsapp/drafts', { ...a, created_by: process.env.AGENTOS_AGENT || 'agent' }, ws)
      return { ...d, note: 'Borrador creado: la persona lo revisa y lo envía desde la web (los agentes no envían).' }
    }
    case 'agentos_checkin':
      return api('POST', '/api/checkin', a)
    case 'agentos_overview':
      return api('GET', '/api/overview', undefined, ws)
    case 'agentos_roster':
      return api('GET', `/api/roster?${a.plugin ? `plugin=${encodeURIComponent(a.plugin)}&` : ''}${a.agent ? `agent=${encodeURIComponent(a.agent)}` : ''}`)
    case 'agentos_profile_read':
      return api('GET', `/api/profile?insights=${encodeURIComponent(a.insights ?? 20)}`)
    case 'agentos_profile_update':
      return api('PATCH', '/api/profile', a)
    case 'agentos_profile_note':
      return api('POST', '/api/profile/insights', { text: a.text, category: a.category, source: 'assistant' })
    case 'agentos_team_context':
      return api('GET', `/api/context?agent=${encodeURIComponent(a.agent ?? '')}`)
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}

export async function handle(msg) {
  const { id, method, params } = msg
  if (id === undefined) return null // notificaciones (initialized, cancelled...) no llevan respuesta
  const ok = (result) => ({ jsonrpc: '2.0', id, result })
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'agentos', version: '0.1.0' },
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: TOOLS })
    case 'tools/call':
      try {
        const out = await callTool(params.name, params.arguments)
        return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] })
      } catch (e) {
        return ok({ isError: true, content: [{ type: 'text', text: e.message }] })
      }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } }
  }
}

if (isMain(import.meta.url)) {
  const rl = createInterface({ input: process.stdin })
  rl.on('line', async (line) => {
    if (!line.trim()) return
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const res = await handle(msg)
    if (res) process.stdout.write(JSON.stringify(res) + '\n')
  })
}
