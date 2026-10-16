import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOT_NAMES, suggestName, defaultGender, type NameGender } from './botNames.ts'

const GENDERS: NameGender[] = ['female', 'male', 'unisex']

test('50 nombres por género, sin vacíos y sin repetirse entre sí ni entre géneros', () => {
  for (const g of GENDERS) assert.equal(BOT_NAMES[g].length, 50, g)
  const all = GENDERS.flatMap((g) => BOT_NAMES[g])
  assert.ok(all.every((n) => n.trim() === n && n.length >= 2 && n.length <= 12))
  const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  assert.equal(new Set(all.map(key)).size, all.length, 'nombre repetido')
})

test('sugiere un nombre del género pedido y evita los que ya se usan', () => {
  for (const g of GENDERS) {
    for (let i = 0; i < 200; i++) assert.ok(BOT_NAMES[g].includes(suggestName(g)))
    const taken = BOT_NAMES[g].slice(0, 49).map((n) => n.toUpperCase())
    assert.equal(suggestName(g, taken), BOT_NAMES[g][49], 'el único libre')
    assert.ok(BOT_NAMES[g].includes(suggestName(g, BOT_NAMES[g])), 'con todo ocupado, igual da uno')
  }
  assert.equal(suggestName('female', [], () => 0), 'Nova')
  assert.equal(suggestName('female', [], () => 0.999999), 'Valkiria')
})

test('el género inicial sale de la cara: las femeninas piden nombres femeninos, el resto unisex', () => {
  assert.equal(defaultGender(11), 'female')
  assert.equal(defaultGender(0), 'unisex')
})
