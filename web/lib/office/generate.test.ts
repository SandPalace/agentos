import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateOffice, placementBox, isWallMounted, MIN_SEATS, type OfficeLayout, type Rect } from './generate.ts'
import * as GEN from './generate.ts'
import { CATALOG } from './catalog.ts'
import { createOfficeNavGrid, type OfficeNavGrid } from '../../components/office/officeNavGrid.ts'

const ids = new Set(CATALOG.map((a) => a.id))
const COUNTS = [4, 8, 12, 20]
const coo = (n: number) => generateOffice(n, undefined, { coo: true })
const byTeams = (teams: number[]) => generateOffice(1 + teams.reduce((a, b) => a + b, 0), undefined, { coo: true, teams })

const wallRect = (w: OfficeLayout['walls'][number]): Rect & { y0: number } => ({ minX: w.x - w.w / 2, maxX: w.x + w.w / 2, minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2, y0: w.y0 ?? 0 })
const overlap = (a: Rect, b: Rect, eps = 0.02) => a.minX < b.maxX - eps && a.maxX > b.minX + eps && a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps
const inside = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1

test('crece con el equipo: 4 asientos por isla (el COO cuenta dentro del total)', () => {
  assert.equal(generateOffice(1).modules, 1) // mínimo de 4
  assert.equal(generateOffice(4).modules, 1)
  assert.equal(generateOffice(5).modules, 2)
  assert.equal(generateOffice(12).modules, 3)
  assert.equal(generateOffice(13).modules, 4)
  assert.ok(generateOffice(13).rows === 2 && generateOffice(13).cols === 2) // 4 islas = cuadrado de 2 x 2
  assert.ok(generateOffice(20).rows === 2 && generateOffice(20).cols === 3)
  assert.equal(coo(5).modules, 1) // COO + 4
  assert.equal(coo(6).modules, 2)
})

test('siempre hay un asiento por persona, y descanso, juntas y recepción (sin billar ni rincón de lectura)', () => {
  for (const n of [1, 3, 4, 7, 12, 20]) {
    for (const withCoo of [false, true]) {
      const l = generateOffice(n, undefined, { coo: withCoo })
      const desks = l.seats.filter((s) => s.zone === 'cowork')
      assert.ok(desks.length >= Math.max(n, MIN_SEATS) - (withCoo ? 1 : 0), `n=${n}`)
      assert.ok(l.chill.length >= 3, 'al menos tres sitios de descanso')
      assert.ok(!l.placements.some((p) => p.id === 'pool-table'), 'sin billar por ahora')
      assert.equal(l.seats.filter((s) => s.zone === 'meeting').length, 6)
      for (const id of ['reception-desk', 'coffee-bar', 'meet-table', 'sofa']) assert.ok(l.placements.some((p) => p.id === id), id)
    }
  }
})

test('todo lo que se coloca existe en el catálogo y cae dentro de la oficina', () => {
  for (const n of [4, 9, 16, 24]) {
    const l = coo(n)
    for (const p of l.placements) {
      assert.ok(ids.has(p.id), `asset ${p.id}`)
      assert.ok(p.x >= 0 && p.x <= l.width, `${p.id} x=${p.x}`)
      assert.ok(p.z >= 0 && p.z <= l.depth, `${p.id} z=${p.z} (depth ${l.depth})`)
    }
    for (const s of l.seats) {
      assert.ok(s.position[0] > 0 && s.position[0] < l.width)
      assert.ok(s.position[2] > 0 && s.position[2] < l.depth)
    }
  }
})

test('ningún asiento se encima con otro', () => {
  for (const n of [4, 12, 24]) {
    const l = coo(n)
    for (let i = 0; i < l.seats.length; i++)
      for (let j = i + 1; j < l.seats.length; j++) {
        const d = Math.hypot(l.seats[i].position[0] - l.seats[j].position[0], l.seats[i].position[2] - l.seats[j].position[2])
        assert.ok(d > 0.8, `asientos ${i} y ${j} a ${d.toFixed(2)}`)
      }
  }
})

