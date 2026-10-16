'use client'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Open modals, innermost last: only the top one reacts to Escape (also when focus fell back to <body>).
const stack: symbol[] = []

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Accessible modal: portal, aria-modal, Esc closes, Tab is trapped, focus returns to the opener.
export default function Modal({ title, onClose, children, wide = false, initialFocus }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; initialFocus?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = box.current
    const first = (initialFocus ? el?.querySelector<HTMLElement>(initialFocus) : null) ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => opener?.focus?.()
  }, [initialFocus])
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const id = Symbol('modal')
    stack.push(id)
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && stack[stack.length - 1] === id) { e.stopPropagation(); closeRef.current() } }
    document.addEventListener('keydown', h)
    return () => { document.removeEventListener('keydown', h); stack.splice(stack.indexOf(id), 1) }
  }, [])
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (!items.length) return
    const a = document.activeElement
    if (e.shiftKey && a === items[0]) { e.preventDefault(); items[items.length - 1].focus() }
    else if (!e.shiftKey && a === items[items.length - 1]) { e.preventDefault(); items[0].focus() }
  }
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-ink/40 p-4" style={{ zIndex: 2147483647 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown} className={`card flex max-h-[90vh] w-full flex-col overflow-hidden ${wide ? 'max-w-[980px]' : 'max-w-[440px]'}`}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
