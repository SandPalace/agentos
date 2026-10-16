// Pure helpers for delivered files and the file manager (no React, unit-tested).
import type { Output } from './types'

export type PreviewKind = 'image' | 'markdown' | 'text' | 'csv' | 'html' | 'pdf' | 'none'

const EXT: Record<string, PreviewKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image',
  md: 'markdown', markdown: 'markdown',
  txt: 'text', log: 'text', json: 'text', yml: 'text', yaml: 'text', xml: 'text', ts: 'text', tsx: 'text', js: 'text', mjs: 'text', py: 'text', css: 'text',
  csv: 'csv', tsv: 'csv',
  html: 'html', htm: 'html',
  pdf: 'pdf',
}

export const extOf = (name: string): string => {
  const base = name.split('/').pop() ?? name
  const i = base.lastIndexOf('.')
  return i <= 0 ? '' : base.slice(i + 1).toLowerCase()
}

/** Decide how a file is previewed. The content type wins; the extension is the fallback. */
export function previewKind(contentType: string | null | undefined, name: string): PreviewKind {
  const ct = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (ct.startsWith('image/')) return 'image'
  if (ct === 'text/markdown') return 'markdown'
  if (ct === 'text/csv' || ct === 'text/tab-separated-values') return 'csv'
  if (ct === 'text/html' || ct === 'application/xhtml+xml') return 'html'
  if (ct === 'application/pdf') return 'pdf'
  if (ct.startsWith('text/') && ct !== 'text/plain') return 'text'
  if (ct === 'application/json' || ct === 'application/xml') return 'text'
  // text/plain, octet-stream, empty: trust the extension
  return EXT[extOf(name)] ?? (ct === 'text/plain' ? 'text' : 'none')
}

export function formatSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export type StorageBadge = { kind: 'stored' | 'error' | 'link'; label: string }

/** Badge of a delivery: "Enlace", "Error al guardar", "Guardado en Archivos", or none when it only exists on disk. */
export function storageBadge(o: Pick<Output, 'kind' | 'stored' | 'storage_error'>): StorageBadge | null {
  if (o.kind === 'link') return { kind: 'link', label: 'Enlace' }
  if (o.storage_error) return { kind: 'error', label: 'Error al guardar' }
  if (o.stored) return { kind: 'stored', label: 'Guardado en Archivos' }
  return null
}

const enc = (s: string) => encodeURIComponent(s)

export function outputFileUrl(server: string, workspace: string, outputId: number, opts: { file?: string; download?: boolean } = {}): string {
  const q = [`workspace=${enc(workspace)}`]
  if (opts.file) q.push(`file=${enc(opts.file)}`)
  if (opts.download) q.push('download=1')
  return `${server}/api/files/${outputId}?${q.join('&')}`
}

export function objectUrl(server: string, workspace: string, key: string, download = false): string {
  return `${server}/api/workspaces/${enc(workspace)}/object?key=${enc(key)}${download ? '&download=1' : ''}`
}

export function listingUrl(server: string, workspace: string, prefix: string, opts: { recursive?: boolean; cursor?: string | null; includeTrash?: boolean; limit?: number } = {}): string {
  let u = `${server}/api/workspaces/${enc(workspace)}/files?prefix=${enc(prefix)}`
  if (opts.recursive) u += '&recursive=1'
  if (opts.limit) u += `&limit=${opts.limit}`
  if (opts.cursor) u += `&cursor=${enc(opts.cursor)}`
  if (opts.includeTrash) u += '&include_trash=1'
  return u
}