test('sin muebles encimados ni muebles dentro de un muro', () => {
  for (const n of [4, 5, 8, 12, 13, 20, 24, 40]) {
    for (const withCoo of [true, false]) {
      const l = generateOffice(n, undefined, { coo: withCoo })
      const items = l.placements.filter((p) => !isWallMounted(p)).map((p) => ({ id: p.id, r: placementBox(p) }))
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          // una silla puede meterse bajo su escritorio: se tolera el choque silla/mesa (se comprueba aparte que no haya choque silla/silla)
          const chairish = (id: string) => id.endsWith('chair')
          const tableish = (id: string) => id === 'bench' || id === 'meet-table' || id === 'low-table' || id === 'reception-desk'
          if ((chairish(items[i].id) && tableish(items[j].id)) || (chairish(items[j].id) && tableish(items[i].id))) continue
          assert.ok(!overlap(items[i].r, items[j].r), `n=${n} coo=${withCoo}: ${items[i].id} ${JSON.stringify(items[i].r)} choca con ${items[j].id} ${JSON.stringify(items[j].r)}`)
        }
        for (const w of l.walls) {
          if (w.kind === 'knee' && items[i].id === 'plant-tall') continue
          if ((w.y0 ?? 0) > 0.3) continue
          assert.ok(!overlap(items[i].r, wallRect(w)), `n=${n}: ${items[i].id} dentro de un muro en (${w.x.toFixed(1)}, ${w.z.toFixed(1)})`)
        }
        assert.ok(items[i].r.minX >= 0 && items[i].r.maxX <= l.width && items[i].r.minZ >= 0 && items[i].r.maxZ <= l.depth, `${items[i].id} fuera del piso`)
      }
    }
  }
})

test('cada asiento queda dentro de la oficina, sin muros encima', () => {
  for (const n of COUNTS) {
    const l = coo(n)
    for (const s of l.seats) {
      const [x, , z] = s.position
      assert.ok(x > 0.3 && x < l.width - 0.3 && z > 0.3 && z < l.depth - 0.3, `asiento ${s.zone} fuera`)
      for (const w of l.walls) assert.ok(!overlap({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 }, wallRect(w)), `asiento ${s.zone} en (${x.toFixed(1)}, ${z.toFixed(1)}) dentro de un muro`)
    }
  }
})

test('la COO es la recepcionista: su asiento es el primero, en la silla del mostrador de recepción', () => {
  for (const n of COUNTS) {
    const l = coo(n)
    assert.equal(l.seats[0].zone, 'reception')
    assert.equal(l.seats.filter((s) => s.zone === 'reception').length, 1)
    const [sx, , sz] = l.seats[0].position
    const chair = l.placements.find((p) => p.id === 'reception-chair')!
    assert.ok(Math.abs(sx - chair.x) < 1e-9 && Math.abs(sz - chair.z) < 1e-9, 'sentada en la silla de recepción')
    assert.ok(inside(sx, sz, { x0: l.zones.reception.x, x1: l.zones.reception.x + l.zones.reception.w, z0: l.zones.reception.z, z1: l.zones.reception.z + l.zones.reception.d }))
    assert.ok(l.seats.filter((s) => s.zone === 'cowork').length >= n - 1)
  }
  assert.ok(generateOffice(8).seats.every((s) => s.zone !== 'reception'))
  assert.ok(!('coo' in coo(8)), 'ya no hay oficina del COO')
})

/** Muro de cristal vertical (a lo largo de z) en `x`, partido por su puerta: devuelve los tramos. */
const verticalGlass = (l: OfficeLayout, x: number) => l.walls.filter((w) => w.kind === 'glass' && Math.abs(w.x - x) < 0.01 && w.d > w.w).sort((a, b) => a.z - b.z)

