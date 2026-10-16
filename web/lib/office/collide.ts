// Colisión exacta de un círculo (el personaje) contra cajas alineadas a los ejes, en el plano del piso.
// Sustituye a la malla de celdas para la persona usuaria: la malla bloquea hasta ~0.7 antes del mueble.

export interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const PLAYER_RADIUS = 0.3

/** ¿El círculo (x,z,r) toca alguna caja? */
export function hits(x: number, z: number, r: number, boxes: Box[]): boolean {
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX))
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ))
    const dx = x - cx
    const dz = z - cz
    if (dx * dx + dz * dz < r * r) return true
  }
  return false
}

/**
 * Mueve el círculo de (x,z) a (x+dx, z+dz) sin atravesar cajas. Si el destino choca, se desliza por el eje libre.
 * Si ya está encajado en una caja (por ejemplo tras cambiar el layout), se le deja moverse para que pueda salir.
 */
export function slide(x: number, z: number, dx: number, dz: number, r: number, boxes: Box[]): [number, number] {
  if (hits(x, z, r, boxes)) return [x + dx, z + dz]
  const nx = x + dx
  const nz = z + dz
  if (!hits(nx, nz, r, boxes)) return [nx, nz]
  if (!hits(nx, z, r, boxes)) return [nx, z]
  if (!hits(x, nz, r, boxes)) return [x, nz]
  return [x, z]
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Como `slide`, pero también respeta los límites del piso sin dejar que el recorte empuje al círculo dentro de una caja. */
export function moveClamped(x: number, z: number, dx: number, dz: number, r: number, boxes: Box[], b: Bounds): [number, number] {
  const [sx, sz] = slide(x, z, dx, dz, r, boxes)
  const cx = Math.max(b.minX, Math.min(b.maxX, sx))
  const cz = Math.max(b.minZ, Math.min(b.maxZ, sz))
  if (hits(cx, cz, r, boxes) && !hits(x, z, r, boxes)) return [x, z]
  return [cx, cz]
}
