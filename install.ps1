<#
.SYNOPSIS
  Instalador de AgentOS para Windows (PowerShell 5.1 o 7). Se corre una vez despues de clonar el repo.
.DESCRIPTION
  Uso (recomendado, evita el bloqueo de scripts de Windows):
    powershell -ExecutionPolicy Bypass -File .\install.ps1
  Opciones: -ResetLogin  -NoClaude  -NoClaudeCli  -NoDesktop  -NoSettings
  Variables: AGENTOS_PORT (4780), AGENTOS_WEB_PORT (4781), AGENTOS_HOME (<repo>\data), AGENTOS_ROOT (<repo>\workspaces),
             AGENTOS_USER / AGENTOS_PASSWORD (modo no interactivo), AGENTOS_ALLOW_MCP=yes|no
#>
param(
  [switch]$ResetLogin,
  [switch]$NoClaude,
  [switch]$NoClaudeCli,
  [switch]$NoDesktop,
  [switch]$NoSettings
)
# Continue (no Stop): en PowerShell 5.1 los avisos por stderr de programas externos romperian el script con Stop.
$ErrorActionPreference = 'Continue'

$REPO = $PSScriptRoot
$MKT = 'agentos'
$PLUGINS = @('agentos-core', 'marketing-team', 'sales-team', 'collections-team', 'executive-team', 'dev-team')
$PORT = if ($env:AGENTOS_PORT) { $env:AGENTOS_PORT } else { '4780' }
$WEB_PORT = if ($env:AGENTOS_WEB_PORT) { $env:AGENTOS_WEB_PORT } else { '4781' }
# Todo vive dentro de esta carpeta: datos en <repo>\data y workspaces en <repo>\workspaces.
# Si hay datos de una instalacion anterior y aun no existen los nuevos, el servidor sigue usando los viejos
# hasta que los migres; aqui hacemos lo mismo para no apuntar a una carpeta vacia.
$LEGACY = $false
$legacyHome = Join-Path $env:USERPROFILE '.agentos'
$legacyRoot = Join-Path $env:USERPROFILE 'AgentOS'
if ($env:AGENTOS_HOME) { $AGENTOS_HOME = $env:AGENTOS_HOME }
elseif ((Test-Path $legacyHome) -and -not (Test-Path (Join-Path $REPO 'data'))) { $AGENTOS_HOME = $legacyHome; $LEGACY = $true }
else { $AGENTOS_HOME = Join-Path $REPO 'data' }
if ($env:AGENTOS_ROOT) { $ROOT_DIR = $env:AGENTOS_ROOT }
elseif ((Test-Path $legacyRoot) -and -not (Test-Path (Join-Path $REPO 'workspaces'))) { $ROOT_DIR = $legacyRoot; $LEGACY = $true }
else { $ROOT_DIR = Join-Path $REPO 'workspaces' }
$env:AGENTOS_HOME = $AGENTOS_HOME
$env:AGENTOS_ROOT = $ROOT_DIR

$DO_CLI = $true; $DO_DESKTOP = $true; $DO_SETTINGS = $true
if ($NoClaude) { $DO_CLI = $false; $DO_DESKTOP = $false; $DO_SETTINGS = $false }
if ($NoClaudeCli) { $DO_CLI = $false }
if ($NoDesktop) { $DO_DESKTOP = $false }
if ($NoSettings) { $DO_SETTINGS = $false }

