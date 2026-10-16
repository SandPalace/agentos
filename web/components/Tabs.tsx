'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Oficina' },
  { href: '/tareas', label: 'Tareas' },
  { href: '/leads', label: 'Leads' },
  { href: '/equipos', label: 'Equipos' },
  { href: '/archivos', label: 'Archivos' },
]

export default function Tabs() {
  const path = usePathname()
  return (
    <nav aria-label="Secciones" className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 text-xs font-semibold">
      {TABS.map((t) => {
        const on = t.href === '/' ? path === '/' : path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={`rounded-full px-4 py-1.5 ${on ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
