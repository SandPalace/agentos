import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pathInside, isMain } from '../src/paths.mjs'

test('pathInside con rutas de Windows: sin distinguir mayúsculas y con separador', () => {
  const w = path.win32
  assert.ok(pathInside('C:\\Users\\Ana\\AgentOS\\acme\\x', 'c:\\users\\ana\\agentos', w))
  assert.ok(pathInside('C:\\Users\\Ana\\AgentOS', 'C:\\Users\\Ana\\AgentOS\\', w))
  assert.ok(!pathInside('C:\\Users\\Ana\\AgentOS2', 'C:\\Users\\Ana\\AgentOS', w))
  assert.ok(!pathInside('D:\\Users\\Ana\\AgentOS\\x', 'C:\\Users\\Ana\\AgentOS', w))
})

test('pathInside posix distingue mayúsculas', () => {
  const p = path.posix
  assert.ok(pathInside('/a/b/c', '/a/b', p))
  assert.ok(!pathInside('/a/bc', '/a/b', p))
  assert.ok(!pathInside('/a/B/c', '/a/b', p))
})

test('isMain compara rutas reales, no strings de file://', () => {
  const f = path.resolve('x.mjs')
  assert.ok(isMain(pathToFileURL(f).href, f))
  assert.ok(!isMain(pathToFileURL(f).href, path.resolve('y.mjs')))
  assert.ok(!isMain(pathToFileURL(f).href, undefined))
})