function Step($m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    !!  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host ''; Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function Test-Interactive { return (-not [Console]::IsInputRedirected) -and [Environment]::UserInteractive }
function Write-Utf8NoBom($path, $text) {
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}
# Corre un script de node guardado en un archivo temporal (evita problemas de comillas en PowerShell 5.1).
function Invoke-NodeScript($nodeExe, $code) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('agentos-' + [guid]::NewGuid().ToString('N') + '.cjs')
  Write-Utf8NoBom $tmp $code
  try { & $nodeExe $tmp | Out-Host; return $LASTEXITCODE } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

if ((Test-Path $legacyHome) -or (Test-Path $legacyRoot)) {
  Warn 'Encontre datos de una instalacion anterior en %USERPROFILE%\.agentos / \AgentOS. Para pasarlos a esta carpeta corre: node scripts/migrate-to-project-folder.mjs (o pidele a Claude "migra AgentOS a la carpeta del proyecto").'
}

if ($env:OS -ne 'Windows_NT') { Die 'Este instalador es para Windows. En macOS o Linux usa ./install.sh' }

# 1. Node, Git
Step '1/7 Revisando Node.js y Git'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Die ('No encontre Node.js. Instalalo (version 24 LTS recomendada) desde https://nodejs.org o con: winget install OpenJS.NodeJS.LTS' + "`n" + '       Luego abre una terminal NUEVA y corre este instalador otra vez.')
}
$NODE_BIN = $nodeCmd.Source
$nodeV = (& node -v) 2>$null
$m = [regex]::Match([string]$nodeV, '^v(\d+)\.(\d+)')
$nodeOk = $false
if ($m.Success) {
  $maj = [int]$m.Groups[1].Value; $min = [int]$m.Groups[2].Value
  if ($maj -gt 22 -or ($maj -eq 22 -and $min -ge 13)) { $nodeOk = $true }
}
if ($nodeOk) {
  & node -e "require('node:sqlite')" *> $null
  if ($LASTEXITCODE -ne 0) { $nodeOk = $false }
}
if (-not $nodeOk) {
  Die ("Tu Node es $nodeV y es muy viejo (AgentOS necesita 22.13 o mas nuevo; recomendamos 24 LTS). Actualiza desde https://nodejs.org o con: winget upgrade OpenJS.NodeJS.LTS" + "`n" + '       Luego abre una terminal NUEVA y vuelve a correr el instalador.')
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die 'Node esta instalado pero falta npm. Reinstala Node desde https://nodejs.org' }
Ok "Node $nodeV ($NODE_BIN)"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Warn 'No encontre Git. Instalalo desde https://git-scm.com/download/win o con: winget install Git.Git'
  Warn 'Sin Git el comando ".\bin\agentos.cmd update" no va a funcionar (lo demas si).'
} else { Ok 'Git encontrado' }

# 2. Claude CLI
Step '2/7 Revisando Claude Code'
$HAVE_CLAUDE = $false
if ($DO_CLI) {
  if (Get-Command claude -ErrorAction SilentlyContinue) { $HAVE_CLAUDE = $true; Ok 'claude encontrado' }
  else {
    Warn "No encontre el comando 'claude'. Instala Claude Code con alguna de estas opciones:"
    Write-Host '        winget install Anthropic.ClaudeCode'
    Write-Host '        irm https://claude.ai/install.ps1 | iex'
    Write-Host '        npm install -g @anthropic-ai/claude-code'
    Die 'Falta Claude Code. Instalalo, abre una terminal NUEVA y corre el instalador otra vez (o usa -NoClaudeCli).'
  }
} else { Ok 'Omitido (-NoClaude / -NoClaudeCli)' }

# 3. Web
Step '3/7 Instalando y compilando la oficina web (tarda unos minutos)'
Push-Location (Join-Path $REPO 'web')
try {
  if (Test-Path 'package-lock.json') { & npm ci --no-audit --no-fund } else { & npm install --no-audit --no-fund }
  if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'Fallo npm. Revisa tu conexion a internet (y que el antivirus no bloquee npm) y corre el instalador otra vez.' }
  $env:NEXT_PUBLIC_AGENTOS_PORT = $PORT
  $env:NEXT_TELEMETRY_DISABLED = '1'
  & node (Join-Path 'node_modules' 'next\dist\bin\next') build
  if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'Fallo la compilacion de la web. Corre el instalador otra vez; si sigue, mandale la salida a tu instructor.' }
} finally { Pop-Location -ErrorAction SilentlyContinue }
Ok 'Web compilada'

# 4. Plugins
Step '4/7 Registrando los plugins en Claude Code'
if ($DO_CLI -and $HAVE_CLAUDE) {
  $list = (& claude plugin marketplace list 2>&1 | Out-String)
  if ($list -match [regex]::Escape($MKT)) {
    & claude plugin marketplace update $MKT *> $null
    Ok "Marketplace '$MKT' ya existia (actualizado)"
  } else {
    & claude plugin marketplace add $REPO
    if ($LASTEXITCODE -ne 0) { Die 'No pude registrar el marketplace.' }
    Ok 'Marketplace registrado'
  }
  foreach ($p in $PLUGINS) {
    & claude plugin install "$p@$MKT" *> $null
    if ($LASTEXITCODE -eq 0) { Ok "$p instalado" }
    else {
      $inst = (& claude plugin list 2>&1 | Out-String)
      if ($inst -match [regex]::Escape("$p@$MKT")) { Ok "$p ya estaba instalado" }
      else { Warn "No pude instalar $p (pruebalo a mano: claude plugin install $p@$MKT)" }
    }
  }
} else { Ok 'Omitido' }

