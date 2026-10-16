#!/usr/bin/env bash
# Instalador de AgentOS (macOS / Linux). Se corre una vez después de clonar el repo.
# Opciones: --reset-login  --no-claude  --no-claude-cli  --no-desktop  --no-settings
# Variables: AGENTOS_PORT (4780), AGENTOS_WEB_PORT (4781), AGENTOS_HOME (~/.agentos),
#            AGENTOS_USER / AGENTOS_PASSWORD (modo no interactivo)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MKT="agentos"
PLUGINS=(agentos-core marketing-team sales-team)
PORT="${AGENTOS_PORT:-4780}"
export AGENTOS_HOME="${AGENTOS_HOME:-$HOME/.agentos}"
RESET_LOGIN=0; DO_CLI=1; DO_DESKTOP=1; DO_SETTINGS=1
for a in "$@"; do
  case "$a" in
    --reset-login) RESET_LOGIN=1 ;;
    --no-claude) DO_CLI=0; DO_DESKTOP=0; DO_SETTINGS=0 ;;
    --no-settings) DO_SETTINGS=0 ;;
    --no-claude-cli) DO_CLI=0 ;;
    --no-desktop) DO_DESKTOP=0 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $a"; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
ok()   { printf '    OK  %s\n' "$*"; }
warn() { printf '    !!  %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
case "$OS" in Darwin|Linux) ;; *) die "Este instalador es para macOS o Linux. En Windows usa WSL (ver INSTALL.md).";; esac

# 1. Node
step "1/8 Revisando Node.js"
if ! command -v node >/dev/null 2>&1; then
  die "No encontré Node.js. Instálalo (versión 24 LTS recomendada) desde https://nodejs.org o con: brew install node   (en Mac con Homebrew). Luego abre una terminal nueva y corre ./install.sh otra vez."
fi
NODE_BIN="$(command -v node)"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null \
   || ! node -e 'require("node:sqlite")' >/dev/null 2>&1; then
  die "Tu Node es $(node -v) y es muy viejo (AgentOS necesita 22.13 o más nuevo; recomendamos 24 LTS). Actualiza desde https://nodejs.org o con: brew upgrade node. Luego abre una terminal nueva y vuelve a correr ./install.sh"
fi
command -v npm >/dev/null 2>&1 || die "Node está instalado pero falta npm. Reinstala Node desde https://nodejs.org"
ok "Node $(node -v)"

# 2. Claude CLI
step "2/8 Revisando Claude Code"
HAVE_CLAUDE=0
if [ "$DO_CLI" = 1 ]; then
  if command -v claude >/dev/null 2>&1; then HAVE_CLAUDE=1; ok "claude encontrado"
  else
    warn "No encontré el comando 'claude'. Instala Claude Code con:"
    echo "        curl -fsSL https://claude.ai/install.sh | bash"
    echo "        (o: npm install -g @anthropic-ai/claude-code). Luego corre ./install.sh otra vez."
    die "Falta Claude Code."
  fi
else ok "Omitido (--no-claude)"; fi

# 3. Web
step "3/8 Instalando y compilando la oficina web (tarda unos minutos)"
(
  cd "$REPO/web"
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  NEXT_PUBLIC_AGENTOS_PORT="$PORT" NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build
) || die "Falló la instalación o compilación de la web. Revisa tu conexión a internet y corre ./install.sh otra vez."
ok "Web compilada"

# 4. Plugins
step "4/8 Registrando los plugins en Claude Code"
if [ "$DO_CLI" = 1 ] && [ "$HAVE_CLAUDE" = 1 ]; then
  if claude plugin marketplace list 2>/dev/null | grep -q "$MKT"; then
    claude plugin marketplace update "$MKT" >/dev/null 2>&1 || true
    ok "Marketplace '$MKT' ya existía (actualizado)"
  else
    claude plugin marketplace add "$REPO" || die "No pude registrar el marketplace."
    ok "Marketplace registrado"
  fi
  for p in "${PLUGINS[@]}"; do
    if claude plugin install "$p@$MKT" >/dev/null 2>&1; then ok "$p instalado"
    else claude plugin list 2>/dev/null | grep -q "$p@$MKT" && ok "$p ya estaba instalado" || warn "No pude instalar $p (pruébalo a mano: claude plugin install $p@$MKT)"; fi
  done
