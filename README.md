# AgentOS

Una oficina virtual donde trabajan tus equipos de agentes de IA. Contratas un equipo (marketing, ventas, cobranza,
dirección, finanzas, desarrollo), los agentes trabajan dentro de Claude (Desktop, Cowork o Code) y tú los ves moverse en una
oficina en 3D, revisas lo que entregan y apruebas las tareas.

- **Un plugin de Claude, `agentos`**: todos los agentes y skills (`plugins/agentos/`). Los equipos se arman dentro de la
  app, en la pestaña **Equipos**.
- **Servidor local**: guarda tareas y entregables en tu computadora, dentro de la carpeta de AgentOS (`data/` y `workspaces/`). Tus datos no salen de tu máquina.
- **Oficina web**: `http://localhost:4781`, con usuario y contraseña propios.

Los agentes nunca publican, envían ni pagan solos: todo lo externo queda como borrador para que tú lo ejecutes.

## Instalación

Lee **[INSTALL.md](INSTALL.md)** (paso a paso, en español).

## Actualizar a la versión nueva

Abre Claude (Code en la terminal o una sesión de Code en Claude Desktop) **en la carpeta de AgentOS** y pídele:

> Actualiza AgentOS a la versión nueva siguiendo la sección «Update» de CLAUDE.md.

O hazlo a mano (Mac/Linux; en Windows usa `.\bin\agentos.cmd`):

```bash
./bin/agentos stop
git pull --ff-only
./bin/agentos update     # dependencias, compilación y el plugin agentos (migra solo desde los 7 plugins viejos)
./bin/agentos start
```

Después cierra y abre Claude Desktop. Puedes repetir `./bin/agentos update` las veces que quieras: no rompe nada.

## Si algo falla

Abre Claude en la carpeta de AgentOS y dile:

> Revisa y repara mi AgentOS.

Claude sigue el manual de `CLAUDE.md` de esta carpeta: revisa el servidor, la web, el plugin, los permisos y Claude
Desktop, te dice qué encontró y lo arregla (te pregunta antes de borrar o cambiar algo). Si es una falla de AgentOS,
prepara un reporte para GitHub y tú lo envías.

## Qué hay de nuevo

- **Un solo plugin.** Antes eran 7 plugins (uno por equipo); ahora es uno, `agentos`, con todos los agentes. Los equipos
  son parte de la app: los armas en **Equipos**. `./bin/agentos update` quita los 7 viejos, instala el nuevo y corrige
  los permisos y Claude Desktop por ti.
- **Canvas e Inicio.** En la pestaña **Canvas** tus agentes publican lo que necesitan que revises (reportes, tableros,
  propuestas, creativos): comentas, apruebas o pides cambios, y suben la versión nueva. Cada proyecto tiene su
  **Inicio**: pídele a cualquier agente «arma el inicio de este proyecto». Traen ideas y plantillas para no empezar de cero.
- **Finanzas:** contralor, analista financiero, cumplimiento fiscal y finanzas personales, con un libro de ingresos
  (ventas, abonos, IVA y datos para facturar), estados financieros, paquete para tu contador y calendario del SAT.
- **WhatsApp con OpenWA (opcional):** pídele al equipo de ventas «conecta mi WhatsApp con OpenWA». Corre en tu
  computadora; los agentes leen tus chats y solo envían cuando tú apruebas cada mensaje.
- **Vista oficina opcional:** la app abre en la vista normal; la oficina 3D se prende con el botón «Vista oficina».
- **Repo genérico:** el repositorio público trae solo el producto (sin material de clase) y ahora vive en
  `SandPalace/agentos`; tu clon viejo sigue funcionando (GitHub redirige).

## Dudas y fallas

Abre un issue en este repositorio (o pídeselo a Assistant: «algo no funciona en AgentOS»).

## Créditos

Créditos y licencias de terceros: [`CREDITS.md`](CREDITS.md).
