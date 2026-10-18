# Instalar AgentOS en tu computadora

Esta guía es para macOS (Linux es igual). Para Windows, ve a la sección **Windows** (instalador nativo, no necesitas WSL).

## Qué necesitas

- Una suscripción de Claude (Pro, Max o Team).
- **Claude Code** instalado (y, si quieres, Claude Desktop).
- **Node.js 24 LTS** (mínimo 22.13). Descárgalo de https://nodejs.org. Revisa con `node -v`.
- **Git**. En Mac, escribe `git --version` en la Terminal; si no está, macOS te ofrece instalarlo.
- Una cuenta de GitHub solo si quieres enviar reportes de fallas o ideas (el repositorio es público).

## Paso a paso

1. **Acepta la invitación** de GitHub que llegó a tu correo.
2. **Clona el repositorio** (abre la app Terminal). Te recomendamos la carpeta Documentos (o tu carpeta personal):
   ```
   cd ~/Documents && git clone https://github.com/kikirrins/agentos.git AgentOS && cd AgentOS
   ```
   Todo lo que AgentOS crea (datos, proyectos, logs, usuario y contraseña) se queda **dentro de esa carpeta**
   (`data/` para los datos y `workspaces/` para tus workspaces); no se instala nada en tu sistema (ni comandos globales, ni cambios al PATH). Esas dos carpetas nunca se suben a Git. Lo único fuera de la carpeta: la configuración de Claude, para que encuentre tus agentes.
   GitHub te pedirá iniciar sesión. Si pide contraseña, usa un *Personal Access Token*
   (GitHub > Settings > Developer settings > Tokens) o instala la app `gh` y corre `gh auth login`.
3. **Instala** (tarda unos minutos, necesita internet):
   ```
   ./install.sh
   ```
   El instalador también te pregunta si Claude puede usar las herramientas de AgentOS sin pedir aprobación; si aceptas,
   además le avisa a Claude dónde está tu carpeta de AgentOS (en `~/.claude/settings.json`, con respaldo).
   Si ya tenías AgentOS instalado antes (carpetas `~/.agentos` y `~/AgentOS`), no se mueve nada: con el servidor detenido corre
   `node scripts/migrate-to-project-folder.mjs` (muestra el plan) y luego con `--yes`, o pídele a Claude «migra AgentOS a la carpeta del proyecto».
   Te pedirá elegir un **usuario y contraseña** para entrar a tu oficina. Al escribir la contraseña no verás nada: es normal.
4. **Arranca** (desde la carpeta de AgentOS):
   ```
   ./bin/agentos start
   ```
   Se abre el navegador en http://localhost:4781.
5. **Entra** con el usuario y contraseña del paso 3.
6. Abre Claude Code o Claude Desktop (reinícialo si ya estaba abierto) y habla con tu equipo; verás a los agentes en la oficina.

Otros comandos: `./bin/agentos status`, `./bin/agentos stop`.

**WhatsApp (opcional):** `./bin/agentos whatsapp` conecta un número de prueba para que los mensajes lleguen a Leads (el agente prepara, tú envías). Es una herramienta no oficial con riesgo de bloqueo; lee antes `plugins/sales-team/docs/WHATSAPP.md`. Funciona igual en Windows.

## Actualizar

Desde la carpeta de AgentOS:

```
./bin/agentos update
```
Descarga la versión nueva, recompila y actualiza los plugins. Después reinicia Claude.

## Problemas comunes

- **"El puerto está ocupado"**: otro programa usa el 4780 o el 4781. Corre `./bin/agentos stop`; si sigue, usa otros puertos:
  `AGENTOS_PORT=4790 AGENTOS_WEB_PORT=4791 ./bin/agentos start` (instala con las mismas variables si cambias el 4780).
