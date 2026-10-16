import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROSTERS, ROSTER_AGENTS } from './roster.ts'

const PLUGINS = join(import.meta.dirname, '..', '..', 'plugins')

test('los ids de agentes son únicos en todo el roster', () => {
  const ids = ROSTER_AGENTS.map((a) => a.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('cada grupo del roster coincide con los agentes de su plugin', () => {
  for (const g of ROSTERS) {
    const dir = join(PLUGINS, g.id, 'agents')
    assert.ok(existsSync(dir), `falta el plugin ${g.id}`)
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
    for (const a of g.agents) assert.ok(files.includes(a.id), `${g.id}: no existe agents/${a.id}.md`)
    // un agente nuevo en el plugin debe estar en el roster
    const missing = files.filter((f) => !g.agents.some((a) => a.id === f))
    assert.deepEqual(missing, [], `${g.id}: agentes del plugin que no están en el roster`)
  }
})

test('cada agente tiene una cara válida (0–20, no la del jugador) y no hay dos agentes iguales (cara + color)', () => {
  for (const a of ROSTER_AGENTS) assert.ok(Number.isInteger(a.face) && a.face! >= 0 && a.face! <= 20 && a.face !== 10, `cara inválida: ${a.id} ${a.face}`)
  const looks = ROSTER_AGENTS.map((a) => `${a.face}|${a.color}`)
  assert.equal(new Set(looks).size, looks.length, 'dos agentes con la misma cara y el mismo color')
})
