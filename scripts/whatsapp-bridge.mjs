#!/usr/bin/env node
// AgentOS WhatsApp bridge (zero dependencies).
// open-wa v5's CLI does not register webhooks (it logs "webhook registration parity is not yet restored"),
// so this process subscribes to open-wa's SSE stream (GET /api/events?topics=onMessage) and re-posts each
// message to the AgentOS server as an EASY-API-style webhook: {ws_id, event:"onMessage", data:<Message>}.
// Runs only on this machine (127.0.0.1). Started/stopped by `agentos whatsapp` / scripts/whatsapp-dev.sh.
// Env: AGENTOS_WA_URL, AGENTOS_WA_API_KEY, AGENTOS_WA_WEBHOOK_SECRET, AGENTOS_PORT (default 4780).
const WA = (process.env.AGENTOS_WA_URL || 'http://127.0.0.1:8002').replace(/\/+$/, '');
const KEY = process.env.AGENTOS_WA_API_KEY || '';
const SECRET = process.env.AGENTOS_WA_WEBHOOK_SECRET || '';
const HOOK = `http://127.0.0.1:${process.env.AGENTOS_PORT || 4780}/api/whatsapp/webhook?secret=${encodeURIComponent(SECRET)}`;
if (!KEY || !SECRET) { console.error('[wa-bridge] faltan AGENTOS_WA_API_KEY / AGENTOS_WA_WEBHOOK_SECRET'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function forward(env) {
  const body = JSON.stringify({ ws_id: env.sessionId || 'agentos', event: env.event, data: env.payload, ts: env.ts });
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(HOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(10000) });
      if (r.ok) return;
      if (r.status >= 400 && r.status < 500) { console.error(`[wa-bridge] el servidor rechazó el mensaje (${r.status})`); return; }
    } catch { /* servidor AgentOS apagado: reintenta */ }
    await sleep(1000 * 2 ** i);
  }
  console.error('[wa-bridge] no pude entregar un mensaje al servidor AgentOS (¿corre `agentos start`?)');
}

async function once() {
  const res = await fetch(`${WA}/api/events?topics=onMessage`, { headers: { 'X-API-Key': KEY, accept: 'text/event-stream' } });
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { const env = JSON.parse(data); if (env.event === 'onMessage') await forward(env); } catch { /* frame inválido */ }
    }
  }
}

(async () => {
  for (;;) {
    try { await once(); } catch { /* open-wa aún no arranca o se reinició */ }
    await sleep(3000);
  }
})();
