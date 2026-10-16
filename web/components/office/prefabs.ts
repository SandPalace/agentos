// @ts-nocheck — three.js tipos complejos
// Extrae las piezas del catálogo de Office.glb y las deja como prefabs reutilizables: pivote en el centro de la
// base y frente hacia +Z.
import * as THREE from 'three'
import { CATALOG } from '@/lib/office/catalog'

const san = (n: string) => n.replace(/[[\].:/]/g, '').replace(/\s/g, '_')
const Y = new THREE.Vector3(0, 1, 0)

const lam = (color: string, emissive?: string) => new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.9 : 0 })

/** Mesa de billar al estilo de las demás piezas: sólo cubos. Largo en X, frente hacia +Z, base en y=0. */
export function buildPoolTable(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'pool-table'
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, emissive?: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color, emissive))
    m.position.set(x, y, z)
    m.castShadow = m.receiveShadow = true
    g.add(m)
    return m
  }
  const L = 3.6, D = 2.0, top = 1.1
  // patas y faldón
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(0.32, 0.7, 0.32, sx * (L / 2 - 0.3), 0.35, sz * (D / 2 - 0.3), '#5A3720')
  add(L, 0.4, D, 0, top - 0.3, 0, '#7A4A2A')
  // riel de madera y bandas verdes
  add(L, 0.16, 0.28, 0, top + 0.08, D / 2 - 0.14, '#8B5A33')
  add(L, 0.16, 0.28, 0, top + 0.08, -D / 2 + 0.14, '#8B5A33')
  add(0.28, 0.16, D - 0.56, L / 2 - 0.14, top + 0.08, 0, '#8B5A33')
  add(0.28, 0.16, D - 0.56, -L / 2 + 0.14, top + 0.08, 0, '#8B5A33')
  const fx = L - 0.56, fz = D - 0.56
  add(fx, 0.05, fz, 0, top + 0.025, 0, '#2FA66A') // paño
  add(fx - 0.1, 0.1, 0.09, 0, top + 0.06, fz / 2 - 0.045, '#1F7F4F')
  add(fx - 0.1, 0.1, 0.09, 0, top + 0.06, -fz / 2 + 0.045, '#1F7F4F')
  add(0.09, 0.1, fz - 0.1, fx / 2 - 0.045, top + 0.06, 0, '#1F7F4F')
  add(0.09, 0.1, fz - 0.1, -fx / 2 + 0.045, top + 0.06, 0, '#1F7F4F')
  // troneras
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
    if (sx === 0 || true) add(0.26, 0.04, 0.26, sx * (fx / 2 - (sx === 0 ? 0 : 0.02)), top + 0.065, sz * (fz / 2 - 0.02), '#15171C')
  }
  // bolas (cubos) en triángulo y la blanca
  const colors = ['#F2C94C', '#2D6BFF', '#E5484D', '#8B5CF6', '#FF7A2F', '#14B8A6', '#7A2E2E', '#F2C94C', '#2D6BFF']
  let k = 0
  for (let col = 0; col < 4; col++) for (let row = 0; row <= col; row++) {
    const c = col === 2 && row === 1 ? '#14161A' : colors[k++ % colors.length]
    add(0.14, 0.14, 0.14, 0.7 + col * 0.16, top + 0.12, (row - col / 2) * 0.16, c)
  }
  add(0.14, 0.14, 0.14, -0.9, top + 0.12, 0.05, '#FFFFFF')
  // taco sobre el riel y gis
  const cue = add(1.9, 0.06, 0.06, -0.3, top + 0.2, D / 2 - 0.14, '#E8C07A')
  cue.rotation.y = 0.05
  add(0.07, 0.07, 0.07, 0.5, top + 0.18, D / 2 - 0.14, '#3A86FF')
  return g
}

export function buildPrefabs(root: THREE.Object3D): Map<string, THREE.Group> {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((o: any) => {
    if (!o.isMesh) return
    meshes.push(o)
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m) continue
      for (const k of ['map', 'emissiveMap', 'aoMap']) if (m[k]) m[k].colorSpace = THREE.SRGBColorSpace
      m.needsUpdate = true
    }
  })
  const out = new Map<string, THREE.Group>()
  const tmp = new THREE.Vector3()

  for (const def of CATALOG) {
    if (def.procedural === 'pool-table') {
      const pg = buildPoolTable()
      pg.userData.size = new THREE.Box3().setFromObject(pg).getSize(new THREE.Vector3()).toArray()
      out.set(def.id, pg)
      continue
    }
    const anchors = def.nodes.map((n) => root.getObjectByName(san(n))).filter(Boolean) as THREE.Object3D[]
    if (!anchors.length) {
      console.warn('[catalog] no encontré el nodo de', def.id, def.nodes)
      continue
    }
    const box = new THREE.Box3()
    for (const a of anchors) box.union(new THREE.Box3().setFromObject(a))

    const members = new Set<THREE.Object3D>()
    for (const a of anchors) a.traverse((o: any) => o.isMesh && members.add(o))

    if (def.onTop) {
      for (const m of meshes) {
        if (members.has(m) || def.skip?.includes(m.name)) continue
        const b = new THREE.Box3().setFromObject(m)
        b.getCenter(tmp)
        const inside = tmp.x >= box.min.x - 0.05 && tmp.x <= box.max.x + 0.05 && tmp.z >= box.min.z - 0.05 && tmp.z <= box.max.z + 0.05
        if (inside && b.min.y >= box.max.y - 0.35) members.add(m)
      }
    }

    const full = new THREE.Box3()
    for (const m of members) full.union(new THREE.Box3().setFromObject(m))
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    const pivot = new THREE.Matrix4().compose(new THREE.Vector3(cx, box.min.y, cz), new THREE.Quaternion().setFromAxisAngle(Y, def.facing), new THREE.Vector3(1, 1, 1))
    const inv = pivot.clone().invert()

    const g = new THREE.Group()
    g.name = def.id
    for (const m of members) {
      const c = (m as THREE.Mesh).clone()
      c.matrixAutoUpdate = false
      c.matrix.copy(inv).multiply(m.matrixWorld)
      c.castShadow = true
      c.receiveShadow = true
      g.add(c)
    }
    g.userData.size = full.getSize(new THREE.Vector3()).toArray()
    out.set(def.id, g)
  }
  return out
}

/** Madera del piso, dibujada en un canvas: no depende de ningún archivo. */
export function woodTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const tones = ['#CFA06A', '#C4955E', '#D4A874', '#BE8D58', '#CA9B64']
  const plank = 64
  for (let i = 0; i < 512 / plank; i++) {
    g.fillStyle = tones[i % tones.length]
    g.fillRect(0, i * plank, 512, plank)
    // vetas
    g.globalAlpha = 0.09
    g.fillStyle = '#6B4423'
    for (let k = 0; k < 7; k++) g.fillRect(((i * 97 + k * 71) % 480), i * plank + 8 + ((k * 13) % 44), 40 + ((k * 37) % 90), 2)
    g.globalAlpha = 1
    // juntas
    g.fillStyle = 'rgba(95,60,28,0.55)'
    g.fillRect(0, i * plank, 512, 2)
    const off = (i % 2) * 256
    g.fillRect(off, i * plank, 2, plank)
    g.fillRect(off + 256, i * plank, 2, plank)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
