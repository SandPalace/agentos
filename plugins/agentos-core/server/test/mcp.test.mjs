import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/db.mjs'
import { createApp } from '../src/server.mjs'

// Habla con mcp.mjs como lo haría Claude: JSON-RPC por stdio, una línea por mensaje.
function mcpClient(port) {
  const child = spawn(process.execPath, [new URL('../src/mcp.mjs', import.meta.url).pathname], {
    env: { ...process.env, AGENTOS_PORT: String(port) },
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  let buf = ''
  const waiters = new Map()
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      const msg = JSON.parse(line)
      waiters.get(msg.id)?.(msg)
    }
  })
  let n = 0
  const rpc = (method, params) =>
    new Promise((resolve) => {
      const id = ++n
      waiters.set(id, resolve)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  const tool = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args })
    return { isError: !!r.result.isError, data: r.result.isError ? r.result.content[0].text : JSON.parse(r.result.content[0].text) }
  }
  return { rpc, tool, stop: () => child.kill() }
}

test('MCP: handshake, herramientas y flujo de una tarea con entregable', async () => {
  const app = createApp({ db: openDb(':memory:'), port: 0 })
  const port = await app.listen()
  const mcp = mcpClient(port)
  try {
    const init = await mcp.rpc('initialize', { protocolVersion: '2025-06-18' })
    assert.equal(init.result.serverInfo.name, 'agentos')
    const list = await mcp.rpc('tools/list')
    assert.deepEqual(
      list.result.tools.map((t) => t.name),
      ['agentos_task_create', 'agentos_task_update', 'agentos_task_deliver', 'agentos_task_list', 'agentos_lead_create', 'agentos_lead_update', 'agentos_lead_list', 'agentos_whatsapp_inbox', 'agentos_whatsapp_draft', 'agentos_overview', 'agentos_projects', 'agentos_roster', 'agentos_team_context', 'agentos_checkin', 'agentos_file_write', 'agentos_file_read', 'agentos_file_list', 'agentos_file_delete', 'agentos_file_move', 'agentos_profile_read', 'agentos_profile_update', 'agentos_profile_note'],
    )

    const ro = await mcp.tool('agentos_roster', { agent: 'coo' })
    assert.equal(ro.data.plugin, 'agentos-core')
    assert.equal((await mcp.tool('agentos_overview', {})).data.roster.totals.agents > 0, true)
    const unk = await mcp.tool('agentos_roster', { plugin: 'nope' })
    assert.equal(unk.isError, true)
    assert.match(unk.data, /nope/)

    const dir = mkdtempSync(join(tmpdir(), 'agentos-mcp-'))
    const file = join(dir, 'reporte.md')
    writeFileSync(file, '# Reporte')

    const { data: t } = await mcp.tool('agentos_task_create', { title: 'Reporte semanal', agent: 'analyst' })
    const bad = await mcp.tool('agentos_task_update', { id: t.id, status: 'review' })
    assert.equal(bad.isError, true)
    assert.match(bad.data, /output_dir|entregable/)

    const done = await mcp.tool('agentos_task_update', { id: t.id, status: 'done' })
    assert.equal(done.isError, true) // sólo una persona

    const del = await mcp.tool('agentos_task_deliver', { id: t.id, path: file, kind: 'markdown', title: 'Reporte' })
    assert.equal(del.data.outputs[0].exists, true)
    const rev = await mcp.tool('agentos_task_update', { id: t.id, status: 'review', output_dir: dir })
    assert.equal(rev.data.status, 'review')

    const ci = await mcp.tool('agentos_checkin', { agent: 'analyst', status: 'working', detail: 'Armando el reporte' })
    assert.equal(ci.data.status, 'working')
    assert.equal(ci.data.id, 'mcp:analyst')
  } finally {
    mcp.stop()
    await app.close()
  }
})
