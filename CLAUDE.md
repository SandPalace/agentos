# AgentOS (copia instalada)

Esta carpeta es una instalación de AgentOS: plugins de Claude, servidor local (puerto 4780) y oficina web (4781).
Habla con la persona en español de México. Estas reglas aplican cuando te piden instalar, actualizar o reparar AgentOS;
para el trabajo diario de los agentes (ventas, marketing, etc.) sigue las instrucciones de cada agente.

## Dónde vive todo (dentro de esta carpeta)

| Qué | Carpeta | Variable |
|---|---|---|
| Base de datos, archivos, `.env`, logs, navegador, WhatsApp | `data/` | `AGENTOS_HOME` |
| Carpetas de trabajo: `workspaces/default` y `workspaces/<id>` | `workspaces/` | `AGENTOS_ROOT` |

`data/` y `workspaces/` están en `.gitignore`: nunca se suben ni se borran al actualizar. Los hooks y el MCP corren desde
la copia del plugin en `~/.claude/plugins/cache`, así que encuentran esta carpeta por las variables `AGENTOS_HOME` y
`AGENTOS_ROOT` que el instalador pone en `~/.claude/settings.json` (`env`) y en el MCP `agentos` de Claude Desktop. Esa configuración de Claude es lo único que AgentOS toca fuera de esta carpeta
(no hay comando global ni PATH: el launcher es `./bin/agentos`, Windows `.\bin\agentos.cmd`).

## Actualizar AgentOS («actualiza AgentOS», «pasa a la versión nueva»)

Sigue estos pasos en orden, desde esta carpeta (la que tiene `.agentos-export`). En Windows usa `.\bin\agentos.cmd` donde
dice `./bin/agentos`. Cuenta a la persona en una línea qué haces en cada paso.

1. **Cambios locales.** `git status --porcelain`. Si hay archivos modificados que vienen del repo (no `data/` ni
   `workspaces/`, que están ignorados), no los descartes: muéstralos y pregunta si los guardas con `git stash`.
2. **Detén y baja la versión nueva.** `./bin/agentos stop` (en versiones viejas también existía el comando `agentos stop`),
   luego `git pull --ff-only`. Haz el pull tú, antes de `update`: el launcher viejo se reemplaza mientras corre.
3. **Instala dependencias, compila y actualiza los plugins.** `./bin/agentos update`. Instala los equipos que falten
   (Dirección con CEO, CFO y COO; Cobranza; Desarrollo) y actualiza los demás. Confirma con `claude plugin list` que hay
   6 plugins `@agentos`; si falta alguno: `claude plugin install <plugin>@agentos`.
4. **Estructura vieja.** Las versiones anteriores guardaban todo fuera de esta carpeta, en `~/.agentos` y `~/AgentOS`
   (Windows: `%USERPROFILE%\.agentos` y `%USERPROFILE%\AgentOS`). Si existe alguna:
   - corre `node scripts/migrate-to-project-folder.mjs` (solo muestra el plan) y enséñaselo a la persona;
   - con su visto bueno: `./bin/agentos stop`, luego `node scripts/migrate-to-project-folder.mjs --yes`.
   El script copia a `data/` y `workspaces/` (`~/AgentOS/workspaces/<id>` → `workspaces/<id>`; el resto de `~/AgentOS` →
   `workspaces/default`), corrige las rutas guardadas en la base, pone `AGENTOS_HOME`/`AGENTOS_ROOT` en Claude y deja las
   carpetas viejas renombradas como respaldo (`*.migrado-<fecha>`). Si dice que ya existen las dos estructuras, no copies
   nada: explica cuál tiene datos (fechas de `agentos.db`) y pregunta cuál conservar.
   Si no hay estructura vieja pero `~/.claude/settings.json` no tiene `AGENTOS_HOME` en `env`, vuelve a correr
   `./install.sh` (Windows `.\install.ps1`): respeta lo que ya existe y solo completa lo que falta.
5. **Restos de la instalación vieja a nivel sistema** (pregunta antes de borrar cada uno):
   - Mac/Linux: un enlace `~/.local/bin/agentos` o `/usr/local/bin/agentos`. Bórralo solo si es un enlace simbólico que
     apunta a `bin/agentos` de esta carpeta (`ls -l`). Si `~/.zshrc` o `~/.bashrc` tiene una línea `export PATH=...` que
     agregó AgentOS para ese enlace, dile a la persona cuál es y que la quite si ya no usa otra cosa ahí.
   - Windows: el atajo viejo vivía en `%USERPROFILE%\.agentos\bin` (queda dentro del respaldo tras migrar). Si esa ruta
     sigue en el PATH del usuario, explica cómo quitarla (Configuración → Variables de entorno).
   Desde ahora el comando es siempre `./bin/agentos` dentro de esta carpeta: no hay comando global.
6. **Arranca y verifica.** `./bin/agentos start`. Pide a la persona que cierre Claude Desktop por completo y lo vuelva a
   abrir, que entre a http://localhost:4781 y confirme:
   - ve sus proyectos, tareas, leads y archivos;
   - en **Equipos** aparece «Dirección» con CEO, CFO y COO;
   - en cada agente, «Conversación» dice si es **Code** o **Cowork**, con título y carpeta. Si alguna cambió a
     `cowork:…`, que pulse «Guardar cambios». «Probar» abre las sesiones de Code; las de Cowork no se pueden abrir por
     enlace (Claude Desktop no lo permite): se trae Claude al frente y se abre la tarea en la barra lateral de Cowork.
   - ya no existe el botón «Simular actividad»; los agentes de ejemplo que dejaba se borraron solos.
7. **Respaldos.** Solo cuando la persona confirme que todo está bien, sugiérele borrar los `*.migrado-<fecha>`. Nunca los
   borres tú.

Si algo falla dos veces igual, detente: muestra el error tal cual y pregunta. Los logs están en `data/logs/`.
Si el fallo es de AgentOS (no de la computadora de la persona), prepara un reporte con la herramienta MCP
`agentos_issue_report` y dale a la persona el enlace de GitHub para que ella lo envíe.

## Nunca

- Borrar `data/`, `workspaces/` ni los respaldos `*.migrado-*` sin que la persona lo pida.
- Mostrar el contenido de `data/.env` (tiene la contraseña de la oficina).
- Hacer `git clean -x`, `git reset --hard` o similares en esta carpeta.