/** Only http(s) links are opened from a delivery of kind "link". */
export function safeLink(path: string): string | null {
  try {
    const u = new URL(path)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Minimal RFC-4180-ish CSV/TSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === delimiter) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// ---------------------------------------------------------------------------------------------------------
// File manager logic. The person works with "zones" of the workspace bucket:
//   files/   editable team files        outputs/  read-only task deliveries        trash/  soft-deleted items
// ---------------------------------------------------------------------------------------------------------

export const FILES_ROOT = 'files/'
export const OUTPUTS_ROOT = 'outputs/'
export const TRASH_ROOT = 'trash/'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const MAX_EDIT_BYTES = 1024 * 1024

export type Zone = 'files' | 'outputs' | 'trash'

export interface FileEntry { key: string; name: string; size: number; last_modified: string | number | null; content_type: string }
export interface FolderEntry { prefix: string; name: string }

export const zoneOf = (prefix: string): Zone => (prefix.startsWith(TRASH_ROOT) ? 'trash' : prefix.startsWith(OUTPUTS_ROOT) ? 'outputs' : 'files')
export const zoneRoot = (z: Zone): string => (z === 'trash' ? TRASH_ROOT : z === 'outputs' ? OUTPUTS_ROOT : FILES_ROOT)
export const ZONE_LABEL: Record<Zone, string> = { files: 'Archivos del equipo', outputs: 'Entregas de tareas', trash: 'Papelera' }

/** Normalizes a ?prefix= value into a folder prefix inside a known zone (always ends with "/"). */
export function normalizePrefix(raw: string | null | undefined): string {
  let p = (raw ?? '').trim().replace(/^\/+/, '')
  if (!p || p === 'files' || p === 'files/') return FILES_ROOT
  if (!/^(files|outputs|trash)(\/|$)/.test(p)) p = FILES_ROOT + p
  if (p.split('/').includes('..')) return FILES_ROOT
  return p.endsWith('/') ? p : p + '/'
}

/** Breadcrumbs inside a zone: the first crumb is the zone root ("Archivos del equipo"). */
export function zoneCrumbs(prefix: string): { name: string; prefix: string }[] {
  const z = zoneOf(prefix)
  const root = zoneRoot(z)
  const rest = prefix.slice(root.length).split('/').filter(Boolean)
  return [{ name: ZONE_LABEL[z], prefix: root }, ...rest.map((name, i) => ({ name, prefix: root + rest.slice(0, i + 1).join('/') + '/' }))]
}

export const parentPrefix = (prefix: string): string => {
  const parts = prefix.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? parts.join('/') + '/' : ''
}
export const baseName = (keyOrPrefix: string): string => keyOrPrefix.split('/').filter(Boolean).pop() ?? keyOrPrefix
/** Folder containing an item key ("files/a/b.md" -> "files/a/"). */
export const dirOfKey = (key: string): string => key.slice(0, key.lastIndexOf('/') + 1)
export const stripSlash = (p: string): string => p.replace(/\/+$/, '')

/** Folder to open in the manager for a delivery's storage key, or null if it does not live in files/ or outputs/. */
export function deliveryFolder(storageKey: string | null | undefined): string | null {
  if (!storageKey || !/^(files|outputs)\//.test(storageKey) || storageKey.split('/').includes('..')) return null
  const dir = dirOfKey(storageKey)
  return dir.length > storageKey.split('/')[0].length + 1 ? dir : storageKey.split('/')[0] + '/'
}
export const archivosHref = (prefix: string): string => `/archivos?prefix=${enc(prefix)}`

export interface FolderRow { prefix: string; name: string; count: number; size: number; last_modified: string | number | null }

/** Direct children (folders + files) of `prefix`, derived from a recursive listing. Hidden .keep files never show. */
export function childrenOf(prefix: string, files: FileEntry[], folders: FolderEntry[] = []): { folders: FolderRow[]; files: FileEntry[] } {
  const dirs = new Map<string, FolderRow>()
  const out: FileEntry[] = []
  const touch = (name: string): FolderRow => {
    let d = dirs.get(name)
    if (!d) { d = { prefix: prefix + name + '/', name, count: 0, size: 0, last_modified: null }; dirs.set(name, d) }
    return d
  }
  for (const f of folders) {
    if (!f.prefix.startsWith(prefix) || f.prefix === prefix) continue
    touch(f.prefix.slice(prefix.length).split('/')[0])
  }
  for (const f of files) {
    if (!f.key.startsWith(prefix)) continue
    const rest = f.key.slice(prefix.length)
    if (!rest || rest.split('/').pop() === '.keep') {
      if (rest.includes('/')) touch(rest.split('/')[0])
      continue
    }
    const slash = rest.indexOf('/')
    if (slash < 0) out.push({ ...f, name: rest })
    else {
      const d = touch(rest.slice(0, slash))
      d.count++
      d.size += f.size ?? 0
      if (f.last_modified != null && (d.last_modified == null || new Date(f.last_modified) > new Date(d.last_modified))) d.last_modified = f.last_modified
    }
  }
  return { folders: [...dirs.values()], files: out }
}

/** Case-insensitive name search under `prefix` (recursive). Files carry their relative path as `name`. */
export function searchEntries(prefix: string, files: FileEntry[], folders: FolderEntry[], query: string): { folders: FolderRow[]; files: FileEntry[] } {
  const q = query.trim().toLowerCase()
  if (!q) return childrenOf(prefix, files, folders)
  const fl = files.filter((f) => f.key.startsWith(prefix) && baseName(f.key) !== '.keep' && baseName(f.key).toLowerCase().includes(q)).map((f) => ({ ...f, name: f.key.slice(prefix.length) }))
  const dl = folders
    .filter((f) => f.prefix.startsWith(prefix) && f.prefix !== prefix && baseName(f.prefix).toLowerCase().includes(q))
    .map((f) => ({ prefix: f.prefix, name: f.prefix.slice(prefix.length).replace(/\/$/, ''), count: files.filter((x) => x.key.startsWith(f.prefix)).length, size: 0, last_modified: null as string | number | null }))
  return { folders: dl, files: fl }
}

export type SortField = 'name' | 'date' | 'size'
export type SortDir = 'asc' | 'desc'
const ts = (v: string | number | null | undefined) => { const t = v == null ? 0 : new Date(v).getTime(); return Number.isNaN(t) ? 0 : t }

/** Folders first, then files; stable and locale-aware ("a2" < "a10"). */
export function sortRows<T extends { name: string; size?: number; last_modified?: string | number | null }>(rows: T[], field: SortField, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  const cmpName = (a: T, b: T) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
  return rows.slice().sort((a, b) => {
    const c = field === 'date' ? ts(a.last_modified) - ts(b.last_modified) : field === 'size' ? (a.size ?? 0) - (b.size ?? 0) : cmpName(a, b)
    return c !== 0 ? c * sign : cmpName(a, b)
  })
}

/** Validates a single file/folder name typed by the person. Returns a Spanish error or null. */
export function validateName(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Escribe un nombre.'
  if (n === '.' || n === '..') return 'Ese nombre no es válido.'
  if (/[\/\\]/.test(n)) return 'El nombre no puede incluir / ni \\.'
  if (/[\u0000-\u001f]/.test(n)) return 'El nombre tiene caracteres no válidos.'
  if (n.length > 180) return 'El nombre es demasiado largo (máximo 180 caracteres).'
  return null
}

/** "informe.pdf" taken -> "informe (1).pdf", then "(2)"... `taken` is compared case-sensitively. */
export function uniqueName(name: string, taken: Set<string> | ((n: string) => boolean)): string {
  const has = typeof taken === 'function' ? taken : (n: string) => taken.has(n)
  if (!has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 1; i < 10_000; i++) {
    const c = `${stem} (${i})${ext}`
    if (!has(c)) return c
  }
  return `${stem} (${Date.now()})${ext}`
}

export interface TrashItem { id: string; ts: number; trashKey: string; originalKey: string; name: string; isFolder: boolean; count: number; size: number; date: number }

/** Splits "trash/<ts>/files/a/b.md" into its parts; null when it is not a trash key. */
export function parseTrashKey(key: string): { ts: number; originalKey: string } | null {
  const m = /^trash\/(\d+)\/(.+)$/.exec(key)
  return m ? { ts: Number(m[1]), originalKey: m[2] } : null
}

/**
 * Groups a recursive listing of trash/ into restorable items: one per delete operation (timestamp). When a
 * delete removed a folder, its files share a common directory deeper than the root, which is the item.
 */
export function trashItems(files: FileEntry[]): TrashItem[] {
  const groups = new Map<number, { f: FileEntry; original: string }[]>()
  for (const f of files) {
    const p = parseTrashKey(f.key)
    if (!p || baseName(f.key) === '.keep') continue
    ;(groups.get(p.ts) ?? groups.set(p.ts, []).get(p.ts)!).push({ f, original: p.originalKey })
  }
  const items: TrashItem[] = []
  const add = (ts: number, originalKey: string, isFolder: boolean, list: { f: FileEntry }[]) => {
    items.push({
      id: `${ts}:${originalKey}`, ts, trashKey: `trash/${ts}/${originalKey}`, originalKey, name: baseName(originalKey), isFolder,
      count: list.length, size: list.reduce((s, x) => s + (x.f.size ?? 0), 0), date: ts,
    })
  }
  for (const [t, list] of groups) {
    if (list.length === 1) { add(t, list[0].original, false, list); continue }
    const dirs = list.map((x) => x.original.split('/').slice(0, -1))
    let common = dirs[0]
    for (const d of dirs) { let i = 0; while (i < common.length && i < d.length && common[i] === d[i]) i++; common = common.slice(0, i) }
    if (common.length > 1) add(t, common.join('/'), true, list)
    else for (const x of list) add(t, x.original, false, [x])
  }
  return items.sort((a, b) => b.date - a.date || a.name.localeCompare(b.name))
}

const CT: Record<string, string> = {
  md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  html: 'text/html', htm: 'text/html', xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip',
}
/** Content type to send on upload: the browser's when it has one, else from the extension. */
export function contentTypeFor(name: string, browserType?: string | null): string {
  const t = (browserType ?? '').trim()
  return t && t !== 'application/octet-stream' ? t : CT[extOf(name)] ?? 'application/octet-stream'
}

/** Text-like files that can be edited inline (size is checked separately). */
export function isEditable(contentType: string | null | undefined, name: string): boolean {
  const k = previewKind(contentType, name)
  return k === 'markdown' || k === 'text' || k === 'csv' || k === 'html'
}

export function uploadLimitMessage(name: string, size: number, limit = MAX_UPLOAD_BYTES): string {
  return `"${name}" pesa ${formatSize(size)} y el límite es ${formatSize(limit)} por archivo. Divídelo o comprímelo e inténtalo de nuevo.`
}

export const objectPutUrl = (server: string, workspace: string, key: string, overwrite = true): string =>
  `${server}/api/workspaces/${enc(workspace)}/object?key=${enc(key)}${overwrite ? '' : '&overwrite=0'}`
export const zipUrl = (server: string, workspace: string, prefix: string): string => `${server}/api/workspaces/${enc(workspace)}/zip?prefix=${enc(stripSlash(prefix))}`

// ---- upload queue (pure state; the component runs the XHRs) ------------------------------------------------

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled' | 'skipped'
export interface UploadItem { id: number; name: string; key: string; size: number; loaded: number; status: UploadStatus; error?: string; overwrite: boolean }
export interface UploadState { items: UploadItem[]; nextId: number }
export type UploadAction =
  | { type: 'add'; items: { name: string; key: string; size: number; overwrite: boolean; error?: string }[] }
  | { type: 'start'; id: number }
  | { type: 'progress'; id: number; loaded: number }
  | { type: 'done'; id: number }
  | { type: 'fail'; id: number; error: string }
  | { type: 'cancel'; id: number }
  | { type: 'retarget'; id: number; key: string; overwrite: boolean }
  | { type: 'clear-finished' }

export const initialUploads: UploadState = { items: [], nextId: 1 }

export function uploadReducer(s: UploadState, a: UploadAction): UploadState {
  const upd = (id: number, fn: (i: UploadItem) => UploadItem) => ({ ...s, items: s.items.map((i) => (i.id === id ? fn(i) : i)) })
  switch (a.type) {
    case 'add': {
      let id = s.nextId
      const items = a.items.map((x): UploadItem => ({ id: id++, name: x.name, key: x.key, size: x.size, loaded: 0, overwrite: x.overwrite, status: x.error ? 'error' : 'queued', error: x.error }))
      return { items: [...s.items, ...items], nextId: id }
    }
    case 'start': return upd(a.id, (i) => ({ ...i, status: 'uploading', loaded: 0 }))
    case 'progress': return upd(a.id, (i) => (i.status === 'uploading' ? { ...i, loaded: Math.min(a.loaded, i.size) } : i))
    case 'done': return upd(a.id, (i) => ({ ...i, status: 'done', loaded: i.size, error: undefined }))
    case 'fail': return upd(a.id, (i) => ({ ...i, status: 'error', error: a.error }))
    case 'cancel': return upd(a.id, (i) => (i.status === 'queued' || i.status === 'uploading' ? { ...i, status: 'cancelled' } : i))
    case 'retarget': return upd(a.id, (i) => ({ ...i, key: a.key, overwrite: a.overwrite, status: 'queued', loaded: 0 }))
    case 'clear-finished': return { ...s, items: s.items.filter((i) => i.status === 'queued' || i.status === 'uploading') }
  }
}

export function uploadSummary(items: UploadItem[]): { total: number; done: number; failed: number; active: number; bytes: number; loaded: number; pct: number } {
  const live = items.filter((i) => i.status !== 'skipped' && i.status !== 'cancelled')
  const bytes = live.reduce((n, i) => n + i.size, 0)
  const loaded = live.reduce((n, i) => n + (i.status === 'done' ? i.size : i.loaded), 0)
  return {
    total: live.length, done: live.filter((i) => i.status === 'done').length, failed: live.filter((i) => i.status === 'error').length,
    active: live.filter((i) => i.status === 'queued' || i.status === 'uploading').length, bytes, loaded, pct: bytes ? Math.round((loaded / bytes) * 100) : live.length ? 100 : 0,
  }
}

/** Every folder prefix under `root` (including ancestors of files and listed empty folders), sorted by path. */
export function folderPrefixes(root: string, files: { key: string }[], folders: { prefix: string }[]): string[] {
  const set = new Set<string>()
  const addChain = (p: string) => {
    const parts = p.slice(root.length).split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) set.add(root + parts.slice(0, i).join('/') + '/')
  }
  for (const f of folders) if (f.prefix.startsWith(root)) addChain(f.prefix)
  for (const f of files) if (f.key.startsWith(root) && f.key.lastIndexOf('/') + 1 > root.length) addChain(dirOfKey(f.key))
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
}

/** Depth of a folder prefix under its root (files/a/b/ under files/ = 2). */
export const folderDepth = (root: string, prefix: string): number => prefix.slice(root.length).split('/').filter(Boolean).length
/** True when `prefix` is `of` or lives inside it. */
export const isInside = (prefix: string, of: string): boolean => prefix === of || prefix.startsWith(of)
