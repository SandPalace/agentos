import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hits, slide, PLAYER_RADIUS, type Box } from './collide.ts'
import { footprintBoxes, type Tri } from './footprint.ts'

const wall: Box = { minX: 5, maxX: 6, minZ: 0, maxZ: 10 }

test('no choca antes de tocar: queda a un radio del mueble, no a 0.7', () => {
  assert.equal(hits(4.65, 5, PLAYER_RADIUS, [wall]), false) // a 0.35 de la caja
  assert.equal(hits(4.75, 5, PLAYER_RADIUS, [wall]), true) // a 0.25: ya la toca
})

test('se desliza por el eje libre y puede retroceder', () => {
  let [x, z] = [4.0, 5.0]
  for (let i = 0; i < 60; i++) [x, z] = slide(x, z, 0.057, 0.057, PLAYER_RADIUS, [wall]) // empuja contra la pared en diagonal
  assert.ok(x < 5 - PLAYER_RADIUS + 0.06, 'no atraviesa la caja')
  assert.ok(z > 5.5, 'se deslizó a lo largo de la pared')
  const before = x
  ;[x, z] = slide(x, z, -0.057, -0.057, PLAYER_RADIUS, [wall]) // ahora hacia atrás
  assert.ok(x < before, 'sí puede retroceder')
})

test('si ya está encajado en una caja, puede salir', () => {
  const [x, z] = slide(5.5, 5, -0.1, 0, PLAYER_RADIUS, [wall])
  assert.ok(x < 5.5)
})

test('una huella en L no bloquea el hueco de su esquina', () => {
  // L de 3x3: brazo horizontal (z 0..1) y brazo vertical (x 0..1), esquina vacía en (1..3, 1..3)
  const rect = (x0: number, z0: number, x1: number, z1: number): Tri[] => [
    [x0, z0, x1, z0, x1, z1],
    [x0, z0, x1, z1, x0, z1],
  ]
  const boxes = footprintBoxes([...rect(0, 0, 3, 1), ...rect(0, 1, 1, 3)])
  assert.ok(boxes.length >= 2)
  assert.equal(hits(2.2, 2.2, PLAYER_RADIUS, boxes), false, 'el hueco de la L queda libre')
  assert.equal(hits(0.5, 2.2, PLAYER_RADIUS, boxes), true, 'el brazo vertical sí bloquea')
  assert.equal(hits(2.0, 0.5, PLAYER_RADIUS, boxes), true, 'el brazo horizontal sí bloquea')
})

test('un rectángulo se junta en una sola caja', () => {
  const t: Tri[] = [[0, 0, 4.8, 0, 4.8, 1.2], [0, 0, 4.8, 1.2, 0, 1.2]]
  const boxes = footprintBoxes(t)
  assert.equal(boxes.length, 1)
  assert.ok(Math.abs(boxes[0].maxX - boxes[0].minX - 4.8) < 0.21)
})
