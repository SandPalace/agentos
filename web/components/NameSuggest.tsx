'use client'
import { useState } from 'react'
import { GENDER_LABEL, defaultGender, suggestName, type NameGender } from '@/lib/botNames'

/** «Sugerir» button + gender picker that sit next to an agent's name field. Each press proposes a random name from the catalog. */
export default function NameSuggest({ face, current, taken, label, onPick }: { face: number; current: string; taken: string[]; label: string; onPick: (name: string) => void }) {
  const [gender, setGender] = useState<NameGender>(defaultGender(face))
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        aria-label={`Género del nombre de ${label}`}
        value={gender}
        onChange={(e) => setGender(e.target.value as NameGender)}
        className="rounded-full border border-line bg-surface px-2 py-1 text-xs font-semibold text-muted outline-none focus:border-blue"
      >
        {(Object.keys(GENDER_LABEL) as NameGender[]).map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onPick(suggestName(gender, [...taken, current]))}
        aria-label={`Sugerir un nombre para ${label}`}
        title="Sugerir un nombre al azar"
        className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-blue hover:bg-blue-soft"
      >
        🎲 Sugerir
      </button>
    </span>
  )
}
