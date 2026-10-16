import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateOffice } from './generate.ts'
import { moveClamped, hits, PLAYER_RADIUS, type Box } from './collide.ts'

// Caminata aleatoria con las cajas reales de la oficina de 4 asientos: nunca queda atrapado ni dentro de un mueble.
const boxes: Box[] = JSON.parse(readFileSync(new URL('./fixtures/obstacles-4.json', import.meta.url), 'utf8'))

test('la persona usuaria nunca queda atrapada ni dentro de un mueble', () => {
  const l = generateOffice(4, undefined, { coo: true })
  let [x, z] = [l.spawn[0], l.spawn[2]]
  assert.equal(hits(x, z, PLAYER_RADIUS, boxes), false, 'aparece en un lugar libre')
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  let dir = [1, 0]
  const D = 0.057
  for (let i = 0; i < 60000; i++) {
    if (i % 80 === 0) {
      const a = rnd() * Math.PI * 2
      dir = [Math.cos(a), Math.sin(a)]
    }
    ;[x, z] = moveClamped(x, z, dir[0] * D, dir[1] * D, PLAYER_RADIUS, boxes, { minX: 0.5, maxX: l.width - 0.5, minZ: 0.5, maxZ: l.depth - 0.5 })
    assert.equal(hits(x, z, PLAYER_RADIUS, boxes), false, `quedó dentro de un mueble en el paso ${i}: (${x.toFixed(2)}, ${z.toFixed(2)})`)
    if (i % 100 === 0) {
      const free = [0, 1, 2, 3, 4, 5, 6, 7].some((k) => {
        const [px, pz] = moveClamped(x, z, Math.cos((k * Math.PI) / 4) * D, Math.sin((k * Math.PI) / 4) * D, PLAYER_RADIUS, boxes, { minX: 0.5, maxX: l.width - 0.5, minZ: 0.5, maxZ: l.depth - 0.5 })
        return Math.hypot(px - x, pz - z) > 0.01
      })
      assert.ok(free, `atrapado en (${x.toFixed(2)}, ${z.toFixed(2)}) en el paso ${i}`)
    }
  }
})
