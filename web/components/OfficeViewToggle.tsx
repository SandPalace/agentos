'use client'
import { useOfficeView } from '@/lib/officeViewContext'

/** Interruptor «Vista oficina» del navbar: enciende la oficina 3D como vista de Inicio (por defecto, la vista 2D). */
export default function OfficeViewToggle() {
  const { officeView, toggle } = useOfficeView()
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="office-view-toggle"
      aria-pressed={officeView}
      title={officeView ? 'Volver a la vista normal' : 'Ver el inicio como una oficina 3D'}
      className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${officeView ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5" /><path d="M12 12v10" /></svg>
      Vista oficina
    </button>
  )
}
