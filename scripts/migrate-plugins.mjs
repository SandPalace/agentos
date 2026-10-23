#!/usr/bin/env node
// Moves a Claude install from the 7 old AgentOS plugins (agentos-core, marketing-team, sales-team, collections-team,
// executive-team, finance-team, dev-team) to the single plugin `agentos@agentos`. Idempotent: safe to run any number of
// times. Zero dependencies. Messages to the person are Spanish, one line per step.
//
//   node scripts/migrate-plugins.mjs              run every step (bin/agentos update and the installers call this)
//   node scripts/migrate-plugins.mjs --no-claude  only the JSON steps (settings + Claude Desktop), no `claude plugin`
//   node scripts/migrate-plugins.mjs --plugins-only  only the `claude plugin` step
//   node scripts/migrate-plugins.mjs --no-settings / --no-desktop  skip step 1 / step 2 (installer flags of the same name)
//   node scripts/migrate-plugins.mjs --from-npm   hand-off from an OLD launcher (web `postinstall`); see legacyHandoff()
//
// Steps:
//   1. ~/.claude/settings.json: permission rules with the old tool prefixes are rewritten to the new ones
//      (mcp__plugin_agentos-core_agentos → mcp__plugin_agentos_agentos, …), and `env.AGENTOS_HOME`/`AGENTOS_ROOT` that
//      belong to ANOTHER AgentOS folder (the person moved this one; see foreignPath()) are pointed at this folder's
//      data/ and workspaces/. Keys that are not there are not added (the installer asks first). Everything else is kept.
//   2. Claude Desktop config: an `mcpServers.agentos` entry that points to plugins/agentos-core/server/src/mcp.mjs is
//      rewritten to plugins/agentos/server/src/mcp.mjs; one that points to the mcp.mjs of a folder that no longer has it
//      (moved) is pointed at this folder, and its env gets the same fix as step 1. Everything else is kept.
//   2b. The database (data/agentos.db): workspace roots, delivery paths and session folders saved under the workspaces/
//      of the old location of a moved folder are rewritten to this folder's workspaces/.
//   3. Claude Code plugins: uninstall each old `<p>@agentos`; the `agentos` marketplace is refreshed if it is this
//      folder, re-registered (remove + add) if it points to another folder (moved), added if missing; then install (or
//      update) `agentos@agentos`.
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
  realpathSync,
} from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { join, dirname, resolve, basename } from "node:path";
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

