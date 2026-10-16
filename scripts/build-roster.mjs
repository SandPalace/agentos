#!/usr/bin/env node
// Regenera plugins/agentos-core/roster.json desde plugins/*/agents/*.md, plugins/*/skills/*/SKILL.md y plugin.json.
// Uso: node scripts/build-roster.mjs   (desde apps/agentos). `generated_at` sólo cambia si cambia el contenido.
import { readFileSync, writeFileSync } from 'node:fs'
import { rosterContent, ROSTER_FILE } from '../plugins/agentos-core/server/src/roster.mjs'

const content = rosterContent()
let prev = null
try { prev = JSON.parse(readFileSync(ROSTER_FILE, 'utf8')) } catch {}
const same = prev && JSON.stringify({ plugins: prev.plugins }) === JSON.stringify(content)
if (same) console.log('roster.json already up to date')
else writeFileSync(ROSTER_FILE, JSON.stringify({ generated_at: new Date().toISOString(), ...content }, null, 2) + '\n')
const ps = content.plugins
console.log(`${ps.length} plugins, ${ps.reduce((n, p) => n + p.agents.length, 0)} agents, ${ps.reduce((n, p) => n + p.skills.length, 0)} skills${same ? '' : ' -> roster.json written'}`)
