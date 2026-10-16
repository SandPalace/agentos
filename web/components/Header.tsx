'use client'
import Brand from './Brand'
import Tabs from './Tabs'
import ThemeToggle from './ThemeToggle'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthGate'

/** Navbar: brand + project selector on the left, tabs centered on the whole window, theme toggle and sign-out on the right
 *  (live indicators live in the office HUD; a connection warning only shows when the server is unreachable). */
export default function Header({ conn }: { conn?: 'live' | 'connecting' | 'offline' | string }) {
  const { user, enabled, logout } = useAuth()
  const onProfile = usePathname().startsWith('/perfil')
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 max-md:grid-cols-1 max-md:justify-items-center">
      <div className="justify-self-start max-md:justify-self-center"><Brand /></div>
      <Tabs />
      <div className="flex items-center justify-end gap-2 max-md:justify-center">
        {conn && conn !== 'live' && (
          <span role="status" className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${conn === 'connecting' ? 'bg-amber' : 'bg-red'}`} />
            {conn === 'connecting' ? 'Conectando' : 'Sin conexión con el servidor'}
          </span>
        )}
        <ThemeToggle />
        {enabled && user && (
          <>
            <Link href="/perfil" aria-label="Mi perfil" title="Mi perfil" aria-current={onProfile ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${onProfile ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'}`}>
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" /></svg>
              {user}
            </Link>
            <button type="button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </button>
          </>
        )}
      </div>
    </header>
  )
}
