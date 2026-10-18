<#
  Comando `agentos` para Windows: start | stop | status | update | whatsapp
  Lo llama bin\agentos.cmd, dentro de la carpeta de AgentOS (no se instala en el PATH).
#>
param([Parameter(Position = 0)][string]$Command = '', [Parameter(ValueFromRemainingArguments = $true)]$Rest)
$ErrorActionPreference = 'Continue'

$REPO = Split-Path -Parent $PSScriptRoot
# Datos en <repo>\data y workspaces en <repo>\workspaces (misma regla que el servidor: si solo existen las
# carpetas de una instalacion anterior, %USERPROFILE%\.agentos / \AgentOS, se siguen usando hasta migrarlas).
$legacyHome = Join-Path $env:USERPROFILE '.agentos'
$legacyRoot = Join-Path $env:USERPROFILE 'AgentOS'
$AGENTOS_HOME = if ($env:AGENTOS_HOME) { $env:AGENTOS_HOME }
  elseif ((Test-Path $legacyHome) -and -not (Test-Path (Join-Path $REPO 'data'))) { $legacyHome }
  else { Join-Path $REPO 'data' }
$AGENTOS_ROOT = if ($env:AGENTOS_ROOT) { $env:AGENTOS_ROOT }
  elseif ((Test-Path $legacyRoot) -and -not (Test-Path (Join-Path $REPO 'workspaces'))) { $legacyRoot }
  else { Join-Path $REPO 'workspaces' }
$PORT = if ($env:AGENTOS_PORT) { $env:AGENTOS_PORT } else { '4780' }
$WEB_PORT = if ($env:AGENTOS_WEB_PORT) { $env:AGENTOS_WEB_PORT } else { '4781' }
$RUN = Join-Path $AGENTOS_HOME 'run'
$LOGS = Join-Path $AGENTOS_HOME 'logs'
$SERVER_JS = Join-Path $REPO 'plugins\agentos-core\server\src\server.mjs'
$NEXT_BIN = Join-Path $REPO 'web\node_modules\next\dist\bin\next'
$env:AGENTOS_PORT = $PORT
$env:AGENTOS_HOME = $AGENTOS_HOME
$env:AGENTOS_ROOT = $AGENTOS_ROOT

function Say($m) { Write-Host $m }

# Devuelve $true si algo responde HTTP (aunque sea un error 401/404: eso tambien es "arriba").
function Test-Http($url, $timeout) {
  try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeout | Out-Null; return $true }
  catch { return ($null -ne $_.Exception.Response) }
}
function Test-Healthy { return (Test-Http "http://127.0.0.1:$PORT/health" 2) }
function Test-WebUp { return (Test-Http "http://127.0.0.1:$WEB_PORT/" 3) }
function Get-PortPids($port) {
  $c = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue
  if ($c) { return @($c | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }) }
  return @()
}
function Quote($s) { return '"' + $s + '"' }

function Start-Hidden($name, $argList, $workDir) {
  New-Item -ItemType Directory -Force -Path $RUN, $LOGS | Out-Null
  $node = (Get-Command node -ErrorAction Stop).Source
  $p = Start-Process -FilePath $node -ArgumentList $argList -WorkingDirectory $workDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $LOGS "$name.log") -RedirectStandardError (Join-Path $LOGS "$name.err.log")
  Set-Content -Path (Join-Path $RUN "$name.pid") -Value $p.Id
}