test('la sala de juntas es de cristal y su puerta (>= 1.8) da al área de trabajo, no al lobby', () => {
  for (const n of COUNTS) {
    const l = coo(n)
    const work = l.zones.cowork
    const workX0 = work.x
    const workX1 = work.x + work.w
    for (const [name, room, side] of [['meeting', l.meeting, 'west']] as const) {
      const d = room.door
      assert.ok(d.z1 - d.z0 >= 1.8 - 1e-9, `${name}: puerta de ${d.z1 - d.z0}`)
      // la puerta está en el muro que mira al área de trabajo
      assert.ok(Math.abs(d.x - (side === 'east' ? room.x1 : room.x0)) < 1e-9, `${name}: puerta en el muro ${side}`)
      assert.ok(d.z0 >= room.z0 && d.z1 <= room.z1)
      // y el muro está partido en dos tramos de cristal con el hueco justo de la puerta
      const pieces = verticalGlass(l, d.x)
      assert.equal(pieces.length, 2, `${name}: dos tramos de cristal`)
      assert.ok(Math.abs(pieces[0].z + pieces[0].d / 2 - d.z0) < 1e-9 && Math.abs(pieces[1].z - pieces[1].d / 2 - d.z1) < 1e-9)
      // la franja frente a la puerta es el área de trabajo: entre el cuarto y las islas (o el tablero) y a la altura de la zona de coworking
      const fx0 = side === 'east' ? d.x : workX0 - 0.01
      const fx1 = side === 'east' ? workX0 + 0.01 : d.x
      assert.ok(fx1 - fx0 >= 2.4, `${name}: pasillo de ${(fx1 - fx0).toFixed(2)} frente a la puerta`)
      assert.ok(d.z0 >= work.z && d.z1 <= work.z + work.d + 3, `${name}: la puerta cae a la altura del área de trabajo`)
      assert.ok(side === 'east' ? d.x <= workX0 : d.x >= workX1, `${name}: el cuarto queda fuera del bloque de escritorios`)
    }
    // los cuartos son de cristal por dentro; los muros exteriores, sólidos
    assert.equal(l.walls.filter((w) => w.kind === 'glass').length, 5, 'cristal: sala de juntas (2 tramos) y oficina del CEO (2 tramos + muro sur)')
    assert.equal(l.walls.find((w) => w.z < 0 && w.w > 3)!.kind, 'solid')
    // la sala de juntas no se entra por el lobby: el lobby (zona reception) está al sur de la sala de juntas
    assert.ok(l.zones.reception.z >= l.meeting.z1 - 1e-9)
    assert.ok(l.meeting.x0 >= workX1 + 2.4)
  }
})

