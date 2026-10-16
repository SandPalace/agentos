import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lightingFor, localHour } from './daylight.ts'

test('mediodía brillante, medianoche oscura con lámparas encendidas', () => {
  const noon = lightingFor(12.75)
  const night = lightingFor(0)
  assert.equal(noon.phase, 'day')
  assert.equal(night.phase, 'night')
  assert.ok(noon.sun.intensity > 1.3 && night.sun.intensity < 0.4)
  assert.ok(noon.ambient.intensity > night.ambient.intensity)
  assert.equal(noon.lamps, 0)
  assert.ok(night.lamps > 0.9)
  assert.ok(noon.sun.dir[1] > 0.8, 'sol alto al mediodía')
})

test('el sol sale por el este y se pone por el oeste, con luz dorada en la orilla', () => {
  const morning = lightingFor(7.5)
  const evening = lightingFor(18)
  assert.ok(morning.sun.dir[0] > 0.5, 'en la mañana viene del este (+x)')
  assert.ok(evening.sun.dir[0] < -0.5, 'en la tarde viene del oeste (-x)')
  assert.equal(morning.phase, 'dawn')
  assert.equal(evening.phase, 'dusk')
  assert.notEqual(evening.sun.color, lightingFor(12.75).sun.color)
})

test('cambia de forma continua (sin saltos bruscos de un minuto a otro)', () => {
  for (let m = 0; m < 24 * 60; m++) {
    const a = lightingFor(m / 60)
    const b = lightingFor((m + 1) / 60)
    assert.ok(Math.abs(a.sun.intensity - b.sun.intensity) < 0.1, `salto de intensidad a las ${m} min`)
    assert.ok(Math.abs(a.ambient.intensity - b.ambient.intensity) < 0.05)
  }
})

test('localHour: hora real o la de ?hour=', () => {
  assert.equal(localHour(new Date(2026, 9, 13, 21, 30)), 21.5)
  assert.equal(localHour(new Date(), '7.25'), 7.25)
  assert.equal(localHour(new Date(2026, 9, 13, 9, 0), 'x'), 9)
})
