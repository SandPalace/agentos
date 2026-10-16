'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { FILES_ROOT, ZONE_LABEL, folderDepth, folderPrefixes, isInside, validateName, baseName } from '@/lib/files'
import type { FileEntry, FolderEntry } from '@/lib/files'
import type { CollisionChoice } from '@/lib/useUploads'

const BTN = 'rounded-full border border-line px-4 py-1.5 text-xs font-semibold hover:bg-bg disabled:opacity-40'
const PRIMARY = 'rounded-full bg-blue px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-line px-5 py-3"><div className="label">{title}</div></div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </>
  )
}

/** Rename a file or folder. `siblings` are the other names in the same folder. */
export function RenameModal({ name, isFolder, siblings, onSubmit, onClose }: { name: string; isFolder: boolean; siblings: Set<string>; onSubmit: (n: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState(name)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    const dot = isFolder ? -1 : name.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : name.length)
  }, [name, isFolder])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    const bad = validateName(v)
    if (bad) return setErr(bad)
    if (v === name) return onClose()
    if (siblings.has(v)) return setErr(`Ya existe "${v}" en esta carpeta.`)
    setBusy(true); setErr(null)
    try { await onSubmit(v); onClose() } catch (x) { setErr((x as Error).message); setBusy(false) }
  }
  return (
    <Modal title={isFolder ? 'Renombrar carpeta' : 'Renombrar archivo'} onClose={onClose}>
      <Shell title={isFolder ? 'Renombrar carpeta' : 'Renombrar archivo'}>
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <label className="text-xs font-semibold" htmlFor="rename-input">Nuevo nombre</label>
          <input id="rename-input" ref={input} value={value} onChange={(e) => { setValue(e.target.value); setErr(null) }} aria-invalid={!!err} aria-describedby={err ? 'rename-err' : undefined} className="rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-blue" />
          {err && <p id="rename-err" role="alert" className="text-xs text-red">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={BTN} onClick={onClose}>Cancelar</button><button type="submit" className={PRIMARY} disabled={busy}>{busy ? 'Guardando…' : 'Renombrar'}</button></div>
        </form>
      </Shell>
    </Modal>
  )
}

export function NewFolderModal({ siblings, where, onSubmit, onClose }: { siblings: Set<string>; where: string; onSubmit: (n: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    const bad = validateName(v)
    if (bad) return setErr(bad)
    if (siblings.has(v)) return setErr(`Ya existe "${v}" en esta carpeta.`)
    setBusy(true); setErr(null)
    try { await onSubmit(v); onClose() } catch (x) { setErr((x as Error).message); setBusy(false) }
  }
  return (
    <Modal title="Nueva carpeta" onClose={onClose} initialFocus="input">
      <Shell title="Nueva carpeta">
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <p className="text-xs text-muted">Se crea en «{where}».</p>
          <label className="text-xs font-semibold" htmlFor="folder-input">Nombre de la carpeta</label>
          <input id="folder-input" value={value} onChange={(e) => { setValue(e.target.value); setErr(null) }} aria-invalid={!!err} className="rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-blue" placeholder="Ej. Contratos 2026" />
          {err && <p role="alert" className="text-xs text-red">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={BTN} onClick={onClose}>Cancelar</button><button type="submit" className={PRIMARY} disabled={busy}>{busy ? 'Creando…' : 'Crear carpeta'}</button></div>
        </form>
      </Shell>
    </Modal>
  )
}

/** Folder picker for moving items. `blocked` folders (the items themselves and their descendants) are disabled. */
export function MoveModal({ count, files, folders, blocked, current, onSubmit, onClose }: {
  count: number; files: FileEntry[]; folders: FolderEntry[]; blocked: string[]; current: string
  onSubmit: (dest: string) => Promise<void>; onClose: () => void
}) {
  const list = useMemo(() => folderPrefixes(FILES_ROOT, files, folders), [files, folders])
  const [dest, setDest] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rows = [FILES_ROOT, ...list]
  const disabled = (p: string) => p === current || blocked.some((b) => isInside(p, b))
  const submit = async () => {
    if (dest == null) return
    setBusy(true); setErr(null)
    try { await onSubmit(dest); onClose() } catch (x) { setErr((x as Error).message); setBusy(false) }
  }
  return (
    <Modal title="Mover a…" onClose={onClose} initialFocus="[role=radio]:not([aria-disabled=true])">
      <Shell title={`Mover ${count === 1 ? '1 elemento' : `${count} elementos`}`}>
        <div role="radiogroup" aria-label="Carpeta de destino" className="max-h-[50vh] flex-1 overflow-y-auto p-2">
          {rows.map((p) => {
            const off = disabled(p)
            const name = p === FILES_ROOT ? ZONE_LABEL.files : baseName(p)
            const depth = p === FILES_ROOT ? 0 : folderDepth(FILES_ROOT, p)
            return (
              <button
                key={p} role="radio" aria-checked={dest === p} aria-disabled={off} disabled={off} onClick={() => setDest(p)}
                style={{ paddingLeft: 8 + depth * 16 }}
                className={`flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 text-left text-xs ${dest === p ? 'bg-blue-soft font-semibold text-blue' : 'hover:bg-bg'} disabled:opacity-40`}
              >
                <span aria-hidden className="inline-block h-3 w-4 flex-none rounded-sm bg-amber" />
                <span className="truncate">{name}</span>
                {p === current && <span className="ml-auto text-[10px] text-muted">carpeta actual</span>}
              </button>
            )
          })}
        </div>
        {err && <p role="alert" className="border-t border-line bg-red-soft px-5 py-2 text-xs text-red">{err}</p>}
        <div className="flex justify-end gap-2 border-t border-line p-4"><button className={BTN} onClick={onClose}>Cancelar</button><button className={PRIMARY} disabled={dest == null || busy} onClick={submit}>{busy ? 'Moviendo…' : 'Mover aquí'}</button></div>
      </Shell>
    </Modal>
  )
}

export function CollisionModal({ names, onChoose }: { names: string[]; onChoose: (c: CollisionChoice) => void }) {
  return (
    <Modal title="Nombres repetidos" onClose={() => onChoose('cancel')}>
      <Shell title="Ya existe en esta carpeta">
        <div className="flex flex-col gap-3 p-5 text-xs leading-relaxed">
          <p>{names.length === 1 ? 'Ya hay un archivo con este nombre:' : `Ya hay ${names.length} archivos con estos nombres:`}</p>
          <ul className="max-h-32 list-disc overflow-y-auto pl-5 font-semibold">{names.slice(0, 8).map((n) => <li key={n} className="break-all">{n}</li>)}{names.length > 8 && <li className="list-none text-muted">…y {names.length - 8} más</li>}</ul>
          <p className="text-muted">¿Qué quieres hacer?</p>
          <div className="flex flex-col gap-2">
            <button className={PRIMARY} onClick={() => onChoose('both')}>Conservar ambos (se agrega un número)</button>
            <button className={BTN} onClick={() => onChoose('replace')}>Reemplazar el existente</button>
            <button className={BTN} onClick={() => onChoose('skip')}>Omitir los repetidos</button>
            <button className="text-xs font-semibold text-muted hover:text-ink" onClick={() => onChoose('cancel')}>Cancelar subida</button>
          </div>
        </div>
      </Shell>
    </Modal>
  )
}