# 5. Claude Desktop
Step '5/7 Conectando Claude Desktop'
if ($DO_DESKTOP) {
  $cfgDirs = @()
  $cfgDirs += (Join-Path $env:APPDATA 'Claude')
  # Claude Desktop instalado desde Microsoft Store guarda su config en otra carpeta.
  if ($env:LOCALAPPDATA) {
    $pk = Join-Path $env:LOCALAPPDATA 'Packages'
    if (Test-Path $pk) {
      Get-ChildItem $pk -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue | ForEach-Object {
        $d = Join-Path $_.FullName 'LocalCache\Roaming\Claude'
        if (Test-Path $d) { $cfgDirs += $d }
      }
    }
  }
  $mergeJs = @'
const fs = require('fs');
const f = process.env.CFG;
let c = {};
if (fs.existsSync(f)) {
  const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim();
  if (t) { try { c = JSON.parse(t); } catch (e) { console.error('JSON invalido'); process.exit(3); } }
}
if (c === null || typeof c !== 'object' || Array.isArray(c)) process.exit(3);
c.mcpServers = c.mcpServers || {};
const e = { command: process.env.NODE_BIN, args: [process.env.MCP] };
e.env = process.env.LEGACY === '1' ? {} : { AGENTOS_HOME: process.env.AGENTOS_HOME, AGENTOS_ROOT: process.env.AGENTOS_ROOT };
if (process.env.PORT !== '4780') e.env.AGENTOS_PORT = process.env.PORT;
if (!Object.keys(e.env).length) delete e.env;
c.mcpServers.agentos = e;
fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n');
'@
  $env:NODE_BIN = $NODE_BIN
  $env:MCP = Join-Path $REPO 'plugins\agentos-core\server\src\mcp.mjs'
  $env:PORT = $PORT
  $env:LEGACY = if ($LEGACY) { '1' } else { '0' }
  foreach ($dir in $cfgDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $cfg = Join-Path $dir 'claude_desktop_config.json'
    if (Test-Path $cfg) { Copy-Item $cfg "$cfg.agentos-backup" -Force }
    $env:CFG = $cfg
    $rc = Invoke-NodeScript $NODE_BIN $mergeJs
    if ($rc -eq 0) { Ok "Claude Desktop configurado en $cfg (respaldo: $cfg.agentos-backup). Reinicia Claude Desktop." }
    else { Warn "No pude editar $cfg (JSON danado?). Tu archivo no se toco." }
  }
  Remove-Item Env:\CFG, Env:\NODE_BIN, Env:\MCP, Env:\PORT, Env:\LEGACY -ErrorAction SilentlyContinue
} else { Ok 'Omitido' }

