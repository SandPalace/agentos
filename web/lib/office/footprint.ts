// Huella en el piso de una malla 3D como cajas: rasteriza sus triángulos en una cuadrícula fina y junta las celdas en
// rectángulos. Así un mueble en "L" no bloquea el hueco de su esquina (a diferencia de una sola caja envolvente).
import type { Box } from './collide.ts'

/** Cada triángulo: [x0, z0, x1, z1, x2, z2] en coordenadas del mundo. */
export type Tri = [number, number, number, number, number, number]

function inTri(px: number, pz: number, t: Tri): boolean {
  const [x0, z0, x1, z1, x2, z2] = t
  const d = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)
  if (Math.abs(d) < 1e-9) return false
  const a = ((x1 - px) * (z2 - pz) - (x2 - px) * (z1 - pz)) / d
  const b = ((x2 - px) * (z0 - pz) - (x0 - px) * (z2 - pz)) / d
  const c = 1 - a - b
  const e = -1e-6
  return a >= e && b >= e && c >= e
}

export function footprintBoxes(tris: Tri[], cell = 0.2): Box[] {
  if (!tris.length) return []
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const t of tris) {
    for (let i = 0; i < 6; i += 2) {
      minX = Math.min(minX, t[i]); maxX = Math.max(maxX, t[i])
      minZ = Math.min(minZ, t[i + 1]); maxZ = Math.max(maxZ, t[i + 1])
    }
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell))
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  const grid = Array.from({ length: rows }, () => new Uint8Array(cols))
  for (const t of tris) {
    const tx0 = Math.min(t[0], t[2], t[4]), tx1 = Math.max(t[0], t[2], t[4])
    const tz0 = Math.min(t[1], t[3], t[5]), tz1 = Math.max(t[1], t[3], t[5])
    const c0 = Math.max(0, Math.floor((tx0 - minX) / cell)), c1 = Math.min(cols - 1, Math.floor((tx1 - minX) / cell))
    const r0 = Math.max(0, Math.floor((tz0 - minZ) / cell)), r1 = Math.min(rows - 1, Math.floor((tz1 - minZ) / cell))
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        // la celda cuenta si el triángulo toca su centro o cualquiera de sus esquinas (no deja huecos en triángulos delgados)
        const x = minX + c * cell, z = minZ + r * cell
        if (inTri(x + cell / 2, z + cell / 2, t) || inTri(x, z, t) || inTri(x + cell, z, t) || inTri(x, z + cell, t) || inTri(x + cell, z + cell, t)) grid[r][c] = 1
      }
  }
  // juntar celdas: tramos horizontales por fila y luego filas consecutivas con el mismo tramo
  type Run = { c0: number; c1: number; r0: number; r1: number }
  const open: Run[] = []
  const done: Run[] = []
  for (let r = 0; r <= rows; r++) {
    const runs: [number, number][] = []
    if (r < rows) {
      let c = 0
      while (c < cols) {
        if (grid[r][c]) {
          let e = c
          while (e + 1 < cols && grid[r][e + 1]) e++
          runs.push([c, e])
          c = e + 1
        } else c++
      }
    }
    const next: Run[] = []
    for (const [c0, c1] of runs) {
      const same = open.find((o) => o.c0 === c0 && o.c1 === c1 && o.r1 === r - 1)
      if (same) {
        same.r1 = r
        next.push(same)
      } else next.push({ c0, c1, r0: r, r1: r })
    }
    for (const o of open) if (!next.includes(o)) done.push(o)
    open.length = 0
    open.push(...next)
  }
  return done.map((o) => ({ minX: minX + o.c0 * cell, maxX: minX + (o.c1 + 1) * cell, minZ: minZ + o.r0 * cell, maxZ: minZ + (o.r1 + 1) * cell }))
}
