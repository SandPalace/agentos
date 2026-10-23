import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OFFICE_VIEW_KEY, parseOfficeView, readOfficeView, serializeOfficeView, writeOfficeView } from './officeView.ts'

test('office view defaults to off when nothing (or garbage) is stored', () => {
  assert.equal(parseOfficeView(null), false)
  assert.equal(parseOfficeView(undefined), false)
  assert.equal(parseOfficeView(''), false)
  assert.equal(parseOfficeView('true'), false)
  assert.equal(parseOfficeView('off'), false)
  assert.equal(parseOfficeView('on'), true)
})

test('office view round-trips through storage under its key', () => {
  const mem = new Map<string, string>()
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }
  assert.equal(readOfficeView(storage), false)
  writeOfficeView(storage, true)
  assert.equal(mem.get(OFFICE_VIEW_KEY), 'on')
  assert.equal(readOfficeView(storage), true)
  writeOfficeView(storage, false)
  assert.equal(mem.get(OFFICE_VIEW_KEY), serializeOfficeView(false))
  assert.equal(readOfficeView(storage), false)
})

test('storage that throws never breaks the toggle (defaults to off)', () => {
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readOfficeView(broken), false)
  assert.doesNotThrow(() => writeOfficeView(broken, true))
  assert.equal(readOfficeView(null), false)
})