function Invoke-Start {
  if (-not (Test-Path (Join-Path $REPO 'web\.next'))) { Say 'Falta compilar la web. Corre install.ps1 primero.'; exit 1 }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Say 'No encuentro Node.js. Abre una terminal nueva o reinstala Node.'; exit 1 }
  if (Test-Healthy) { Say "Servidor ya estaba corriendo (puerto $PORT)." }
  else {
    if ((Get-PortPids $PORT).Count -gt 0) { Say "El puerto $PORT esta ocupado por otro programa. Cierralo o usa: `$env:AGENTOS_PORT='otro-puerto'; bin\agentos.cmd start"; exit 1 }
    Start-Hidden 'server' (Quote $SERVER_JS) $REPO
    for ($i = 0; $i -lt 40; $i++) { if (Test-Healthy) { break }; Start-Sleep -Milliseconds 250 }
    if (-not (Test-Healthy)) { Say "El servidor no arranco. Revisa $LOGS\server.err.log"; exit 1 }
    Say "Servidor iniciado (puerto $PORT)."
  }
  if (Test-WebUp) { Say "Oficina web ya estaba corriendo (puerto $WEB_PORT)." }
  else {
    if ((Get-PortPids $WEB_PORT).Count -gt 0) { Say "El puerto $WEB_PORT esta ocupado por otro programa. Usa: `$env:AGENTOS_WEB_PORT='otro-puerto'; bin\agentos.cmd start"; exit 1 }
    $env:NEXT_TELEMETRY_DISABLED = '1'
    Start-Hidden 'web' ((Quote $NEXT_BIN) + " start -p $WEB_PORT -H 127.0.0.1") (Join-Path $REPO 'web')
    for ($i = 0; $i -lt 80; $i++) { if (Test-WebUp) { break }; Start-Sleep -Milliseconds 250 }
    if (-not (Test-WebUp)) { Say "La web no arranco. Revisa $LOGS\web.err.log"; exit 1 }
    Say "Oficina web iniciada (puerto $WEB_PORT)."
  }
  Say "Abre: http://localhost:$WEB_PORT"
  if ($env:AGENTOS_NO_OPEN -ne '1') { Start-Process "http://localhost:$WEB_PORT" }
}

function Stop-One($label, $pidFile, $port) {
  $ids = @()
  if (Test-Path $pidFile) {
    $t = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($t -match '^\d+$') { $ids += [int]$t }
  }
  $ids += Get-PortPids $port
  $stopped = $false
  foreach ($id in ($ids | Select-Object -Unique)) {
    if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
      & taskkill /PID $id /T /F *> $null
      $stopped = $true
    }
  }
  for ($i = 0; $i -lt 8; $i++) { if ((Get-PortPids $port).Count -eq 0) { break }; Start-Sleep -Milliseconds 250 }
  if ($stopped) { Say "$label detenido." } else { Say "$label no estaba corriendo." }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
function Invoke-Stop {
  Stop-One 'Oficina web' (Join-Path $RUN 'web.pid') $WEB_PORT
  Stop-One 'Servidor' (Join-Path $RUN 'server.pid') $PORT
}

function Invoke-Status {
  if (Test-Healthy) { Say "Servidor:      corriendo (puerto $PORT)" } else { Say 'Servidor:      detenido' }
  if (Test-WebUp) { Say "Oficina web:   corriendo -> http://localhost:$WEB_PORT" } else { Say 'Oficina web:   detenida' }
  $wp = Get-WaPort
  $wh = $null
  try { $wh = (Invoke-WebRequest -Uri "http://127.0.0.1:$wp/health" -UseBasicParsing -TimeoutSec 2).Content } catch { }
  if (-not $wh) { Say 'WhatsApp:      detenido (opcional: bin\agentos.cmd whatsapp)' }
  elseif ($wh -match '"connected"\s*:\s*true') { Say "WhatsApp:      conectado (puerto $wp)" }
  else { Say "WhatsApp:      corriendo, esperando que escanees el QR (puerto $wp)" }
  Say "Repo: $REPO"
}

# ---------- WhatsApp (opcional, no oficial) ----------
$WA_VERSION = '5.6.2'   # @open-wa/wa-automate fijado: el CLI cambia rapido entre versiones
$ENV_FILE = Join-Path $AGENTOS_HOME '.env'

function Get-EnvVal($key) {
  if (-not (Test-Path $ENV_FILE)) { return '' }
  $line = Get-Content $ENV_FILE -ErrorAction SilentlyContinue | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
  if (-not $line) { return '' }
  return (($line -replace "^$key=", '').Trim().Trim('"').Trim("'"))
}
function New-RandHex {
  $b = New-Object byte[] 24
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  $rng.GetBytes($b)
  return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}