test('oficina del CEO: cuarto de cristal 8.4 x RD al noroeste con puerta (>= 1.8) hacia el área de trabajo, mueble, letrero y ventana', () => {
  for (const n of COUNTS) {
    for (const l of [coo(n), byTeams([4, 5, 2])]) {
      const c = l.ceo
      assert.ok(c.x0 === 0 && c.z0 === 0 && Math.abs(c.x1 - 8.4) < 1e-9 && c.z1 === 8, 'esquina noroeste de 8.4 x 8')
      assert.ok(c.door.z1 - c.door.z0 >= 1.8 - 1e-9 && Math.abs(c.door.x - c.x1) < 1e-9 && c.door.z0 >= c.z0 && c.door.z1 <= c.z1)
      const pieces = verticalGlass(l, c.door.x)
      assert.equal(pieces.length, 2)
      assert.ok(Math.abs(pieces[0].z + pieces[0].d / 2 - c.door.z0) < 1e-9 && Math.abs(pieces[1].z - pieces[1].d / 2 - c.door.z1) < 1e-9)
      assert.ok(l.zones.cowork.x - c.door.x >= 2.4, 'pasillo libre frente a la puerta')
      assert.ok(l.walls.some((w) => w.kind === 'glass' && w.w > w.d && Math.abs(w.z - c.z1) < 0.01), 'muro sur de cristal')
      const inRoom = (x: number, z: number) => inside(x, z, c)
      const desk = l.placements.find((p) => p.id === 'desk')!
      assert.ok(inRoom(desk.x, desk.z))
      for (const id of ['bookshelf', 'plant-tall', 'painting']) assert.ok(l.placements.some((p) => p.id === id && inRoom(p.x, p.z)), id)
      assert.ok(l.windows.some((w) => w.z < 0 && w.x > c.x0 && w.x < c.x1), 'ventana en el muro norte')
      assert.ok(l.signs.some((s) => s.text === 'OFICINA DEL CEO' && Math.abs(s.x - c.x1) < 0.3 && Math.abs(s.facing - Math.PI / 2) < 1e-9 && s.z < c.door.z0))
      // la silla del CEO mira al escritorio; las de visita también (del otro lado)
      assert.ok(inRoom(c.seat.position[0], c.seat.position[2]) && c.seat.position[2] < desk.z)
      assert.equal(c.visitors.length, 2)
      for (const v of c.visitors) assert.ok(inRoom(v.position[0], v.position[2]) && v.position[2] > desk.z)
      // zona de «sentarse» con la silla del CEO
      const sit = l.interactions.find((i) => i.id === 'sit:ceo')!
      assert.ok(sit.kind === 'sit' && sit.label === 'Sentarte en tu escritorio' && sit.radius < 1.3 && sit.seat?.rotation === c.seat.rotation)
      // puerta despejada y todo alcanzable desde la entrada, silla del CEO y de visitas incluidas
      const strip: Rect = { minX: c.door.x - 1.4, maxX: c.door.x + 1.4, minZ: c.door.z0, maxZ: c.door.z1 }
      for (const p of l.placements) if (!isWallMounted(p) && ['bench', 'chair', 'sofa', 'plant-tall', 'desk'].includes(p.id)) assert.ok(!overlap(strip, placementBox(p)), 'puerta despejada')
      const r = reach(buildGrid(l), l, l.spawn[0], l.spawn[2])
      for (const s of [c.seat, ...c.visitors]) assert.ok(has(r, s.position[0], s.position[2]), `silla en (${s.position[0].toFixed(1)}, ${s.position[2].toFixed(1)}) inalcanzable`)
      for (let z = c.door.z0; z <= c.door.z1; z += 0.25) if (has(r, c.door.x, z)) { z = Infinity; break }
    }
  }
})

test('la sala de juntas se ve desde el área de trabajo: ningún mueble tapa el cristal ni la puerta', () => {
  const l = coo(8)
  const blocks = l.placements.filter((p) => !isWallMounted(p) && ['bench', 'chair', 'sofa', 'plant-tall'].includes(p.id)).map(placementBox)
  for (const room of [l.meeting]) {
    const strip: Rect = { minX: room.door.x - 1.4, maxX: room.door.x + 1.4, minZ: room.door.z0, maxZ: room.door.z1 }
    for (const b of blocks) assert.ok(!overlap(strip, b), 'puerta despejada')
  }
})

test('el tablero va sobre el área de trabajo y su zona neón está libre', () => {
  for (const n of COUNTS) {
    const l = coo(n)
    const x0 = l.zones.cowork.x
    const x1 = x0 + l.zones.cowork.w
    assert.ok(Math.abs(l.board.x - (x0 + x1) / 2) < 1e-9)
    const z = l.boardZone
    assert.ok(z.x0 > 0 && z.x1 < l.meeting.x0, 'la zona del tablero queda antes de la sala de juntas')
    const r = { minX: z.x0, maxX: z.x1, minZ: z.z0, maxZ: z.z1 }
    for (const p of l.placements) if (!isWallMounted(p)) assert.ok(!overlap(r, placementBox(p)), `${p.id} sobre la zona del tablero`)
  }
})

test('la entrada: abertura de 3+ en el muro bajo del frente, la persona aparece justo adentro', () => {
  for (const n of [4, 12]) {
    const l = coo(n)
    const south = l.walls.filter((w) => w.kind === 'knee' && w.z > l.depth)
    assert.equal(south.length, 2)
    const gap0 = south[0].x + south[0].w / 2
    const gap1 = south[1].x - south[1].w / 2
    assert.ok(gap1 - gap0 >= 3, `abertura de ${(gap1 - gap0).toFixed(2)}`)
    assert.ok(l.spawn[0] > gap0 && l.spawn[0] < gap1, 'frente a la abertura')
    assert.ok(l.spawn[2] < l.depth && l.depth - l.spawn[2] < 2.5, 'pegada al borde sur, adentro')
    assert.ok(l.spawn[0] > l.zones.reception.x, 'la entrada queda del lado de la recepción')
  }
})

