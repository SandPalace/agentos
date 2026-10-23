#!/usr/bin/env node
// Moves a Claude install from the 7 old AgentOS plugins (agentos-core, marketing-team, sales-team, collections-team,
// executive-team, finance-team, dev-team) to the single plugin `agentos@agentos`. Idempotent: safe to run any number of
// times. Zero dependencies. Messages to the person are Spanish, one line per step.
//
//   node scripts/migrate-plugins.mjs              run every step (bin/agentos update and the installers call this)
//   node scripts/migrate-plugins.mjs --no-claude  only the JSON steps (settings + Claude Desktop), no `claude plugin`
//   node scripts/migrate-plugins.mjs --plugins-only  only the `claude plugin` step (the installers use it)
//   node scripts/migrate-plugins.mjs --from-npm   hand-off from an OLD launcher (web `postinstall`); see legacyHandoff()
//
// Steps:
//   1. ~/.claude/settings.json: permission rules with the old tool prefixes are rewritten to the new ones
//      (mcp__plugin_agentos-core_agentos → mcp__plugin_agentos_agentos, …). Everything else is kept.
//   2. Claude Desktop config: an `mcpServers.agentos` entry that points to plugins/agentos-core/server/src/mcp.mjs is
//      rewritten to plugins/agentos/server/src/mcp.mjs. Everything else is kept.
//   3. Claude Code plugins: uninstall each old `<p>@agentos`, refresh the marketplace, install (or update) `agentos@agentos`.
//
// Env: HOME / USERPROFILE, APPDATA, LOCALAPPDATA, CLAUDE_CONFIG_DIR (settings live in $CLAUDE_CONFIG_DIR/settings.json when
// set), AGENTOS_SKIP_CLAUDE=1 (skip step 3), AGENTOS_CLAUDE_BIN (claude executable, default `claude`; tests use a stub).
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MARKETPLACE = "agentos";
export const PLUGIN = "agentos";
export const OLD_PLUGINS = [
  "agentos-core",
  "marketing-team",
  "sales-team",
  "collections-team",
  "executive-team",
  "finance-team",
  "dev-team",
];
export const OLD_RULE = "mcp__plugin_agentos-core_agentos";
export const NEW_RULE = "mcp__plugin_agentos_agentos";

const say = (m) => console.log(`    ${m}`);
const home = (env) => env.HOME || env.USERPROFILE || "";

// Old tool prefix → new one. Applies to a rule like `mcp__plugin_agentos-core_agentos` or `…__agentos_task_create`.
export function renameRule(rule) {
  if (typeof rule !== "string") return rule;
  return rule
    .replace(/^mcp__plugin_agentos-core_agentos(?=$|__)/, NEW_RULE)
    .replace(
      /^mcp__plugin_(sales-team|dev-team)_playwright(?=$|__)/,
      "mcp__plugin_agentos_playwright",
    )
    .replace(
      /^mcp__plugin_marketing-team_meta-(ads|browser)(?=$|__)/,
      "mcp__plugin_agentos_meta-$1",
    );
}

const readJson = (f) => {
  const t = readFileSync(f, "utf8").replace(/^﻿/, "").trim();
  if (!t) return {};
  const c = JSON.parse(t);
  if (c === null || typeof c !== "object" || Array.isArray(c))
    throw new Error("not a JSON object");
  return c;
};
const writeJson = (f, c) => {
  if (!existsSync(`${f}.agentos-backup`))
    copyFileSync(f, `${f}.agentos-backup`);
  writeFileSync(f, JSON.stringify(c, null, 2) + "\n");
};

export const settingsFile = (env = process.env) =>
  join(env.CLAUDE_CONFIG_DIR || join(home(env), ".claude"), "settings.json");

/** Step 1. Returns 'changed' | 'unchanged' | 'missing' | 'invalid'. */
export function migrateSettings(file = settingsFile()) {
  if (!existsSync(file)) return "missing";
  let c;
  try {
    c = readJson(file);
  } catch {
    return "invalid";
  }
  const p = c.permissions;
  if (!p || typeof p !== "object") return "unchanged";
  let changed = false;
  for (const k of ["allow", "ask", "deny"]) {
    if (!Array.isArray(p[k])) continue;
    const next = [];
    for (const r of p[k]) {
      const n = renameRule(r);
      if (n !== r) changed = true;
      if (!next.includes(n)) next.push(n);
      else changed = true;
    }
    p[k] = next;
  }
  if (!changed) return "unchanged";
  writeJson(file, c);
  return "changed";
}

