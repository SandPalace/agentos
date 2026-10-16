import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listDesktopCodeSessions, desktopCodeSessions } from '../src/desktop-sessions.mjs'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agentos-desk-'))
  const root = join(dir, 'proj'); mkdirSync(root)
  const d = join(dir, 'claude-code-sessions', 'aaa', 'bbb'); mkdirSync(d, { recursive: true })
  const put = (n, o) => writeFileSync(join(d, n), typeof o === 'string' ? o : JSON.stringify(o))
  put('local_1.json', { sessionId: 'local_1', cliSessionId: 'c1', title: ' Vieja ', cwd: '/elsewhere', createdAt: 1000, lastActivityAt: 2000, isArchived: true, model: 'm' })
  put('local_2.json', { sessionId: 'local_2', cliSessionId: 'c2', title: 'Nueva', cwd: join(root, 'sub'), createdAt: 1000, lastActivityAt: 9000, isArchived: false })
  put('local_3.json', { sessionId: 'local_3', title: 'Media', cwd: '/x', createdAt: 1500, lastActivityAt: 5000, isArchived: false })
  put('local_4.json', '{ not json')
  put('local_5.json', { title: 'sin id', cwd: '/x' })
  return { dir, root }
}

test('desktop sessions: orden, saltos e inProject', () => {
  const { dir, root } = fixture()
  const list = listDesktopCodeSessions({ dir, workspaceRoot: root })
  assert.deepEqual(list.map((s) => s.id), ['local_2', 'local_3', 'local_1'])
  assert.equal(list[0].inProject, true)
  assert.equal(list[1].inProject, false)
  assert.equal(list[2].archived, true)
  assert.equal(list[2].title, 'Vieja')
  assert.equal(list[0].cliId, 'c2')
})

test('desktop sessions: sin carpeta no falla', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'agentos-desk-')), 'nada')
  assert.deepEqual(listDesktopCodeSessions({ dir }), [])
  assert.deepEqual(desktopCodeSessions({ dir }), { available: false, sessions: [] })
  assert.equal(desktopCodeSessions(fixture()).available, true)
})

test('sessionLinks: dice a qué agente (y proyecto/equipo) ya está ligada cada conversación, incluida la de Assistant', async () => {
  const { openDb } = await import('../src/db.mjs')
  const { createStore } = await import('../src/store.mjs')
  const store = createStore(openDb(':memory:'))
  const t = store.createTeam({ name: 'Dev', members: [{ agent_id: 'tech-lead', session_ref: 'local_aaaa-1' }, { agent_id: 'web-qa' }] })
  store.updateSystemAgent('coo', { session_ref: 'local_bbbb-2' })
  const links = store.sessionLinks()
  assert.deepEqual(links['local_aaaa-1'].map((l) => [l.agent, l.team, l.workspace]), [['tech-lead', 'Dev', 'default']])
  assert.equal(links['local_bbbb-2'][0].agent, 'coo')
  assert.equal(Object.keys(links).length, 2, t && 'los agentes sin conversación no aparecen')
})