test('la recepción queda pegada al muro sur de la sala de juntas y el nombre de la empresa va en ese muro', () => {
  const l = generateOffice(8, 'ACME', { coo: true })
  const desk = l.placements.find((p) => p.id === 'reception-desk')!
  assert.ok(desk.z > l.meeting.z1 && desk.z - l.meeting.z1 < 3.5)
  const sign = l.signs.find((s) => s.text === 'ACME')!
  assert.ok(sign && Math.abs(sign.facing) < 1e-9, 'mira hacia +z (visible desde la isométrica)')
  const wall = l.walls.find((w) => w.kind === 'solid' && Math.abs(w.z - l.meeting.z1) < 0.01 && Math.abs(w.x - sign.x) < w.w / 2)
  assert.ok(wall, 'hay muro sólido detrás del nombre')
  assert.ok(!l.signs.some((s) => s.text === 'OFICINA DEL COO'))
})

test('el archivero, la barra de café y las plantas van pegados a la pared; los sofás, con aire', () => {
  const l = coo(4)
  const gapToWall = (p: { x: number; z: number }) => Math.min(p.x, p.z, l.width - p.x, l.depth - p.z)
  for (const p of l.placements.filter((q) => ['coffee-bar'].includes(q.id))) {
    const g = gapToWall(p)
    assert.ok(g >= 0.3 && g <= 1.2, `${p.id} a ${g.toFixed(2)} de la pared más cercana`)
  }
  for (const s of l.seats.filter((q) => q.zone === 'meeting')) assert.ok(s.position[2] >= 0.7 && s.position[2] <= l.meeting.z1 - 1.2, 'sillas de juntas con aire a los muros')
})

// ── Alcanzabilidad: BFS sobre la malla de navegación real, con las mismas cajas que usa la app ──
function buildGrid(l: OfficeLayout): OfficeNavGrid {
  const obstacles: Rect[] = []
  for (const p of l.placements) if (!isWallMounted(p)) obstacles.push(placementBox(p))
  for (const w of l.walls) obstacles.push(wallRect(w))
  const anchors: [number, number, number][] = [
    ...l.seats.map((s) => [s.position[0], s.position[2], 1.0] as [number, number, number]),
    ...l.chill.map((s) => [s.position[0], s.position[2], 1.7] as [number, number, number]),
    ...[l.ceo.seat, ...l.ceo.visitors].map((s) => [s.position[0], s.position[2], 1.0] as [number, number, number]),
  ]
  return createOfficeNavGrid(obstacles, anchors, { minX: 0, minZ: 0, maxX: l.width, maxZ: l.depth }, 0.2)
}

/** Celdas alcanzables (BFS de 8 vecinos sin cortar esquinas) desde un punto. Devuelve el conjunto de claves "col,row". */
function reach(grid: OfficeNavGrid, l: OfficeLayout, x: number, z: number): Set<string> {
  const step = 0.5
  const cols = Math.ceil(l.width / step)
  const rows = Math.ceil(l.depth / step)
  const ok = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && grid.isWalkable((c + 0.5) * step, (r + 0.5) * step)
  const start: [number, number] = [Math.floor(x / step), Math.floor(z / step)]
  assert.ok(ok(start[0], start[1]), `el punto de partida (${x.toFixed(1)}, ${z.toFixed(1)}) es transitable`)
  const seen = new Set<string>([`${start[0]},${start[1]}`])
  const queue = [start]
  while (queue.length) {
    const [c, r] = queue.pop()!
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc
      const nr = r + dr
      if (!ok(nc, nr) || seen.has(`${nc},${nr}`)) continue
      if (dc !== 0 && dr !== 0 && (!ok(c + dc, r) || !ok(c, r + dr))) continue
      seen.add(`${nc},${nr}`)
      queue.push([nc, nr])
    }
  }
  return seen
}
const has = (set: Set<string>, x: number, z: number) => set.has(`${Math.floor(x / 0.5)},${Math.floor(z / 0.5)}`)