# 5b. Permisos de Claude Code
Step '5b Permiso para las herramientas de AgentOS en Claude Code'
# Cambia la configuracion de Claude de la persona: siempre se pregunta (o se decide con AGENTOS_ALLOW_MCP=yes|no).
$ALLOW = $env:AGENTOS_ALLOW_MCP
if ($DO_SETTINGS -and -not $ALLOW) {
  if (Test-Interactive) {
    Write-Host '    Tus agentes guardan tareas, leads y archivos con las herramientas de AgentOS.'
    Write-Host '    Si no las permites, Claude te pedira aprobarlas cada vez (puedes elegir "Permitir siempre" ahi).'
    $ans = Read-Host '    Permitir que Claude use las herramientas de AgentOS sin pedir aprobacion? [S/n]'
    if ($ans -match '^(n|no)$') { $ALLOW = 'no' } else { $ALLOW = 'yes' }
  } else {
    $ALLOW = 'no'
    Warn 'Sin terminal interactiva: no cambio tus permisos de Claude (usa $env:AGENTOS_ALLOW_MCP="yes" para hacerlo).'
  }
}
function Show-EnvJson {
  Warn ('Para que los hooks y las herramientas de Claude encuentren tus datos, agrega esto a ' + (Join-Path $env:USERPROFILE '.claude\settings.json') + ':')
  $hj = $AGENTOS_HOME.Replace('\', '\\'); $rj = $ROOT_DIR.Replace('\', '\\')
  Write-Host ('        "env": {"AGENTOS_HOME": "' + $hj + '", "AGENTOS_ROOT": "' + $rj + '"}')
}
if ($DO_SETTINGS -and $ALLOW -ne 'yes') {
  Ok 'No cambie tus permisos. Cuando Claude pida aprobar una herramienta de AgentOS, elige "Permitir siempre".'
  Show-EnvJson
  $DO_SETTINGS = $false
}
if ($DO_SETTINGS) {
  $setDir = Join-Path $env:USERPROFILE '.claude'
  $set = Join-Path $setDir 'settings.json'
  New-Item -ItemType Directory -Force -Path $setDir | Out-Null
  $allowJs = @'
const fs = require('fs');
const f = process.env.SET;
let c = {};
if (fs.existsSync(f)) {
  const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim();
  if (t) { try { c = JSON.parse(t); } catch (e) { process.exit(3); } }
}
if (c === null || typeof c !== 'object' || Array.isArray(c)) process.exit(3);
const rule = 'mcp__plugin_agentos-core_agentos';
c.permissions = c.permissions && typeof c.permissions === 'object' ? c.permissions : {};
if (!Array.isArray(c.permissions.allow)) c.permissions.allow = [];
const env = c.env && typeof c.env === 'object' && !Array.isArray(c.env) ? c.env : {};
const legacy = process.env.LEGACY === '1';
const hasRule = c.permissions.allow.includes(rule);
const hasEnv = legacy || (env.AGENTOS_HOME === process.env.AGENTOS_HOME && env.AGENTOS_ROOT === process.env.AGENTOS_ROOT);
if (hasRule && hasEnv) { console.log('    OK  La regla y las rutas ya estaban en ' + f); process.exit(0); }
if (fs.existsSync(f)) fs.copyFileSync(f, f + '.agentos-backup');
if (!hasRule) c.permissions.allow.push(rule);
if (!legacy) { env.AGENTOS_HOME = process.env.AGENTOS_HOME; env.AGENTOS_ROOT = process.env.AGENTOS_ROOT; c.env = env; }
fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n');
console.log('    OK  Agregue permissions.allow: ' + rule + ' y env AGENTOS_HOME/AGENTOS_ROOT en ' + f + ' (respaldo: ' + f + '.agentos-backup)');
'@
  $env:SET = $set
  $env:LEGACY = if ($LEGACY) { '1' } else { '0' }
  $rc = Invoke-NodeScript $NODE_BIN $allowJs
  Remove-Item Env:\SET, Env:\LEGACY -ErrorAction SilentlyContinue
  if ($rc -ne 0) { Warn "No pude editar $set (JSON danado?). No se toco. Sin este permiso Claude te pedira aprobar las herramientas de AgentOS."; Show-EnvJson }
} elseif ($ALLOW -ne 'no') { Ok 'Omitido' }

# 6. Login
Step '6/7 Usuario y contrasena de la oficina web'
New-Item -ItemType Directory -Force -Path $AGENTOS_HOME | Out-Null
$ENVF = Join-Path $AGENTOS_HOME '.env'
if ((Test-Path $ENVF) -and -not $ResetLogin) {
  Ok "Ya existe $ENVF (usa -ResetLogin para cambiarlo)"
} else {
  $U = $env:AGENTOS_USER; $P = $env:AGENTOS_PASSWORD
  if (-not $U) {
    if (-not (Test-Interactive)) { Die 'No hay terminal interactiva. Define AGENTOS_USER y AGENTOS_PASSWORD.' }
    while (-not $U) { $U = (Read-Host '    Elige un usuario').Trim() }
    while ($true) {
      $s1 = Read-Host '    Elige una contrasena (min. 8 caracteres)' -AsSecureString
      $s2 = Read-Host '    Repitela' -AsSecureString
      $b1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s1)
      $b2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s2)
      try {
        $P = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b1)
        $P2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b2)
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b1)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b2)
      }
      if ($P.Length -ge 8 -and $P -ceq $P2) { break }
      Warn 'No coinciden o son menos de 8 caracteres. Intenta de nuevo.'
    }
  }
  if (-not $P) { Die 'Contrasena vacia.' }
  if (($U + $P) -match "[\r\n]") { Die 'Usuario y contrasena no pueden tener saltos de linea.' }
  Write-Utf8NoBom $ENVF ("AGENTOS_USER=$U`nAGENTOS_PASSWORD=$P`n")
  # Solo tu usuario puede leer/escribir el archivo.
  & icacls $ENVF /inheritance:r /grant:r "$($env:USERNAME):(R,W)" *> $null
  if ($LASTEXITCODE -ne 0) { Warn 'No pude restringir los permisos del archivo (no es grave, es tu carpeta personal).' }
  Ok "Guardado en $ENVF"
}

# 7. Carpeta de trabajo
Step '7/7 Creando la carpeta de workspaces'
New-Item -ItemType Directory -Force -Path $ROOT_DIR | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AGENTOS_HOME 'logs') | Out-Null
Ok $ROOT_DIR

Write-Host ''
Write-Host 'Listo. Siguiente paso, desde la carpeta de AgentOS:'
Write-Host '    .\bin\agentos.cmd start'
Write-Host '(el comando vive dentro de esta carpeta; no se instala nada en tu sistema)'
Write-Host "y entra con el usuario que acabas de crear (http://localhost:$WEB_PORT)."
Write-Host 'Si Windows pregunta por el Firewall para "node", elige "Permitir" (solo redes privadas).'
