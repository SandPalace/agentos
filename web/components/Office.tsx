'use client'
import dynamic from 'next/dynamic'
import type { Seat } from '@/lib/team'
import type { Task } from '@/lib/types'

// three.js necesita el navegador: se carga sólo en el cliente.
const OfficeScene = dynamic(() => import('./OfficeScene'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Armando la oficina…</div>,
})

export default function Office(props: { seats: Seat[]; teams: { name: string; size: number }[]; tasks: Task[]; selectedTask: string | null; onSelectTask: (id: string) => void; selectedSeat: string | null; onSelectSeat: (key: string | null) => void; onInteract: (id: string) => void; projectName?: string; codexKeys?: string[] }) {
  return <OfficeScene {...props} />
}
