'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'

const AvatarGallery = dynamic(() => import('@/components/AvatarGallery'), { ssr: false })

// Vista de trabajo: las 21 caras disponibles con su número.
export default function AvataresPage() {
  const [v, setV] = useState<number | null>(null)
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6">
      <h1 className="mb-3 text-xl font-bold">Avatares</h1>
      <div className="card h-[620px] overflow-hidden"><AvatarGallery value={v} onPick={setV} /></div>
    </main>
  )
}
