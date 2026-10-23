# Checklist de prueba en Windows (para quien prueba)

Máquina limpia de preferencia (Windows 10/11, usuario normal, sin admin). Probar con **PowerShell 5.1** (el de Windows) y repetir lo básico con PowerShell 7.
Anota en cada punto OK / falla + el mensaje exacto.

## Antes
- [ ] `node -v` >= 22.13 (ideal 24), `git --version`, `claude --version` existen.
- [ ] Clonar: `cd $HOME\Documents; git clone https://github.com/SandPalace/agentos.git AgentOS; cd AgentOS`

## Instalador (`powershell -ExecutionPolicy Bypass -File .\install.ps1`)
- [ ] Los acentos y mensajes en español se ven bien (sin caracteres raros): confirma que el BOM funciona en 5.1.
- [ ] Sin Node (renombra temporalmente o PATH vacío): muestra el aviso con winget y se detiene.
- [ ] Con Node viejo (<22.13): mensaje claro.
- [ ] Sin `claude`: muestra opciones winget/irm/npm y se detiene; con `-NoClaudeCli` sigue.
- [ ] Paso 3: `npm ci` y `next build` terminan sin error en `web\`.
- [ ] Paso 4: `claude plugin marketplace list` muestra `agentos`; `claude plugin list` muestra **un solo plugin**, `agentos@agentos` (enabled), y ningún `*-team@agentos` ni `agentos-core@agentos`.
- [ ] Paso 5: `%APPDATA%\Claude\claude_desktop_config.json` tiene `mcpServers.agentos` con ruta absoluta a `node.exe` y existe `.agentos-backup`. Tus otros `mcpServers` siguen ahí. La ruta termina en `plugins\\agentos\\server\\src\\mcp.mjs`. Reiniciar Claude Desktop: aparece la herramienta AgentOS.
- [ ] Paso 5b: pregunta en español; `n` no toca `%USERPROFILE%\.claude\settings.json`; `S` agrega `mcp__plugin_agentos_agentos` y `env` con `AGENTOS_HOME`/`AGENTOS_ROOT` (+ `.agentos-backup`); `n` imprime el JSON `env` para agregarlo a mano. El `mcpServers.agentos` de Claude Desktop también lleva ese `env`. Con `$env:AGENTOS_ALLOW_MCP='no'|'yes'` no pregunta. Con `-NoSettings` lo omite.
- [ ] Paso 6: pide usuario, contraseña oculta dos veces; rechaza < 8 caracteres o distintas. Crea `data\.env` dentro de la carpeta clonada; `icacls` muestra solo tu usuario. Segunda corrida: "Ya existe"; con `-ResetLogin` lo vuelve a pedir.
- [ ] Contraseña con caracteres raros (`$ " ' ` ^ & %`) funciona al entrar a la web.
- [ ] Paso 7: existe `workspaces\` dentro de la carpeta clonada (y no se crea `%USERPROFILE%\AgentOS\` ni `%USERPROFILE%\.agentos\`).
- [ ] No se agrega nada al PATH de usuario ni se crea `data\bin\`; el instalador termina diciendo `.\bin\agentos.cmd start`.
- [ ] Correr el instalador una 2a vez no rompe nada (idempotente).

## Launcher `.\bin\agentos.cmd` (desde la carpeta de AgentOS)
- [ ] `.\bin\agentos.cmd` sin argumentos: imprime el uso.
- [ ] `.\bin\agentos.cmd start`: arranca server (4780) y web (4781) sin ventanas visibles, abre el navegador, muestra pantalla de login.
- [ ] Iniciar sesión con el usuario creado. Se ve la oficina; crear una tarea desde la web.
- [ ] Windows Firewall pregunta por `node`: Permitir; todo sigue funcionando.
- [ ] Existen `data\run\*.pid` y logs en `logs\` (sin errores).
- [ ] `.\bin\agentos.cmd status`: ambos "corriendo". `start` otra vez: "ya estaba corriendo".
- [ ] `.\bin\agentos.cmd stop`: ambos detenidos; `Get-NetTCPConnection -LocalPort 4780,4781` sin resultados; no quedan `node.exe` de AgentOS.
- [ ] Ocupa el puerto 4781 con otro programa: `.\bin\agentos.cmd start` avisa y no mata nada ajeno.
- [ ] Con `$env:AGENTOS_PORT=4790; $env:AGENTOS_WEB_PORT=4791` funciona en otros puertos.
- [ ] `.\bin\agentos.cmd update` (con web corriendo): imprime los pasos 1/4–4/4 (pull, stop, npm ci + build, plugin agentos) y vuelve a arrancar; una 2a corrida dice «nada que cambiar» y «Plugin agentos@agentos actualizado».
- [ ] Migración desde la versión de 7 plugins (clon viejo con los 7 instalados y la regla `mcp__plugin_agentos-core_agentos`): tras `update` solo queda `agentos@agentos`, `settings.json` tiene `mcp__plugin_agentos_agentos` (sin la vieja) y Claude Desktop apunta a `plugins\agentos\...`.
- [ ] Revisión: `curl.exe -s http://localhost:4780/api/auth/status` devuelve `{"enabled":true,"configured":true,...}`; `node scripts\build-roster.mjs` dice `7 teams, 26 agents, 80 skills`. Con carpeta del repo con espacios o acentos en la ruta también.

## Integración con Claude
- [ ] En Claude Code (`claude`) dentro de `workspaces\default` (carpeta clonada): el agente aparece en la oficina (hooks http), y la herramienta MCP `agentos` funciona (crear tarea / entregar archivo).
- [ ] Hook SessionStart: con el servidor detenido, abrir una sesión de Claude Code lo arranca solo (`ensure.mjs`) y no abre ventana de consola.
- [ ] En la web: botón de abrir carpeta de un entregable abre el Explorador.
- [ ] Subir/descargar archivos en la web; el workspace correcto se detecta con `cwd` en otra letra de mayúsculas (`c:\users\...`).

## Reportar
Versión de Windows, PowerShell (`$PSVersionTable.PSVersion`), Node, y el texto exacto de cualquier error.