test('desde la entrada se llega a todos los asientos (menos el de la recepcionista), al tablero, a la sala de juntas y al lounge', () => {
  for (const n of [4, 5, 8, 12, 13, 20, 24]) {
    const l = coo(n)
    const grid = buildGrid(l)
    const r = reach(grid, l, l.spawn[0], l.spawn[2])
    for (const s of l.seats.filter((q) => q.zone !== 'reception')) assert.ok(has(r, s.position[0], s.position[2]), `n=${n}: asiento ${s.zone} en (${s.position[0].toFixed(1)}, ${s.position[2].toFixed(1)}) inalcanzable`)
    for (const c of l.chill) assert.ok(has(r, c.position[0], c.position[2]), `n=${n}: sitio de descanso ${c.id} inalcanzable`)
    // zona del tablero: su centro
    const bz = l.boardZone
    assert.ok(has(r, (bz.x0 + bz.x1) / 2, (bz.z0 + bz.z1) / 2), `n=${n}: zona del tablero inalcanzable`)
    // las puertas: un paso dentro de cada cuarto y el pasillo de afuera
    for (const [name, room, side] of [['meeting', l.meeting, 1]] as const) {
      // la malla de navegación es conservadora (infla cada caja): la puerta debe seguir dejando una celda transitable en el umbral y otra adentro
      const crossing = (dx: number) => {
        for (let z = room.door.z0; z <= room.door.z1; z += 0.25) if (has(r, room.door.x + dx, z)) return true
        return false
      }
      assert.ok(crossing(0), `n=${n}: ${name}: umbral de la puerta`)
      assert.ok(crossing(side * 1.0), `n=${n}: ${name}: un paso adentro`)
      assert.ok(crossing(-side * 1.0), `n=${n}: ${name}: un paso afuera, en el área de trabajo`)
      // y bastante interior del cuarto
      let cells = 0
      for (const k of r) {
        const [c, rr] = k.split(',').map(Number)
        if (inside((c + 0.5) * 0.5, (rr + 0.5) * 0.5, room)) cells++
      }
      assert.ok(cells >= 20, `n=${n}: ${name}: sólo ${cells} celdas transitables adentro`)
    }
    // barra de café: se puede llegar a su lado
    const coffee = l.placements.find((p) => p.id === 'coffee-bar')!
    assert.ok(has(r, coffee.x + 1.4, coffee.z), 'junto a la barra de café')
  }
})

test('con coo:false todo sigue alcanzable', () => {
  const l = generateOffice(8)
  const r = reach(buildGrid(l), l, l.spawn[0], l.spawn[2])
  for (const s of l.seats.filter((q) => q.zone !== 'reception')) assert.ok(has(r, s.position[0], s.position[2]))
})

test('pasillos anchos entre islas (>= 2.7) y se puede ir de cualquier asiento a cualquier otro', () => {
  const { ISLE_GAP } = GEN
  for (const n of [8, 12, 13, 20, 24]) {
    const l = coo(n)
    const cx0 = l.zones.cowork.x
    const benches = l.placements.filter((p) => p.id === 'bench' && p.x > cx0 - 0.1)
    // isla = pareja de escritorios con la misma x y z a 1.24; su huella incluye las sillas (±2.88 en z)
    const islands: Rect[] = []
    for (const b of benches.filter((q) => Math.abs(q.facing) < 1e-9)) islands.push({ minX: b.x - 2.4, maxX: b.x + 2.4, minZ: b.z - 0.62 - 2.88, maxZ: b.z - 0.62 + 2.88 })
    assert.ok(islands.length >= 2)
    for (let i = 0; i < islands.length; i++)
      for (let j = i + 1; j < islands.length; j++) {
        const gx = Math.max(islands[j].minX - islands[i].maxX, islands[i].minX - islands[j].maxX)
        const gz = Math.max(islands[j].minZ - islands[i].maxZ, islands[i].minZ - islands[j].maxZ)
        assert.ok(Math.max(gx, gz) >= ISLE_GAP - 1e-6, `n=${n}: pasillo de ${Math.max(gx, gz).toFixed(2)} entre islas`)
      }
    const grid = buildGrid(l)
    const seats = l.seats.filter((s) => !s.standing && s.zone !== 'reception')
    for (const a of seats) {
      const r = reach(grid, l, a.position[0], a.position[2])
      for (const b of seats) assert.ok(has(r, b.position[0], b.position[2]), `n=${n}: no hay camino entre dos asientos`)
    }
  }
})

