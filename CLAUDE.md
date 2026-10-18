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

## Al actualizar (`./bin/agentos update` o «actualiza AgentOS»): revisa la estructura vieja

Las versiones anteriores guardaban todo fuera de esta carpeta, en `~/.agentos` y `~/AgentOS`
(Windows: `%USERPROFILE%\.agentos` y `%USERPROFILE%\AgentOS`). Después de actualizar:

1. Revisa si existe alguna de esas carpetas. Si no existe ninguna, no hay nada que hacer.
2. Si existe, corre `node scripts/migrate-to-project-folder.mjs` (solo muestra el plan) y enséñaselo a la persona.
3. Con su visto bueno: `./bin/agentos stop`, luego `node scripts/migrate-to-project-folder.mjs --yes`, luego `./bin/agentos start`.
   El script copia a `data/` y `workspaces/` (`~/AgentOS/workspaces/<id>` pasa a `workspaces/<id>`; el resto de `~/AgentOS`, a `workspaces/default`), corrige las rutas guardadas en la base, pone las variables en Claude y deja las
   carpetas viejas renombradas como respaldo (`*.migrado-<fecha>`).
4. Pide a la persona que reinicie Claude Desktop, abra la oficina (http://localhost:4781) y confirme que ve sus proyectos,
   tareas y archivos. Solo entonces sugiérele borrar los respaldos; nunca los borres tú.

Si el script dice que ya existen las dos estructuras, no copies nada: explica cuál tiene datos (fechas de `agentos.db`)
y pregunta cuál conservar.

## Nunca

- Borrar `data/`, `workspaces/` ni los respaldos `*.migrado-*` sin que la persona lo pida.
- Mostrar el contenido de `data/.env` (tiene la contraseña de la oficina).
- Hacer `git clean -x`, `git reset --hard` o similares en esta carpeta.