// ── Moved folder: paths that belong to another location of AgentOS ──
const canon = (p) => {
  let r;
  try {
    r = realpathSync.native(p);
  } catch {
    r = resolve(p);
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
};
/** Same folder? (realpath; case-insensitive on Windows.) */
export const sameDir = (a, b) => canon(a) === canon(b);
const isAgentosFolder = (x) =>
  existsSync(join(x, ".claude-plugin", "marketplace.json"));
// What a SessionStart hook leaves behind when Claude still has the old AGENTOS_HOME: data/ (and maybe workspaces/), nothing else.
const isLeftover = (x) => {
  try {
    return readdirSync(x).every((e) =>
      ["data", "workspaces", ".DS_Store"].includes(e),
    );
  } catch {
    return true; // gone
  }
};
/**
 * `p` is the `sub` folder (data | workspaces) of an AgentOS location that is not `repo`: another AgentOS folder, one
 * that no longer exists (it was moved) or its leftover. A custom path (any other name, or a folder with other content)
 * is not foreign. Same rule as foreign_dir in install.sh / bin/agentos.
 */
export function foreignPath(p, sub, repo = REPO) {
  if (typeof p !== "string" || !p) return false;
  const full = resolve(p);
  if (basename(full).toLowerCase() !== sub) return false;
  const x = dirname(full);
  if (sameDir(x, repo)) return false;
  return isAgentosFolder(x) || isLeftover(x);
}
/** The value env key `k` should have, or null to leave it alone. */
function repointValue(k, v, repo) {
  const sub = { AGENTOS_HOME: "data", AGENTOS_ROOT: "workspaces" }[k];
  if (!sub || !foreignPath(v, sub, repo)) return null;
  // Only when this folder really has that data (it was moved here); a fresh clone keeps the old one until the installer asks.
  const mine = join(repo, sub);
  return existsSync(mine) && v !== mine ? mine : null;
}
function repointEnv(env, repo) {
  if (!env || typeof env !== "object" || Array.isArray(env)) return false;
  let changed = false;
  for (const k of ["AGENTOS_HOME", "AGENTOS_ROOT"]) {
    const n = repointValue(k, env[k], repo);
    if (n) {
      env[k] = n;
      changed = true;
    }
  }
  return changed;
}

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
export function migrateSettings(file = settingsFile(), repo = REPO) {
  if (!existsSync(file)) return "missing";
  let c;
  try {
    c = readJson(file);
  } catch {
    return "invalid";
  }
  let changed = repointEnv(c.env, repo);
  const p =
    c.permissions && typeof c.permissions === "object" ? c.permissions : {};
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
const ANY_MCP =
  /^(.*)[\\/]plugins[\\/]agentos(?:-core)?[\\/]server[\\/]src[\\/]mcp\.mjs$/;

/** Step 2 for one file. Returns 'changed' | 'unchanged' | 'invalid'. */
export function migrateDesktop(file, repo = REPO) {
  let c;
  try {
    c = readJson(file);
  } catch {
    return "invalid";
  }
  const e = c.mcpServers?.agentos;
  if (!e || !Array.isArray(e.args)) return "unchanged";
  let changed = false;
  const mine = join(repo, "plugins", "agentos", "server", "src", "mcp.mjs");
  e.args = e.args.map((a) => {
    if (typeof a !== "string") return a;
    let n = a;
    if (OLD_MCP.test(n))
      n = n.replace(OLD_MCP, (_m, s) =>
        ["plugins", "agentos", "server", "src", "mcp.mjs"].join(s),
      );
    // Moved folder: the entry points to the mcp.mjs of a location that no longer has it.
    const m = n.match(ANY_MCP);
    if (m && !existsSync(n) && !sameDir(m[1], repo) && existsSync(mine))
      n = mine;
    if (n !== a) changed = true;
    return n;
  });
  if (repointEnv(e.env, repo)) changed = true;
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

/**
 * The registered `agentos` marketplace: { path, source } | null (not registered) | undefined (could not ask).
 * Uses `claude plugin marketplace list --json`; older CLIs without --json print «Source: Folder (<path>)».
 */
export function registeredMarketplace(env = process.env) {
  const j = claude(["plugin", "marketplace", "list", "--json"], env);
  if (j.ok) {
    try {
      const v = JSON.parse(j.out);
      const arr = Array.isArray(v)
        ? v
        : Array.isArray(v?.marketplaces)
          ? v.marketplaces
          : null;
      if (arr) {
        const e = arr.find((x) => x?.name === MARKETPLACE);
        if (!e) return null;
        const src = typeof e.source === "object" ? e.source : null;
        const path = e.path ?? src?.path ?? (src ? null : e.installLocation);
        return {
          path: typeof path === "string" && path ? path : null,
          source: String(src?.source ?? e.source ?? ""),
        };
      }
    } catch {
      /* fall back to the text list */
    }
  }
  const t = claude(["plugin", "marketplace", "list"], env);
  if (!t.ok) return undefined;
  const lines = t.out.split(/\r?\n/);
  const i = lines.findIndex((l) =>
    new RegExp(`^\\s*(?:❯|>|\\*|-)?\\s*${MARKETPLACE}\\s*$`).test(l),
  );
  if (i < 0) return /marketplace/i.test(t.out) ? null : undefined;
  const src = (lines[i + 1] || "").match(/Source:\s*(.*)$/);
  const folder = src?.[1].match(/^(?:Folder|Directory)\s*\((.*)\)\s*$/i);
  return {
    path: folder ? folder[1] : null,
    source: src ? src[1].trim() : "",
  };
}

/**
 * Step 2b. Paths saved in the database under the workspaces/ of a moved folder's old location → this folder's
 * workspaces/. Returns the number of rows changed (0 when there is nothing to do, or no database).
 */
export async function repointDb(repo = REPO) {
  const file = join(repo, "data", "agentos.db");
  const mineRoot = join(repo, "workspaces");
  if (!existsSync(file) || !existsSync(mineRoot)) return 0;
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return 0; // Node too old: the installer stops before this anyway
  }
  const db = new DatabaseSync(file);
  try {
    const has = (t, c) =>
      db
        .prepare(`PRAGMA table_info(${t})`)
        .all()
        .some((x) => x.name === c);
    if (!has("workspaces", "root")) return 0;
    // Old locations = parents of `<X>/workspaces/<id>` roots where <X>/workspaces is foreign (see foreignPath).
    const olds = new Set();
    for (const { root } of db
      .prepare("SELECT root FROM workspaces WHERE root IS NOT NULL")
      .all()) {
      const w = dirname(resolve(root));
      if (basename(w) === "workspaces" && foreignPath(w, "workspaces", repo))
        olds.add(w);
    }
    let n = 0;
    for (const old of olds)
      for (const [t, c] of [
        ["workspaces", "root"],
        ["outputs", "path"],
        ["sessions", "cwd"],
      ]) {
        if (!has(t, c)) continue;
        for (const pre of [old + "/", old + "\\"])
          n += Number(
            db
              .prepare(
                `UPDATE ${t} SET ${c} = ? || substr(${c}, ?) WHERE substr(${c}, 1, ?) = ?`,
              )
              .run(mineRoot + pre.slice(-1), pre.length + 1, pre.length, pre)
              .changes,
          );
        n += Number(
          db
            .prepare(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`)
            .run(mineRoot, old).changes,
        );
      }
    return n;
  } finally {
    db.close();
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
  const first = (x) => (x.err || x.out).trim().split("\n")[0];
  const add = () => {
    const a = claude(["plugin", "marketplace", "add", repo], env);
    say(
      a.ok
        ? `Registré el marketplace ${MARKETPLACE} (${repo}).`
        : `!! No pude registrar el marketplace ${MARKETPLACE}: ${first(a)}. A mano: claude plugin marketplace add "${repo}"`,
    );
  };
  const reg = registeredMarketplace(env);
  let moved = false;
  if (reg === null) add();
  else if (reg && !(reg.path && sameDir(reg.path, repo))) {
    // The folder was moved (or registered from somewhere else): Claude would keep loading the plugin from the old path.
    moved = true;
    const rm = claude(["plugin", "marketplace", "remove", MARKETPLACE], env);
    say(
      rm.ok
        ? `El marketplace ${MARKETPLACE} apuntaba a otra carpeta (${reg.path || reg.source || "?"}); lo quité para registrarlo aquí.`
        : `!! No pude quitar el marketplace ${MARKETPLACE} viejo (${reg.path || "?"}): ${first(rm)}. A mano: claude plugin marketplace remove ${MARKETPLACE}`,
    );
    add();
  } else {
    // reg = this folder, or undefined (could not read the list): refresh, and register if it is not there.
    const m = claude(["plugin", "marketplace", "update", MARKETPLACE], env);
    if (m.ok) say(`Marketplace ${MARKETPLACE} actualizado.`);
    else add();
  }
  // Removing a marketplace uninstalls its plugins: ask again what is installed.
  const now = moved ? (installedPlugins(env) ?? before) : before;
  const has = now.some((x) => x.id === target);
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

/** Steps 1, 2 and 2b. `settings: false` / `desktop: false` skip step 1 / 2 (installer flags --no-settings / --no-desktop). */
export async function migrateJson(
  env = process.env,
  { settings = true, desktop = true, repo = REPO } = {},
) {
  if (settings) {
    const s = settingsFile(env);
    const rs = migrateSettings(s, repo);
    say(
      {
        changed: `Configuración de Claude Code actualizada (permiso ${NEW_RULE}, rutas AGENTOS_HOME/AGENTOS_ROOT) en ${s} (respaldo: .agentos-backup).`,
        unchanged: `Configuración de Claude Code: nada que cambiar (${s}).`,
        missing: `Configuración de Claude Code: no hay ${s}; nada que cambiar.`,
        invalid: `!! ${s} no es JSON válido; no lo toqué.`,
      }[rs],
    );
  }
  if (desktop) {
    const ds = desktopConfigs(env);
    if (!ds.length)
      say("Claude Desktop: no encontré su configuración; nada que cambiar.");
    for (const f of ds) {
      const rd = migrateDesktop(f, repo);
      say(
        {
          changed: `Claude Desktop: el MCP agentos ahora apunta a ${join(repo, "plugins", "agentos", "server", "src", "mcp.mjs")} (${f}). Reinicia Claude Desktop.`,
          unchanged: `Claude Desktop: nada que cambiar (${f}).`,
          invalid: `!! ${f} no es JSON válido; no lo toqué.`,
        }[rd],
      );
    }
  }
  try {
    const n = await repointDb(repo);
    if (n)
      say(
        `Base de datos: ${n} rutas de la ubicación anterior de esta carpeta ahora apuntan a ${join(repo, "workspaces")}.`,
      );
  } catch (e) {
    say(`!! No pude revisar las rutas de la base de datos: ${e.message}`);
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
  await migrateJson(env);
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
  if (!args.includes("--plugins-only"))
    await migrateJson(process.env, {
      settings: !args.includes("--no-settings"),
      desktop: !args.includes("--no-desktop"),
    });
  const ok = args.includes("--no-claude") ? true : migrateClaudePlugins();
  process.exit(ok ? 0 : 1);
}