- **"Node muy viejo"**: instala Node 24 LTS desde https://nodejs.org, abre una Terminal nueva y corre `./install.sh` otra vez.
- **Olvidé mi contraseña**: abre `data/.env` dentro de la carpeta de AgentOS con cualquier editor (`open -e data/.env`), cambia `AGENTOS_PASSWORD=...`
  y guarda. No hace falta reiniciar. O corre `./install.sh --reset-login`.
- **No encuentra `claude`**: instala Claude Code (`curl -fsSL https://claude.ai/install.sh | bash`) y corre `./install.sh` de nuevo.
- **La web se ve rota después de actualizar**: `./bin/agentos stop` y luego `./bin/agentos start`.
- **Logs**: `data/logs/` (dentro de la carpeta de AgentOS).

## Windows

Instalador nativo para Windows 10/11 (PowerShell 5.1, el que ya trae Windows, o PowerShell 7). No necesitas WSL ni permisos de administrador.

### Requisitos

- **Node.js 24 LTS** (mínimo 22.13): instalador de https://nodejs.org (o `winget install OpenJS.NodeJS.LTS`). Revisa con `node -v`.
- **Git for Windows**: https://git-scm.com/download/win (o `winget install Git.Git`).
- **Claude Code** (y, si quieres, Claude Desktop): `winget install Anthropic.ClaudeCode` o `irm https://claude.ai/install.ps1 | iex`.
- Después de instalar cualquier cosa, **abre una terminal nueva**.

### Paso a paso

1. Abre **PowerShell** (menú Inicio > escribe "PowerShell").
2. Clona el repositorio:
   ```
   cd $HOME\Documents
   git clone https://github.com/kikirrins/agentos.git AgentOS
   cd AgentOS
   ```
   Igual que en Mac, todo (datos, proyectos, logs) se queda dentro de esa carpeta, en `data\` y `workspaces\`, y no se instala nada en tu sistema. Lo único fuera de la carpeta: la configuración de Claude, para que encuentre tus agentes.
   GitHub abrirá una ventana para iniciar sesión (Git Credential Manager).
3. Instala (tarda unos minutos). Windows bloquea scripts por defecto; por eso se corre así:
   ```
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```
   Te pedirá un **usuario y contraseña** para tu oficina (al escribir la contraseña no verás nada: es normal) y
   te preguntará si Claude puede usar las herramientas de AgentOS sin pedir aprobación.
4. Arranca desde la carpeta de AgentOS:
   ```
   .\bin\agentos.cmd start
   ```
   Se abre el navegador en http://localhost:4781. Otros comandos: `.\bin\agentos.cmd status`, `stop`, `update`.
5. Reinicia Claude Desktop si ya estaba abierto.

Opciones del instalador: `-ResetLogin`, `-NoClaude`, `-NoClaudeCli`, `-NoDesktop`, `-NoSettings`
(ej. `powershell -ExecutionPolicy Bypass -File .\install.ps1 -ResetLogin`).

### Problemas en Windows

- **"agentos.cmd no se reconoce"**: estás fuera de la carpeta. Haz `cd $HOME\Documents\AgentOS` y corre `.\bin\agentos.cmd start`.
- **"la ejecución de scripts está deshabilitada"**: corre el instalador con `powershell -ExecutionPolicy Bypass -File .\install.ps1`.
- **Ventana del Firewall / antivirus preguntando por "node"**: elige **Permitir** (solo redes privadas). AgentOS solo escucha en 127.0.0.1.
  Si tu antivirus bloquea `npm ci`, agrega una excepción para la carpeta del repo y vuelve a correr el instalador.
- **Puerto ocupado**: `.\bin\agentos.cmd stop`; si sigue, `$env:AGENTOS_PORT=4790; $env:AGENTOS_WEB_PORT=4791; .\bin\agentos.cmd start`.
- **Olvidé mi contraseña**: edita `data\.env` dentro de la carpeta de AgentOS (`notepad data\.env`) o corre el instalador con `-ResetLogin`.
- **Logs**: `data\logs\` dentro de la carpeta de AgentOS (`server.err.log`, `web.err.log`).

## Soporte

hello@algolab.academy