/** Claude Desktop config files that exist on this machine (macOS, Windows incl. Microsoft Store, Linux). */
export function desktopConfigs(env = process.env) {
  const dirs = [
    join(home(env), "Library", "Application Support", "Claude"),
    join(home(env), ".config", "Claude"),
  ];
  if (env.APPDATA) dirs.push(join(env.APPDATA, "Claude"));
  if (env.LOCALAPPDATA) {
    const pk = join(env.LOCALAPPDATA, "Packages");
    try {
      for (const d of readdirSync(pk))
        if (d.startsWith("Claude_"))
          dirs.push(join(pk, d, "LocalCache", "Roaming", "Claude"));
    } catch {
      /* none */
    }
  }
  return [...new Set(dirs)]
    .map((d) => join(d, "claude_desktop_config.json"))
    .filter((f) => existsSync(f));
}

const OLD_MCP = /plugins([\\/])agentos-core\1server\1src\1mcp\.mjs$/;

/** Step 2 for one file. Returns 'changed' | 'unchanged' | 'invalid'. */
export function migrateDesktop(file) {
  let c;
  try {
    c = readJson(file);
  } catch {
    return "invalid";
  }
  const e = c.mcpServers?.agentos;
  if (!e || !Array.isArray(e.args)) return "unchanged";
  let changed = false;
  e.args = e.args.map((a) => {
    if (typeof a !== "string" || !OLD_MCP.test(a)) return a;
    changed = true;
    return a.replace(OLD_MCP, (_m, s) =>
      ["plugins", "agentos", "server", "src", "mcp.mjs"].join(s),
    );
  });
  if (!changed) return "unchanged";
  writeJson(file, c);
  return "changed";
}

const claudeBin = (env = process.env) => env.AGENTOS_CLAUDE_BIN || "claude";
function claude(args, env = process.env) {
  const opts = { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] };
  let r = spawnSync(claudeBin(env), args, opts);
  // Windows: an npm install of Claude Code is `claude.cmd`, which only runs through the shell (quote every argument).
  if (r.error?.code === "ENOENT" && process.platform === "win32")
    r = spawnSync([claudeBin(env), ...args].map((a) => `"${a}"`).join(" "), {
      ...opts,
      shell: true,
    });
  return {
    ok: r.status === 0,
    out: `${r.stdout ?? ""}`,
    err: `${r.stderr ?? ""}${r.error ? r.error.message : ""}`,
    missing: r.error?.code === "ENOENT",
  };
}

/** Installed plugins as [{ id, scope }] (id = name@marketplace), from `claude plugin list --json`. null = could not ask. */
export function installedPlugins(env = process.env) {
  const r = claude(["plugin", "list", "--json"], env);
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.out);
    const arr = Array.isArray(j)
      ? j
      : Array.isArray(j?.plugins)
        ? j.plugins
        : Array.isArray(j?.installed)
          ? j.installed
          : [];
    return arr
      .map((p) => ({
        id: String(p.id ?? p.name ?? p.plugin ?? ""),
        scope: p.scope ?? null,
      }))
      .filter((p) => p.id);
  } catch {
    return null;
  }
}

/** Step 3. Returns true when `agentos@agentos` ends up installed. */
export function migrateClaudePlugins(env = process.env, repo = REPO) {
  if (env.AGENTOS_SKIP_CLAUDE === "1") {
    say("Plugins de Claude: omitido (AGENTOS_SKIP_CLAUDE=1).");
    return true;
  }
  const before = installedPlugins(env);
  if (before === null) {
    const probe = claude(["--version"], env);
    say(
      probe.missing
        ? "Plugins de Claude: no encontré el comando `claude`; omitido."
        : "Plugins de Claude: no pude leer `claude plugin list --json`; omitido (corre esto otra vez más tarde).",
    );
    return false;
  }
  const target = `${PLUGIN}@${MARKETPLACE}`;
  for (const p of before.filter((x) =>
    OLD_PLUGINS.some((o) => x.id === `${o}@${MARKETPLACE}`),
  )) {
    const args = [
      "plugin",
      "uninstall",
      p.id,
      ...(p.scope ? ["--scope", String(p.scope)] : []),
    ];
    const r = claude(args, env);
    say(
      r.ok
        ? `Quité el plugin viejo ${p.id} (ahora todo viene en ${target}).`
        : `!! No pude quitar ${p.id}: ${(r.err || r.out).trim().split("\n")[0]}. A mano: claude plugin uninstall ${p.id}`,
    );
  }
  let m = claude(["plugin", "marketplace", "update", MARKETPLACE], env);
  if (!m.ok) {
    m = claude(["plugin", "marketplace", "add", repo], env);
    say(
      m.ok
        ? `Registré el marketplace ${MARKETPLACE} (${repo}).`
        : `!! No pude actualizar ni registrar el marketplace ${MARKETPLACE}: ${(m.err || m.out).trim().split("\n")[0]}`,
    );
  } else say(`Marketplace ${MARKETPLACE} actualizado.`);
  const has = before.some((x) => x.id === target);
  const r = claude(["plugin", has ? "update" : "install", target], env);
  const after = installedPlugins(env) ?? [];
  const ok = after.some((x) => x.id === target);
  if (ok)
    say(has ? `Plugin ${target} actualizado.` : `Plugin ${target} instalado.`);
  else
    say(
      `!! No quedó instalado ${target}: ${(r.err || r.out).trim().split("\n")[0]}. A mano: claude plugin install ${target}`,
    );
  const left = after
    .filter((x) => OLD_PLUGINS.some((o) => x.id === `${o}@${MARKETPLACE}`))
    .map((x) => x.id);
  if (left.length)
    say(
      `!! Siguen instalados plugins viejos: ${left.join(", ")}. A mano: claude plugin uninstall <plugin>`,
    );
  return ok && !left.length;
}