function Get-WaPort {
  $u = $env:AGENTOS_WA_URL
  if (-not $u) { $u = Get-EnvVal 'AGENTOS_WA_URL' }
  if ($u -match ':(\d+)(/|$)') { return $Matches[1] }
  return '8002'
}
function Protect-EnvFile {
  # Solo tu usuario puede leer el archivo (equivalente a chmod 600).
  try {
    & icacls $ENV_FILE /inheritance:r /grant:r "$($env:USERNAME):(F)" *> $null
  } catch { }
}
function Initialize-WaEnv {
  New-Item -ItemType Directory -Force -Path $AGENTOS_HOME | Out-Null
  if (-not (Test-Path $ENV_FILE)) { New-Item -ItemType File -Force -Path $ENV_FILE | Out-Null }
  $enc = New-Object System.Text.UTF8Encoding($false)
  $raw = [System.IO.File]::ReadAllText($ENV_FILE)
  $add = ''
  if ($raw.Length -gt 0 -and -not $raw.EndsWith("`n")) { $add += "`r`n" }
  if (-not (Get-EnvVal 'AGENTOS_WA_URL')) { $add += "AGENTOS_WA_URL=http://127.0.0.1:8002`r`n" }
  if (-not (Get-EnvVal 'AGENTOS_WA_API_KEY')) { $add += "AGENTOS_WA_API_KEY=$(New-RandHex)`r`n" }
  if (-not (Get-EnvVal 'AGENTOS_WA_WEBHOOK_SECRET')) { $add += "AGENTOS_WA_WEBHOOK_SECRET=$(New-RandHex)`r`n" }
  if ($add) { [System.IO.File]::AppendAllText($ENV_FILE, $add, $enc) }
  Protect-EnvFile
}

function Invoke-WhatsApp($rest) {
  $waHome = Join-Path $AGENTOS_HOME 'whatsapp'
  $accepted = Join-Path $AGENTOS_HOME 'whatsapp-accepted'
  if (@($rest) -contains '--reset') {
    $a = Read-Host "Esto borra la sesion de WhatsApp guardada en $waHome y tendras que escanear el QR otra vez. Continuar? (si/no)"
    if ($a -match '^(si|SI|Si)$') { Remove-Item -Recurse -Force $waHome -ErrorAction SilentlyContinue; Say 'Sesion borrada.' } else { Say 'Cancelado.' }
    return
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Say 'No encuentro Node.js. Abre una terminal nueva o reinstala Node.'; exit 1 }
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Say 'No encuentro npx (viene con Node.js).'; exit 1 }
  Initialize-WaEnv
  if (-not (Test-Path $accepted)) {
    Say ''
    Say '=====================  AVISO IMPORTANTE: WHATSAPP  ====================='
    Say 'Esto usa una herramienta NO OFICIAL (open-wa) que controla WhatsApp Web.'
    Say 'WhatsApp no la autoriza: tu numero PUEDE SER BLOQUEADO.'
    Say '  - Usa un numero de prueba o un WhatsApp Business secundario, NO tu numero principal.'
    Say '  - Responde solo a personas que te escribieron primero. Nada de envios masivos.'
    Say '  - Los mensajes llegan a AgentOS; el agente solo prepara borradores y TU los envias.'
    Say '  - Todo corre en tu computadora (127.0.0.1); nada se expone a internet.'
    Say '========================================================================'
    $a = Read-Host 'Escribe "acepto" para continuar'
    if ($a.Trim().ToLower() -ne 'acepto') { Say 'No se acepto. No se inicio WhatsApp.'; exit 1 }
    Set-Content -Path $accepted -Value ((Get-Date).ToUniversalTime().ToString('s') + 'Z')
  }
  $key = Get-EnvVal 'AGENTOS_WA_API_KEY'
  $secret = Get-EnvVal 'AGENTOS_WA_WEBHOOK_SECRET'
  $url = Get-EnvVal 'AGENTOS_WA_URL'
  if (-not $url) { $url = 'http://127.0.0.1:8002' }
  $env:AGENTOS_WA_URL = $url
  $wp = Get-WaPort
  if (-not (Test-Healthy)) { Say 'Aviso: el servidor AgentOS no esta corriendo. Abre otra terminal y corre: bin\agentos.cmd start' }
  if ((Get-PortPids $wp).Count -gt 0) { Say "El puerto $wp ya esta en uso (WhatsApp ya esta corriendo?)."; exit 1 }
  New-Item -ItemType Directory -Force -Path $waHome | Out-Null
  Say ''
  Say 'En tu telefono abre WhatsApp > Dispositivos vinculados > Vincular dispositivo'
  Say 'y escanea el codigo QR que aparecera aqui abajo (puede tardar un minuto).'
  Say 'Deja esta ventana abierta. Para detener WhatsApp: Ctrl+C.'
  Say ''
  $env:AGENTOS_WA_API_KEY = $key
  $env:AGENTOS_WA_WEBHOOK_SECRET = $secret
  $bridgeJs = Join-Path $REPO 'scripts\whatsapp-bridge.mjs'
  $node = (Get-Command node).Source
  $bridge = Start-Process -FilePath $node -ArgumentList (Quote $bridgeJs) -WindowStyle Hidden -PassThru
  $env:WA_API_KEY = $key
  $env:WA_SESSION_DATA_PATH = $waHome
  Push-Location $waHome
  try {
    & npx -y "@open-wa/wa-automate@$WA_VERSION" --session-id agentos --host 127.0.0.1 --port $wp --no-dashboard
  }
  finally {
    Pop-Location
    if ($bridge -and -not $bridge.HasExited) { & taskkill /PID $bridge.Id /T /F *> $null }
    # Cierra el navegador/servidor de open-wa si quedo huerfano en el puerto.
    foreach ($id in (Get-PortPids $wp)) { & taskkill /PID $id /T /F *> $null }
  }
}

