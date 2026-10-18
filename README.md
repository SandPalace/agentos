# AgentOS

Una oficina virtual donde trabajan tus equipos de agentes de IA. Contratas un equipo (marketing, ventas, cobranza,
dirección, desarrollo), los agentes trabajan dentro de Claude (Desktop, Cowork o Code) y tú los ves moverse en una
oficina en 3D, revisas lo que entregan y apruebas las tareas.

- **Plugins de Claude**: agentes, skills y comandos listos para usar (`plugins/`).
- **Servidor local**: guarda tareas y entregables en tu computadora, dentro de la carpeta de AgentOS (`data/` y `workspaces/`). Tus datos no salen de tu máquina.
- **Oficina web**: `http://localhost:4781`, con usuario y contraseña propios.

Los agentes nunca publican, envían ni pagan solos: todo lo externo queda como borrador para que tú lo ejecutes.

## Instalación

Lee **[INSTALL.md](INSTALL.md)** (paso a paso, en español).

## Actualizar a la versión nueva

Abre Claude (Code en la terminal o una sesión de Code en Claude Desktop) **en la carpeta de AgentOS** y pídele:

> Actualiza AgentOS a la versión nueva: haz `git pull` y luego sigue la sección «Actualizar AgentOS» de CLAUDE.md.

Claude baja la versión, instala lo que falte (incluido el equipo de Dirección con CEO, CFO y COO), pasa tus datos a esta
carpeta si estaban en `~/.agentos` y `~/AgentOS`, quita lo que la versión vieja había instalado a nivel sistema y te pide
confirmar antes de borrar cualquier cosa.

Si prefieres hacerlo a mano (Mac/Linux; en Windows usa `.\bin\agentos.cmd`):

```bash
./bin/agentos stop
git pull --ff-only
./bin/agentos update                                # dependencias, compilación y plugins
node scripts/migrate-to-project-folder.mjs          # solo si existen ~/.agentos o ~/AgentOS: muestra el plan
node scripts/migrate-to-project-folder.mjs --yes    # lo hace (deja respaldo *.migrado-<fecha>)
./bin/agentos start
```

Después cierra y abre Claude Desktop. Qué cambió en esta versión:

- **Todo vive en esta carpeta:** `data/` (base de datos, archivos, contraseña, logs) y `workspaces/` (una carpeta por
  workspace). Ninguna se sube a GitHub. Ya no hay comando global: usa `./bin/agentos`.
- **Equipo de Dirección** con CEO, CFO y el nuevo COO (operación diaria).
- **Sesiones de Claude** divididas en Code y Cowork, con título y carpeta. Las de Code se abren desde la oficina; las de
  Cowork no se pueden abrir por enlace (limitación de Claude Desktop), así que AgentOS trae Claude al frente y te dice cuál abrir.
- Se quitó «Simular actividad»: creaba agentes que no se podían borrar. Los que dejó se limpian solos.
- **Reportar fallas e ideas:** dile a Assistant «algo no funciona en AgentOS» o «tengo una idea». Prepara el reporte y te
  da un enlace de GitHub ya llenado; tú lo revisas y pulsas «Submit new issue».

## Contacto

AlgoLab · hello@algolab.academy

## Material de clase

Las presentaciones de cada sesión están en `clases/`. Ábrelas en tu navegador (doble clic en `index.html`) y avanza con las flechas ← →.

| Sesión | Archivo |
|---|---|
| 3 · Captación y atención de clientes (equipo de ventas) | `clases/sesion-03-ventas/index.html` |

Créditos y licencias de terceros: [`CREDITS.md`](CREDITS.md).
