'use client'
// Upload queue runner: concurrency, progress, cancel, collisions. State transitions live in files.ts (tested).
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { MAX_UPLOAD_BYTES, baseName, contentTypeFor, dirOfKey, initialUploads, uniqueName, uploadLimitMessage, uploadReducer, uploadSummary } from './files'
import { createFolder, putFile, type UploadHandle } from './fileApi'

export interface PendingFile { rel: string; file: File }
export type CollisionChoice = 'replace' | 'both' | 'skip' | 'cancel'

const CONCURRENCY = 3

interface Opts {
  workspace: string
  /** Keys that already exist (any folder), used to detect collisions. */
  existingKeys: () => Set<string>
  /** Ask the person what to do with names that already exist. */
  askCollision: (names: string[]) => Promise<CollisionChoice>
  limitBytes?: number
  onKeyDone?: (key: string) => void
  /** Called when everything queued finished (done/error/cancelled). */
  onBatchEnd?: (s: ReturnType<typeof uploadSummary>) => void
  onNotice?: (text: string) => void
}

export function useUploads(o: Opts) {
  const [state, dispatch] = useReducer(uploadReducer, initialUploads)
  const filesRef = useRef(new Map<number, File>())
  const handles = useRef(new Map<number, UploadHandle>())
  const started = useRef(new Set<number>())
  const optsRef = useRef(o)
  optsRef.current = o
  const idCounter = useRef(1)
  const wasActive = useRef(false)

  const add = useCallback(async (pending: PendingFile[], destPrefix: string, emptyDirs: string[] = []) => {
    const op = optsRef.current
    const limit = op.limitBytes ?? MAX_UPLOAD_BYTES
    const existing = op.existingKeys()
    let list = pending.map((p) => ({ ...p, key: destPrefix + p.rel, overwrite: false }))
    const clash = list.filter((p) => existing.has(p.key) && p.file.size <= limit)
    let skipped = 0
    if (clash.length) {
      const choice = await op.askCollision(clash.map((p) => p.rel))
      if (choice === 'cancel') return
      if (choice === 'skip') { const c = new Set(clash.map((p) => p.key)); skipped = c.size; list = list.filter((p) => !c.has(p.key)) }
      else if (choice === 'replace') list = list.map((p) => (existing.has(p.key) ? { ...p, overwrite: true } : p))
      else {
        const taken = new Set(existing)
        list = list.map((p) => {
          if (!existing.has(p.key)) { taken.add(p.key); return p }
          const dir = dirOfKey(p.key)
          const name = uniqueName(baseName(p.key), (n) => taken.has(dir + n))
          const key = dir + name
          taken.add(key)
          return { ...p, key, rel: p.rel.slice(0, p.rel.length - baseName(p.rel).length) + name }
        })
      }
    }
    if (skipped) op.onNotice?.(`${skipped} ${skipped === 1 ? 'archivo omitido' : 'archivos omitidos'}: ya existían.`)
    for (const d of emptyDirs) { try { await createFolder(op.workspace, destPrefix + d) } catch { /* exists already */ } }
    if (!list.length) return
    // Reserve ids the same way the reducer will assign them so we can map files to items.
    const firstId = idCounter.current
    idCounter.current += list.length
    list.forEach((p, i) => { if (p.file.size <= limit) filesRef.current.set(firstId + i, p.file) })
    dispatch({
      type: 'add',
      items: list.map((p) => ({ name: p.rel, key: p.key, size: p.file.size, overwrite: p.overwrite, error: p.file.size > limit ? uploadLimitMessage(baseName(p.rel), p.file.size, limit) : undefined })),
    })
  }, [])

  const cancel = useCallback((id: number) => {
    handles.current.get(id)?.abort()
    dispatch({ type: 'cancel', id })
  }, [])
  const cancelAll = useCallback(() => { for (const i of state.items) if (i.status === 'queued' || i.status === 'uploading') cancel(i.id) }, [state.items, cancel])
  const clearFinished = useCallback(() => dispatch({ type: 'clear-finished' }), [])

  // Runner
  useEffect(() => {
    let slots = CONCURRENCY - state.items.filter((i) => i.status === 'uploading').length
    for (const it of state.items) {
      if (slots <= 0) break
      if (it.status !== 'queued' || started.current.has(it.id)) continue
      const file = filesRef.current.get(it.id)
      if (!file) continue
      slots--
      started.current.add(it.id)
      dispatch({ type: 'start', id: it.id })
      const h = putFile(optsRef.current.workspace, it.key, file, contentTypeFor(it.name, file.type), it.overwrite, (loaded) => dispatch({ type: 'progress', id: it.id, loaded }))
      handles.current.set(it.id, h)
      h.promise
        .then(() => { dispatch({ type: 'done', id: it.id }); optsRef.current.onKeyDone?.(it.key) })
        .catch((e) => {
          if (e.status === -1) return // cancelled by the person
          if (e.status === 409 && !it.overwrite) {
            // Someone created it between the check and the upload: keep both.
            const dir = dirOfKey(it.key)
            const key = dir + uniqueName(baseName(it.key), (n) => optsRef.current.existingKeys().has(dir + n) || n === baseName(it.key))
            started.current.delete(it.id)
            dispatch({ type: 'retarget', id: it.id, key, overwrite: false })
            return
          }
          dispatch({ type: 'fail', id: it.id, error: e.message })
        })
        .finally(() => { handles.current.delete(it.id) })
    }
  }, [state.items])

  const summary = uploadSummary(state.items)
  useEffect(() => {
    if (summary.active > 0) wasActive.current = true
    else if (wasActive.current) { wasActive.current = false; optsRef.current.onBatchEnd?.(summary) }
  }, [summary])

  return { items: state.items, summary, add, cancel, cancelAll, clearFinished }
}

// ---- drag & drop helpers --------------------------------------------------------------------------------

export const hasFiles = (dt: DataTransfer | null): boolean => !!dt && Array.from(dt.types ?? []).includes('Files')

/** Files from an <input>: keeps webkitRelativePath so folders upload with their structure. */
export function fromInput(list: FileList | null): PendingFile[] {
  return Array.from(list ?? []).map((file) => ({ file, rel: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }))
}

const readAll = (reader: any): Promise<any[]> =>
  new Promise((resolve, reject) => {
    const out: any[] = []
    const step = () => reader.readEntries((batch: any[]) => { if (!batch.length) resolve(out); else { out.push(...batch); step() } }, reject)
    step()
  })

/** Walks dropped files and folders. Call synchronously inside the drop handler (items die after the event). */
export function collectDrop(dt: DataTransfer): Promise<{ files: PendingFile[]; emptyDirs: string[] }> {
  const roots = Array.from(dt.items ?? []).map((i) => (i.kind === 'file' ? (i as any).webkitGetAsEntry?.() : null)).filter(Boolean)
  const plain = Array.from(dt.files ?? [])
  if (!roots.length) return Promise.resolve({ files: plain.map((file) => ({ file, rel: file.name })), emptyDirs: [] })
  const files: PendingFile[] = []
  const emptyDirs: string[] = []
  const walk = async (entry: any, path: string): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((res, rej) => entry.file(res, rej))
      files.push({ file, rel: path + entry.name })
    } else if (entry.isDirectory) {
      const children = await readAll(entry.createReader())
      if (!children.length) emptyDirs.push(path + entry.name)
      for (const c of children) await walk(c, path + entry.name + '/')
    }
  }
  return Promise.all(roots.map((r) => walk(r, ''))).then(() => ({ files, emptyDirs }))
}