function Invoke-Update {
  Set-Location $REPO
  Say 'Actualizando AgentOS...'
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Say 'No se pudo hacer git pull. Revisa tu conexion o avisa a tu instructor.'; exit 1 }
  $wasWeb = Test-WebUp
  Invoke-Stop
  Push-Location (Join-Path $REPO 'web')
  & npm ci --no-audit --no-fund
  $ok = ($LASTEXITCODE -eq 0)
  if ($ok) {
    $env:NEXT_PUBLIC_AGENTOS_PORT = $PORT
    & node (Join-Path 'node_modules' 'next\dist\bin\next') build
    $ok = ($LASTEXITCODE -eq 0)
  }
  Pop-Location
  if (-not $ok) { Say 'Fallo la compilacion.'; exit 1 }
  if ((Get-Command claude -ErrorAction SilentlyContinue) -and $env:AGENTOS_SKIP_CLAUDE -ne '1') {
    & claude plugin marketplace update agentos
    # Instala los equipos que falten (p. ej. Direccion con CFO y COO) y actualiza los que ya estan.
    $installed = (& claude plugin list 2>$null) -join "`n"
    foreach ($p in @('agentos-core', 'marketing-team', 'sales-team', 'collections-team', 'executive-team', 'dev-team')) {
      if ($installed -match [regex]::Escape("$p@agentos")) { & claude plugin update "$p@agentos" } else { & claude plugin install "$p@agentos" }
    }
  }
  Say 'Listo. Reinicia tus sesiones de Claude para cargar los cambios.'
  if ($wasWeb) { Invoke-Start }
}

switch ($Command) {
  'start'  { Invoke-Start }
  'stop'   { Invoke-Stop }
  'status' { Invoke-Status }
  'update' { Invoke-Update }
  'whatsapp' { Invoke-WhatsApp $Rest }
  default  { Say 'Uso: bin\agentos.cmd {start|stop|status|update|whatsapp [--reset]}'; exit 2 }
}