else ok "Omitido"; fi

# 5. Claude Desktop
step "5/8 Conectando Claude Desktop"
if [ "$DO_DESKTOP" = 1 ] && [ "$OS" = Darwin ]; then
  CFG_DIR="$HOME/Library/Application Support/Claude"
  mkdir -p "$CFG_DIR"
  CFG="$CFG_DIR/claude_desktop_config.json"
  [ -f "$CFG" ] && cp "$CFG" "$CFG.agentos-backup" 
  if CFG="$CFG" NODE_BIN="$NODE_BIN" MCP="$REPO/plugins/agentos-core/server/src/mcp.mjs" PORT="$PORT" node -e '
    const fs=require("fs");const f=process.env.CFG;let c={};
    if(fs.existsSync(f)){const t=fs.readFileSync(f,"utf8").trim();if(t){try{c=JSON.parse(t)}catch(e){console.error("JSON inválido");process.exit(3)}}}
    c.mcpServers=c.mcpServers||{};
    const e={command:process.env.NODE_BIN,args:[process.env.MCP]};
    if(process.env.PORT!=="4780")e.env={AGENTOS_PORT:process.env.PORT};
    c.mcpServers.agentos=e;
    fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n");'; then
    ok "Claude Desktop configurado (respaldo: $CFG.agentos-backup). Reinicia Claude Desktop."
  else warn "No pude editar $CFG (¿JSON dañado?). Tu archivo no se tocó."; fi
elif [ "$DO_DESKTOP" = 1 ]; then ok "Omitido (solo macOS)"; else ok "Omitido"; fi

# 5b. Permisos de Claude Code
step "5b Permiso para las herramientas de AgentOS en Claude Code"
# Cambia la configuración de Claude de la persona: siempre se pregunta (o se decide con AGENTOS_ALLOW_MCP=yes|no).
ALLOW="${AGENTOS_ALLOW_MCP:-}"
if [ "$DO_SETTINGS" = 1 ] && [ -z "$ALLOW" ]; then
  if [ -r /dev/tty ]; then
    echo "    Tus agentes guardan tareas, leads y archivos con las herramientas de AgentOS."
    echo "    Si no las permites, Claude te pedirá aprobarlas cada vez (puedes elegir «Permitir siempre» ahí)."
    if read -r -p "    ¿Permitir que Claude use las herramientas de AgentOS sin pedir aprobación? [S/n] " ANS </dev/tty 2>/dev/null; then
      case "$(printf '%s' "$ANS" | tr '[:upper:]' '[:lower:]')" in n|no) ALLOW=no ;; *) ALLOW=yes ;; esac
    else
      ALLOW=no; warn "No pude preguntarte: no cambio tus permisos de Claude (usa AGENTOS_ALLOW_MCP=yes para hacerlo)."
    fi
  else
    ALLOW=no; warn "Sin terminal interactiva: no cambio tus permisos de Claude (usa AGENTOS_ALLOW_MCP=yes para hacerlo)."
  fi
fi
if [ "$DO_SETTINGS" = 1 ] && [ "$ALLOW" != yes ]; then
  ok "No cambié tus permisos. Cuando Claude pida aprobar una herramienta de AgentOS, elige «Permitir siempre»."
  DO_SETTINGS=0
