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

## Actualizar desde una versión anterior

Las versiones anteriores guardaban tus datos fuera de esta carpeta (`~/.agentos` y `~/AgentOS`). Ahora todo vive aquí:
`data/` (base de datos, archivos, contraseña, logs) y `workspaces/` (una carpeta por workspace: `workspaces/default`, `workspaces/<id>`). Ninguna se sube a GitHub.

Después de `./bin/agentos update`, si todavía tienes las carpetas viejas:

```bash
node scripts/migrate-to-project-folder.mjs          # muestra el plan, no cambia nada
./bin/agentos stop
node scripts/migrate-to-project-folder.mjs --yes    # copia, corrige rutas y avisa a Claude
./bin/agentos start
```

O pídeselo a Claude: «migra AgentOS a la carpeta del proyecto». Las carpetas viejas quedan como respaldo
(`*.migrado-<fecha>`); bórralas cuando confirmes que todo está en la oficina.

## Contacto

AlgoLab · hello@algolab.academy

## Material de clase

Las presentaciones de cada sesión están en `clases/`. Ábrelas en tu navegador (doble clic en `index.html`) y avanza con las flechas ← →.

| Sesión | Archivo |
|---|---|
| 3 · Captación y atención de clientes (equipo de ventas) | `clases/sesion-03-ventas/index.html` |

Créditos y licencias de terceros: [`CREDITS.md`](CREDITS.md).
