// Iluminación de la oficina según la hora local de la persona (función pura: se prueba sin three.js).
// Amanecer ~6:30, atardecer ~19:00 (aproximado para México; no depende de la fecha). De noche se encienden las lámparas.

export interface Lighting {
  /** 0 = noche, 1 = mediodía */
  daylight: number
  sun: { intensity: number; color: string; /** dirección hacia el sol (unitaria): x este, y arriba, z sur */ dir: [number, number, number] }
  ambient: { intensity: number; color: string }
  hemi: { sky: string; ground: string; intensity: number }
  /** lámparas interiores (0 de día) */
  lamps: number
  /** fondo del lienzo en tema claro */
  background: string
  /** nombre del momento, para la interfaz */
  phase: 'night' | 'dawn' | 'day' | 'dusk'
}

const RISE = 6.5
const SET = 19

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * clamp01(t)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** `hour` en horas decimales locales (0–24), p. ej. 18.5 = 6:30 pm. */
export function lightingFor(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24
  const span = SET - RISE
  const above = h > RISE && h < SET
  // altura del sol: 0 en el horizonte, 1 al mediodía solar
  const d = above ? Math.sin((Math.PI * (h - RISE)) / span) : 0
  // cercanía al horizonte (amanecer/atardecer): 1 justo en la salida/puesta, 0 a una hora o más
  const edge = Math.max(0, 1 - Math.min(Math.abs(h - RISE), Math.abs(h - SET)))
  const phase: Lighting['phase'] = !above && edge < 0.5 ? 'night' : d < 0.35 ? (h < 12 ? 'dawn' : 'dusk') : 'day'
  const golden = clamp01(1 - d / 0.45)
  const az = above ? (Math.PI * (h - RISE)) / span : Math.PI / 2 // este (0, +x) al salir → oeste (π, -x) al ponerse
  const elev = above ? Math.max(0.14, d * 1.2) : 1.0
  const dir: [number, number, number] = [Math.cos(az) * Math.cos(elev), Math.sin(elev), 0.45 * Math.cos(elev)]
  const len = Math.hypot(...dir)
  return {
    daylight: d,
    phase,
    sun: {
      intensity: 0.18 + 1.37 * d, // de noche (d = 0) es la luna
      color: above ? mix('#FF9A55', '#FFD9A6', 1 - golden) : '#9FB4FF',
      dir: dir.map((v) => v / len) as [number, number, number],
    },
    ambient: { intensity: 0.2 + 0.65 * d, color: mix('#9DB0E0', '#FFE9CF', clamp01(d * 2 + edge * 0.4)) },
    hemi: {
      sky: mix('#6E7FB8', '#FFF6E6', clamp01(d * 2)),
      ground: mix('#3B3024', '#C79A68', clamp01(d * 2)),
      intensity: 0.22 + 0.68 * d,
    },
    lamps: clamp01(1 - d * 3),
    background: above ? mix('#F3C9A0', '#FBEFD9', 1 - golden * 0.8) : mix('#2B3048', '#D9B79A', edge * 0.6),
  }
}

/** Hora local decimal de ahora (o la de `?hour=` en la URL, para revisar cómo se ve a otra hora). */
export function localHour(now = new Date(), override?: string | null): number {
  const o = override != null && override !== '' ? Number(override) : NaN
  if (Number.isFinite(o)) return ((o % 24) + 24) % 24
  return now.getHours() + now.getMinutes() / 60
}
