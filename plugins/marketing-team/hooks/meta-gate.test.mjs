import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from './meta-gate.mjs';

const ads = (t) => `mcp__plugin_marketing-team_meta-ads__${t}`;
const web = (t) => `mcp__plugin_marketing-team_meta-browser__${t}`;
const verdict = (name, input = {}) => decide(name, input)?.[0] ?? 'pass';

test('reads pass through', () => {
  assert.equal(verdict(ads('ads_get_ad_accounts')), 'pass');
  assert.equal(verdict(ads('ads_insights_performance_trend'), { level: 'campaign' }), 'pass');
});

test('spending tools are denied', () => {
  for (const t of ['ads_activate_entity', 'ads_boost_ig_post', 'ads_pixel_event_create', 'ads_crm']) {
    assert.equal(verdict(ads(t)), 'deny', t);
  }
});

test('creates need explicit PAUSED', () => {
  assert.equal(verdict(ads('ads_create_campaign'), { status: 'PAUSED' }), 'pass');
  assert.equal(verdict(ads('ads_create_ad_set'), { status: 'paused' }), 'pass');
  assert.equal(verdict(ads('ads_create_ad'), { status: 'ACTIVE' }), 'deny');
  assert.equal(verdict(ads('ads_create_campaign'), {}), 'deny');
  assert.equal(verdict(ads('ads_create_creative'), {}), 'pass');
});

test('update only allows pausing', () => {
  assert.equal(verdict(ads('ads_update_entity'), { fields: { status: 'PAUSED' } }), 'pass');
  assert.equal(verdict(ads('ads_update_entity'), { fields: '{"status":"PAUSED"}' }), 'pass');
  assert.equal(verdict(ads('ads_update_entity'), { fields: { status: 'ACTIVE' } }), 'deny');
  assert.equal(verdict(ads('ads_update_entity'), { fields: { status: 'PAUSED', daily_budget: 5000 } }), 'deny');
});

test('unknown ads tools ask', () => {
  assert.equal(verdict(ads('ads_something_new')), 'ask');
});

test('browser: risky clicks ask, scripts denied, drafts pass', () => {
  assert.equal(verdict(web('browser_click'), { element: 'Botón Publicar', ref: 'e12' }), 'ask');
  assert.equal(verdict(web('browser_click'), { element: 'Programar publicación' }), 'ask');
  assert.equal(verdict(web('browser_click'), { element: 'Boost post' }), 'ask');
  assert.equal(verdict(web('browser_click'), { element: 'Guardar como borrador' }), 'pass');
  assert.equal(verdict(web('browser_navigate'), { url: 'https://business.facebook.com/billing_hub/accounts' }), 'ask');
  assert.equal(verdict(web('browser_navigate'), { url: 'https://business.facebook.com/latest/home' }), 'pass');
  assert.equal(verdict(web('browser_evaluate'), { function: '() => 1' }), 'deny');
  assert.equal(verdict(web('browser_run_code_unsafe'), {}), 'deny');
});

test('other tools are ignored', () => {
  assert.equal(decide('mcp__playwright__browser_click', { element: 'Publicar' }), null);
});

test('CLI: emits hook JSON and fails closed on garbage', () => {
  const script = fileURLToPath(new URL('./meta-gate.mjs', import.meta.url));
  const out = execFileSync('node', [script], {
    input: JSON.stringify({ tool_name: ads('ads_activate_entity'), tool_input: {} }),
  }).toString();
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'deny');
  assert.throws(() => execFileSync('node', [script], { input: 'not json', stdio: 'pipe' }), (e) => e.status === 2);
});
