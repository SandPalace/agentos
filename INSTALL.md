# Instalar AgentOS en tu computadora

Esta guía es para macOS (Linux es igual). Para Windows, ve a la sección **Windows** (instalador nativo, no necesitas WSL).

## Qué necesitas

- Una suscripción de Claude (Pro, Max o Team).
- **Claude Code** instalado (y, si quieres, Claude Desktop).
- **Node.js 24 LTS** (mínimo 22.13). Descárgalo de https://nodejs.org. Revisa con `node -v`.
- **Git**. En Mac, escribe `git --version` en la Terminal; si no está, macOS te ofrece instalarlo.
- Acceso al repositorio privado de GitHub (te llega una invitación a tu correo).

## Paso a paso

1. **Acepta la invitación** de GitHub que llegó a tu correo.
2. **Clona el repositorio** (abre la app Terminal):
   ```
   cd ~
   git clone https://github.com/kikirrins/agentos.git AgentOS-app
   cd AgentOS-app
   ```
   GitHub te pedirá iniciar sesión. Si pide contraseña, usa un *Personal Access Token*
   (GitHub > Settings > Developer settings > Tokens) o instala la app `gh` y corre `gh auth login`.
3. **Instala** (tarda unos minutos, necesita internet):
   ```
   ./install.sh
   ```
   Te pedirá elegir un **usuario y contraseña** para entrar a tu oficina. Al escribir la contraseña no verás nada: es normal.
4. **Arranca**:
   ```
   agentos start
   ```
   Se abre el navegador en http://localhost:4781. Si el comando `agentos` no existe, abre una Terminal nueva
   o agrega la línea `export PATH="$HOME/.local/bin:$PATH"` a `~/.zshrc`.
5. **Entra** con el usuario y contraseña del paso 3.
6. Abre Claude Code o Claude Desktop (reinícialo si ya estaba abierto) y habla con tu equipo; verás a los agentes en la oficina.

Otros comandos: `agentos status`, `agentos stop`.

**WhatsApp (opcional):** `agentos whatsapp` conecta un número de prueba para que los mensajes lleguen a Leads (el agente prepara, tú envías). Es una herramienta no oficial con riesgo de bloqueo; lee antes `plugins/sales-team/docs/WHATSAPP.md`. Funciona igual en Windows.

## Actualizar

```
agentos update
```
Descarga la versión nueva, recompila y actualiza los plugins. Después reinicia Claude.

## Problemas comunes

- **"El puerto está ocupado"**: otro programa usa el 4780 o el 4781. Corre `agentos stop`; si sigue, usa otros puertos:
  `AGENTOS_PORT=4790 AGENTOS_WEB_PORT=4791 agentos start` (instala con las mismas variables si cambias el 4780).
- **"Node muy viejo"**: instala Node 24 LTS desde https://nodejs.org, abre una Terminal nueva y corre `./install.sh` otra vez.
- **Olvidé mi contraseña**: abre `~/.agentos/.env` con cualquier editor (`open -e ~/.agentos/.env`), cambia `AGENTOS_PASSWORD=...`
  y guarda. No hace falta reiniciar. O corre `./install.sh --reset-login`.
- **No encuentra `claude`**: instala Claude Code (`curl -fsSL https://claude.ai/install.sh | bash`) y corre `./install.sh` de nuevo.
- **La web se ve rota después de actualizar**: `agentos stop` y luego `agentos start`.
- **Logs**: `~/.agentos/logs/`.

## Windows

Instalador nativo para Windows 10/11 (PowerShell 5.1, el que ya trae Windows, o PowerShell 7). No necesitas WSL ni permisos de administrador.

### Requisitos

- **Node.js 24 LTS** (mínimo 22.13): instalador de https://nodejs.org (o `winget install OpenJS.NodeJS.LTS`). Revisa con `node -v`.
- **Git for Windows**: https://git-scm.com/download/win (o `winget install Git.Git`).
- **Claude Code** (y, si quieres, Claude Desktop): `winget install Anthropic.ClaudeCode` o `irm https://claude.ai/install.ps1 | iex`.
- Acceso al repositorio privado de GitHub (invitación por correo). Después de instalar cualquier cosa, **abre una terminal nueva**.

### Paso a paso

1. Abre **PowerShell** (menú Inicio > escribe "PowerShell").
2. Clona el repositorio:
   ```
   cd $HOME
   git clone https://github.com/kikirrins/agentos.git AgentOS-app
   cd AgentOS-app
   ```
   GitHub abrirá una ventana para iniciar sesión (Git Credential Manager).
3. Instala (tarda unos minutos). Windows bloquea scripts por defecto; por eso se corre así:
   ```
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```
   Te pedirá un **usuario y contraseña** para tu oficina (al escribir la contraseña no verás nada: es normal) y
   te preguntará si Claude puede usar las herramientas de AgentOS sin pedir aprobación.
4. Abre una **terminal nueva** y arranca:
   ```
   agentos start
   ```
   Se abre el navegador en http://localhost:4781. Otros comandos: `agentos status`, `agentos stop`, `agentos update`.
5. Reinicia Claude Desktop si ya estaba abierto.

Opciones del instalador: `-ResetLogin`, `-NoClaude`, `-NoClaudeCli`, `-NoDesktop`, `-NoSettings`
(ej. `powershell -ExecutionPolicy Bypass -File .\install.ps1 -ResetLogin`).

### Problemas en Windows

- **"agentos no se reconoce como comando"**: el PATH no se actualiza en terminales ya abiertas. Cierra y abre una terminal nueva
  (o usa `%USERPROFILE%\.agentos\bin\agentos.cmd start`).
- **"la ejecución de scripts está deshabilitada"**: corre el instalador con `powershell -ExecutionPolicy Bypass -File .\install.ps1`.
- **Ventana del Firewall / antivirus preguntando por "node"**: elige **Permitir** (solo redes privadas). AgentOS solo escucha en 127.0.0.1.
  Si tu antivirus bloquea `npm ci`, agrega una excepción para la carpeta del repo y vuelve a correr el instalador.
- **Puerto ocupado**: `agentos stop`; si sigue, `$env:AGENTOS_PORT=4790; $env:AGENTOS_WEB_PORT=4791; agentos start`.
- **Olvidé mi contraseña**: edita `%USERPROFILE%\.agentos\.env` (`notepad $HOME\.agentos\.env`) o corre el instalador con `-ResetLogin`.
- **Logs**: `%USERPROFILE%\.agentos\logs\` (`server.err.log`, `web.err.log`).

## Soporte

hello@algolab.academy
