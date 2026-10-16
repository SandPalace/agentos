import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionLink, greeting, newConversationLink, roleNoun } from './claude.ts'

const ID = 'cse_01SGXsU5dvQJdmphAHctBAqs'
const UUID = '123e4567-e89b-12d3-a456-426614174000'

test('id suelto de sesión de Code', () => {
  assert.deepEqual(sessionLink(ID), { url: `claude://code/${ID}`, kind: 'code' })
  assert.deepEqual(sessionLink(`  session_01AbC  `), { url: 'claude://code/session_01AbC', kind: 'code' })
  assert.deepEqual(sessionLink(UUID), { url: `claude://code/${UUID}`, kind: 'code' })
  assert.deepEqual(sessionLink('local_e238acf3-4494-4a25-a49f-f171012aee6e'), { url: 'claude://code/local_e238acf3-4494-4a25-a49f-f171012aee6e', kind: 'code' })
})

test('enlaces de Code (https y claude://)', () => {
  const want = { url: `claude://code/${ID}`, kind: 'code' }
  assert.deepEqual(sessionLink(`https://claude.ai/code/${ID}`), want)
  assert.deepEqual(sessionLink(`https://claude.ai/code/${ID}?x=1#y`), want)
  assert.deepEqual(sessionLink(`claude://code/${ID}`), want)
})

test('chats y proyectos', () => {
  const chat = { url: `claude://claude.ai/chat/${UUID}`, kind: 'chat' }
  assert.deepEqual(sessionLink(`https://claude.ai/chat/${UUID}`), chat)
  assert.deepEqual(sessionLink(`claude://claude.ai/chat/${UUID}`), chat)
  assert.deepEqual(sessionLink(`https://claude.ai/project/${UUID}`), { url: `claude://claude.ai/project/${UUID}`, kind: 'project' })
})

test('rechaza lo demás y caracteres inyectados', () => {
  for (const bad of [null, undefined, '', '   ', 'hola mundo', 'hola', 'abc123', 'https://evil.com/code/abc', 'javascript:alert(1)', `https://claude.ai/code/${ID}/../x`,
    'claude://code/new?q=hola', 'claude://code/a b', 'https://claude.ai/code/', 'https://claude.ai/settings', 'cse_abc"onload=1', 'a/b', 'claude://claude.ai/chat/a%20b', `https://claude.ai.evil.com/code/${ID}`]) {
    assert.equal(sessionLink(bad), null, String(bad))
  }
})

test('saludo de una conversación nueva: rol en minúscula (no siglas) y «llamado» sólo con nombre', () => {
  assert.equal(greeting({ role: 'Líder técnico', name: 'Atlas' }), 'Hola, ahora eres un líder técnico llamado Atlas.')
  assert.equal(greeting({ role: 'Líder técnico', name: '  ' }), 'Hola, ahora eres un líder técnico.')
  assert.equal(greeting({ role: 'CMO' }), 'Hola, ahora eres un CMO.')
  assert.equal(greeting({ role: 'asistente', name: 'Luna', female: true }), 'Hola, ahora eres una asistente llamada Luna.')
  assert.equal(roleNoun('QA web'), 'QA web')
})

test('conversación nueva: agentes en Cowork, Assistant en Code, con la carpeta del proyecto', () => {
  const a = newConversationLink({ surface: 'cowork', role: 'Ingeniero frontend', name: 'Pixel', folder: '/Users/x/AgentOS/workspaces/acme' })
  assert.ok(a.startsWith('claude://cowork/new?q='))
  const u = new URL(a.replace('claude://', 'https://h/'))
  assert.equal(u.searchParams.get('q'), 'Hola, ahora eres un ingeniero frontend llamado Pixel.')
  assert.equal(u.searchParams.get('folder'), '/Users/x/AgentOS/workspaces/acme')
  const c = newConversationLink({ surface: 'code', role: 'asistente', female: true })
  assert.equal(c, `claude://code/new?q=${encodeURIComponent('Hola, ahora eres una asistente.')}`)
})

test('sessionLink: Codex (codex://threads/<uuid>) y rechazos', () => {
  const T = '019a1b2c-3d4e-7f50-8a9b-0c1d2e3f4a5b'
  const want = { url: `codex://threads/${T}`, kind: 'codex' }
  assert.deepEqual(sessionLink(`codex://threads/${T}`), want)
  assert.deepEqual(sessionLink(`  codex:${T} `), want)
  assert.equal(sessionLink('codex://threads/new'), null)
  assert.equal(sessionLink('codex://threads/abc'), null)
  assert.equal(sessionLink(`codex://threads/${T}/x`), null)
  assert.equal(sessionLink(`codex://settings`), null)
  assert.equal(sessionLink(T)?.kind, 'code', 'un UUID suelto sigue siendo de Claude')
})