/** Steps 1 and 2. */
export function migrateJson(env = process.env) {
  const s = settingsFile(env);
  const rs = migrateSettings(s);
  say(
    {
      changed: `Permiso de herramientas actualizado a ${NEW_RULE} en ${s} (respaldo: .agentos-backup).`,
      unchanged: `Permisos de Claude: nada que cambiar (${s}).`,
      missing: `Permisos de Claude: no hay ${s}; nada que cambiar.`,
      invalid: `!! ${s} no es JSON válido; no lo toqué.`,
    }[rs],
  );
  const ds = desktopConfigs(env);
  if (!ds.length)
    say("Claude Desktop: no encontré su configuración; nada que cambiar.");
  for (const f of ds) {
    const rd = migrateDesktop(f);
    say(
      {
        changed: `Claude Desktop: el MCP agentos ahora apunta a plugins/agentos/server/src/mcp.mjs (${f}). Reinicia Claude Desktop.`,
        unchanged: `Claude Desktop: nada que cambiar (${f}).`,
        invalid: `!! ${f} no es JSON válido; no lo toqué.`,
      }[rd],
    );
  }
}

// The OLD bin/agentos (and agentos.ps1) cannot run new code: the shell already loaded the old script before `git pull`
// replaced it. The one new code it runs is `npm ci` in web/, so web/package.json's `postinstall` calls this with
// --from-npm. It acts only in a student copy (`.agentos-export` marker) and only when no new launcher/installer is
// running (they set AGENTOS_LAUNCHER=2 and migrate themselves). It never fails the npm install.
async function legacyHandoff(env = process.env) {
  if (!existsSync(join(REPO, ".agentos-export")) || env.AGENTOS_LAUNCHER)
    return;
  console.log(
    "\n==> AgentOS ahora es un solo plugin («agentos»): migrando tu instalación de Claude",
  );
  migrateJson(env);
  migrateClaudePlugins(env);
  // The old launcher restarts the server with the OLD path (plugins/agentos-core/...), which no longer exists. If the
  // server is already up when it gets there, it skips that and only starts the web.
  const port = Number(env.AGENTOS_PORT || 4780);
  const up = async () => {
    try {
      return (
        await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(800),
        })
      ).ok;
    } catch {
      return false;
    }
  };
  if (!(await up())) {
    const data = env.AGENTOS_HOME || join(REPO, "data");
    try {
      mkdirSync(join(data, "logs"), { recursive: true });
      mkdirSync(join(data, "run"), { recursive: true });
      const log = openSync(join(data, "logs", "server.log"), "a");
      const child = spawn(
        process.execPath,
        [join(REPO, "plugins", "agentos", "server", "src", "server.mjs")],
        { detached: true, windowsHide: true, stdio: ["ignore", log, log], env },
      );
      writeFileSync(join(data, "run", "server.pid"), `${child.pid}\n`);
      child.unref();
      for (let i = 0; i < 40 && !(await up()); i++)
        await new Promise((r) => setTimeout(r, 250));
      say(
        (await up())
          ? `Servidor iniciado con la ruta nueva (puerto ${port}).`
          : `!! El servidor no arrancó; revisa ${join(data, "logs", "server.log")}.`,
      );
    } catch (e) {
      say(`!! No pude iniciar el servidor: ${e.message}`);
    }
  }
  say(
    "Si ahora ves avisos de «plugin not found» para agentos-core, marketing-team, etc., ignóralos: esos 7 plugins ya son uno.",
  );
  say(
    "La próxima vez usa ./bin/agentos update (Windows .\\bin\\agentos.cmd update): ya trae esta migración.",
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--from-npm")) {
    try {
      await legacyHandoff();
    } catch (e) {
      console.log(`    !! Migración de plugins: ${e.message}`);
    }
    process.exit(0);
  }
  if (!args.includes("--plugins-only")) migrateJson();
  const ok = args.includes("--no-claude") ? true : migrateClaudePlugins();
  process.exit(ok ? 0 : 1);
}