fi
if [ "$DO_SETTINGS" = 1 ]; then
  SET_DIR="$HOME/.claude"; SET="$SET_DIR/settings.json"
  mkdir -p "$SET_DIR"
  if SET="$SET" node -e '
    const fs=require("fs");const f=process.env.SET;let c={};
    if(fs.existsSync(f)){const t=fs.readFileSync(f,"utf8").trim();if(t){try{c=JSON.parse(t)}catch(e){process.exit(3)}}}
    if(c===null||typeof c!=="object"||Array.isArray(c))process.exit(3);
    const rule="mcp__plugin_agentos-core_agentos";
    c.permissions=c.permissions&&typeof c.permissions==="object"?c.permissions:{};
    if(!Array.isArray(c.permissions.allow))c.permissions.allow=[];
    if(c.permissions.allow.includes(rule)){console.log("    OK  La regla ya estaba en "+f);process.exit(0)}
    if(fs.existsSync(f))fs.copyFileSync(f,f+".agentos-backup");
    c.permissions.allow.push(rule);
    fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n");
    console.log("    OK  Agregué permissions.allow: "+rule+" en "+f+" (respaldo: "+f+".agentos-backup)");'; then :
  else warn "No pude editar $SET (¿JSON dañado?). No se tocó. Sin este permiso Claude te pedirá aprobar las herramientas de AgentOS."; fi
elif [ "$ALLOW" != no ]; then ok "Omitido"; fi

# 6. Login
step "6/8 Usuario y contraseña de la oficina web"
mkdir -p "$AGENTOS_HOME"
ENVF="$AGENTOS_HOME/.env"
if [ -f "$ENVF" ] && [ "$RESET_LOGIN" = 0 ]; then
  ok "Ya existe $ENVF (usa --reset-login para cambiarlo)"
else
  U="${AGENTOS_USER:-}"; P="${AGENTOS_PASSWORD:-}"
  if [ -z "$U" ]; then
    [ -r /dev/tty ] || die "No hay terminal interactiva. Define AGENTOS_USER y AGENTOS_PASSWORD."
    while [ -z "$U" ]; do read -r -p "    Elige un usuario: " U </dev/tty; done
    while true; do
      read -r -s -p "    Elige una contraseña (mín. 8 caracteres): " P </dev/tty; echo
      read -r -s -p "    Repítela: " P2 </dev/tty; echo
      [ "${#P}" -ge 8 ] && [ "$P" = "$P2" ] && break
      warn "No coinciden o son menos de 8 caracteres. Intenta de nuevo."
    done
  fi
  [ -n "$P" ] || die "Contraseña vacía."
  case "$U$P" in *$'\n'*) die "Usuario y contraseña no pueden tener saltos de línea.";; esac
  ( umask 077; printf 'AGENTOS_USER=%s\nAGENTOS_PASSWORD=%s\n' "$U" "$P" >"$ENVF" )
  chmod 600 "$ENVF"
  ok "Guardado en $ENVF"
fi

# 7. Carpeta de trabajo
step "7/8 Creando ~/AgentOS"
mkdir -p "${AGENTOS_ROOT:-$HOME/AgentOS}" "$AGENTOS_HOME/logs"
ok "${AGENTOS_ROOT:-$HOME/AgentOS}"

# 8. Comando agentos
step "8/8 Instalando el comando 'agentos'"
chmod +x "$REPO/bin/agentos"
BIN_DIR=""
for d in "$HOME/.local/bin" /usr/local/bin; do
  mkdir -p "$d" 2>/dev/null || true
  if [ -w "$d" ]; then BIN_DIR="$d"; break; fi
done
if [ -n "$BIN_DIR" ]; then
  ln -sf "$REPO/bin/agentos" "$BIN_DIR/agentos"
  ok "$BIN_DIR/agentos"
  case ":$PATH:" in *":$BIN_DIR:"*) ;; *)
    warn "$BIN_DIR no está en tu PATH. Agrega esta línea a ~/.zshrc y abre una terminal nueva:"
    echo "        export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac
else
  warn "No encontré dónde instalar el comando. Úsalo así: $REPO/bin/agentos start"
fi

cat <<MSG

Listo. Siguiente paso:
    agentos start
y entra con el usuario que acabas de crear (http://localhost:${AGENTOS_WEB_PORT:-4781}).
MSG