test('zonas de interacción: tablero siempre, Assistant solo con COO, y ambas alcanzables desde la entrada', () => {
  for (const n of [4, 8, 13, 20]) {
    const l = coo(n)
    assert.ok(l.interactions.some((i) => i.id === 'board' && i.kind === 'board'))
    const a = l.interactions.find((i) => i.id === 'assistant')
    assert.ok(a && a.kind === 'talk' && a.target === 'coo')
    const r = reach(buildGrid(l), l, l.spawn[0], l.spawn[2])
    for (const i of l.interactions) {
      let found = false
      for (let dx = -i.radius; dx <= i.radius && !found; dx += 0.5)
        for (let dz = -i.radius; dz <= i.radius && !found; dz += 0.5)
          if (Math.hypot(dx, dz) <= i.radius && has(r, i.x + dx, i.z + dz)) found = true
      assert.ok(found, `n=${n}: ${i.id} sin celda alcanzable dentro de su radio`)
    }
  }
  assert.ok(!generateOffice(8).interactions.some((i) => i.id === 'assistant'))
  assert.ok(generateOffice(8).interactions.some((i) => i.id === 'board'))
})

test('el lounge siempre va en la columna oeste, bajo la oficina del CEO, junto al café', () => {
  for (const l of [coo(5), coo(13), coo(24)]) {
    assert.ok(Math.abs(l.zones.chill.w - l.ceo.x1) < 1e-9, 'la columna oeste mide lo que la oficina del CEO')
    const z = l.zones.lounge
    assert.ok(z && z.x >= 0 && z.z >= l.ceo.z1 && z.x + z.w <= l.ceo.x1 && z.z + z.d <= l.depth)
    const sofa = l.placements.find((p) => p.id === 'sofa' && p.x < l.ceo.x1)!
    assert.ok(sofa && sofa.z > l.ceo.z1, 'sofá bajo el cuarto del CEO')
    const west = l.chill.filter((c) => c.position[0] < l.ceo.x1 && c.position[2] > l.ceo.z1)
    assert.ok(west.length >= 4, 'sofá y sillones en la columna oeste')
    assert.ok(!l.placements.some((p) => p.id === 'sofa' && p.x > l.ceo.x1 && p.x < l.meeting.x0), 'sin lounge en el centro-sur')
  }
})

// ── Una isla por equipo (opts.teams) ──
const teamSeats = (l: OfficeLayout, t: number) => l.seats.filter((s) => s.zone === 'cowork' && s.team === t)

test('equipos: 1 isla por equipo, de 4 asientos por pareja de escritorios pegada a lo largo de x', () => {
  const uno = byTeams([4])
  assert.equal(uno.islands.length, 1)
  assert.equal(teamSeats(uno, 0).length, 4)
  const seis = byTeams([6])
  assert.equal(seis.islands.length, 1)
  assert.equal(teamSeats(seis, 0).length, 8)
  const xs = seis.placements.filter((p) => p.id === 'bench' && p.facing === 0).map((p) => p.x).sort((a, b) => a - b)
  assert.equal(xs.length, 2)
  assert.ok(Math.abs(xs[1] - xs[0] - 4.8) < 1e-9, 'escritorios contiguos, sin pasillo dentro de la isla')
  assert.ok(Math.abs(seis.islands[0].x1 - seis.islands[0].x0 - 9.6) < 1e-9)
  // equipo vacío: igual tiene su isla de 4 sillas; el orden de asientos es COO primero
  const vacio = byTeams([0, 3])
  assert.equal(vacio.islands.length, 2)
  assert.equal(teamSeats(vacio, 0).length, 4)
  assert.equal(vacio.seats[0].zone, 'reception')
})

test('equipos [4,5,2]: islas de 4/8/4 asientos separadas >= ISLE_GAP y todo alcanzable', () => {
  for (const teams of [[4, 5, 2], [4], [6], [3, 3, 3, 3, 3], [13, 1, 1, 9], [0]]) {
    const l = byTeams(teams)
    assert.equal(l.islands.length, teams.length)
    teams.forEach((m, t) => assert.equal(teamSeats(l, t).length, 4 * Math.max(1, Math.ceil(m / 4)), `equipo ${t}`))
    for (let i = 0; i < l.islands.length; i++)
      for (let j = i + 1; j < l.islands.length; j++) {
        const a = l.islands[i]
        const b = l.islands[j]
        const gx = Math.max(b.x0 - a.x1, a.x0 - b.x1)
        const gz = Math.max(b.z0 - a.z1, a.z0 - b.z1)
        assert.ok(Math.max(gx, gz) >= GEN.ISLE_GAP - 1e-6, `${JSON.stringify(teams)}: islas ${i} y ${j} a ${Math.max(gx, gz).toFixed(2)}`)
      }
    // sin encimes ni muebles en muros ni asientos fuera
    const items = l.placements.filter((p) => !isWallMounted(p)).map((p) => ({ id: p.id, r: placementBox(p) }))
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const chairish = (id: string) => id.endsWith('chair')
        const tableish = (id: string) => id === 'bench' || id === 'meet-table' || id === 'low-table' || id === 'reception-desk'
        if ((chairish(items[i].id) && tableish(items[j].id)) || (chairish(items[j].id) && tableish(items[i].id))) continue
        assert.ok(!overlap(items[i].r, items[j].r), `${JSON.stringify(teams)}: ${items[i].id} choca con ${items[j].id}`)
      }
      for (const w of l.walls) if ((w.y0 ?? 0) <= 0.3 && !(w.kind === 'knee' && items[i].id === 'plant-tall')) assert.ok(!overlap(items[i].r, wallRect(w)), `${items[i].id} dentro de un muro`)
      assert.ok(items[i].r.minX >= 0 && items[i].r.maxX <= l.width && items[i].r.minZ >= 0 && items[i].r.maxZ <= l.depth, `${items[i].id} fuera del piso`)
    }
    const r = reach(buildGrid(l), l, l.spawn[0], l.spawn[2])
    for (const s of l.seats.filter((q) => q.zone !== 'reception')) assert.ok(has(r, s.position[0], s.position[2]), `${JSON.stringify(teams)}: asiento ${s.zone} inalcanzable`)
    for (const c of l.chill) assert.ok(has(r, c.position[0], c.position[2]), `${JSON.stringify(teams)}: ${c.id} inalcanzable`)
    for (const i of l.interactions) {
      let found = false
      for (let dx = -i.radius; dx <= i.radius && !found; dx += 0.5)
        for (let dz = -i.radius; dz <= i.radius && !found; dz += 0.5) if (Math.hypot(dx, dz) <= i.radius && has(r, i.x + dx, i.z + dz)) found = true
      assert.ok(found, `${JSON.stringify(teams)}: ${i.id} inalcanzable`)
    }
    const bz = l.boardZone
    assert.ok(has(r, (bz.x0 + bz.x1) / 2, (bz.z0 + bz.z1) / 2), 'zona del tablero')
    const cw = l.seats.filter((s) => s.zone === 'cowork')
    for (const a of cw) {
      const ra = reach(buildGrid(l), l, a.position[0], a.position[2])
      for (const b of cw) assert.ok(has(ra, b.position[0], b.position[2]), 'camino entre asientos')
      break
    }
  }
})

test('sin opts.teams el layout no trae islas ni equipos', () => {
  const l = coo(8)
  assert.equal(l.islands.length, 0)
  assert.ok(l.seats.every((s) => s.team === undefined))
})
