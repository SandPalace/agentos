// @ts-nocheck — three.js tipos complejos
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OfficeLayout, Rug, Wall, Win } from '@/lib/office/generate'
import { buildPrefabs, woodTexture } from './prefabs'
import type { AABB2D } from './officeNavGrid'
import { footprintBoxes, type Tri } from '@/lib/office/footprint'

/** Triángulos de una malla proyectados al piso (coordenadas del mundo). */
function meshTris(o: THREE.Mesh): Tri[] {
  const g = o.geometry
  const pos = g.getAttribute('position')
  if (!pos) return []
  const idx = g.index
  const v = new THREE.Vector3()
  const at = (i: number): [number, number] => {
    v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
    return [v.x, v.z]
  }
  const out: Tri[] = []
  const n = idx ? idx.count : pos.count
  for (let k = 0; k + 2 < n; k += 3) {
    const a = at(idx ? idx.getX(k) : k)
    const b = at(idx ? idx.getX(k + 1) : k + 1)
    const c = at(idx ? idx.getX(k + 2) : k + 2)
    out.push([a[0], a[1], b[0], b[1], c[0], c[1]])
  }
  return out
}


/**
 * Tapete con diseño: textura dibujada en un canvas (marco liso, rombos o franjas) a partir de dos colores.
 * Inspirado en los geométricos y las paletas de tierra con un toque de color de los tapetes modernos de 2026.
 */
function rugTexture(r: Rug): THREE.CanvasTexture {
  const PX = 64 // píxeles por unidad: nítido sin ser pesado
  const W = Math.max(64, Math.round(r.w * PX))
  const D = Math.max(64, Math.round(r.d * PX))
  const c = document.createElement('canvas')
  c.width = W
  c.height = D
  const g = c.getContext('2d')!
  const accent = r.accent ?? r.color
  g.fillStyle = r.color
  g.fillRect(0, 0, W, D)
  const style = r.style ?? 'plain'
  const m = Math.round(0.34 * PX) // ancho del borde
  if (style === 'diamond') {
    // rombos en cuadrícula; los alternos son más claros
    const cell = 0.9 * PX
    g.save()
    g.beginPath(); g.rect(m, m, W - 2 * m, D - 2 * m); g.clip()
    for (let y = m; y < D - m + cell; y += cell)
      for (let x = m; x < W - m + cell; x += cell) {
        const k = (Math.round((x - m) / cell) + Math.round((y - m) / cell)) % 2
        g.fillStyle = accent
        g.globalAlpha = k ? 0.9 : 0.35
        g.beginPath()
        g.moveTo(x, y - cell / 2.4); g.lineTo(x + cell / 2.4, y); g.lineTo(x, y + cell / 2.4); g.lineTo(x - cell / 2.4, y); g.closePath()
        g.fill()
      }
    g.restore()
    g.globalAlpha = 1
  } else if (style === 'stripes') {
    // franjas a lo largo del tapete: una ancha y dos finas, alternadas
    g.save()
    g.beginPath(); g.rect(m, m, W - 2 * m, D - 2 * m); g.clip()
    const band = 0.5 * PX
    for (let x = m, i = 0; x < W - m; x += band, i++) {
      g.fillStyle = accent
      g.globalAlpha = i % 3 === 0 ? 0.95 : i % 3 === 1 ? 0.25 : 0
      g.fillRect(x, m, band * (i % 3 === 0 ? 1 : 0.6), D - 2 * m)
    }
    g.restore()
    g.globalAlpha = 1
  }
  if (style !== 'plain') {
    // marco doble: línea del color del dibujo y un filete interior
    g.strokeStyle = accent
    g.lineWidth = Math.max(3, 0.07 * PX)
    g.strokeRect(m * 0.45, m * 0.45, W - m * 0.9, D - m * 0.9)
    g.lineWidth = Math.max(2, 0.035 * PX)
    g.strokeRect(m, m, W - 2 * m, D - 2 * m)
  }
  // flecos en los extremos cortos (marcas finas)
  g.fillStyle = accent
  g.globalAlpha = 0.5
  for (let y = 0; y < D; y += 6) { g.fillRect(0, y, 3, 2); g.fillRect(W - 3, y, 3, 2) }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function RugMesh({ r }: { r: Rug }) {
  const map = useMemo(() => rugTexture(r), [r.w, r.d, r.color, r.accent, r.style])
  useEffect(() => () => map.dispose(), [map])
  return (
    <group position={[r.x, 0.012, r.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><planeGeometry args={[r.w, r.d]} /><meshLambertMaterial map={map} /></mesh>
      <mesh position={[0, 0, -0.002]}><planeGeometry args={[r.w + 0.3, r.d + 0.3]} /><meshBasicMaterial color="#000000" transparent opacity={0.07} /></mesh>
    </group>
  )
}

const WALL = '#EFD9B8'
const METAL = '#7B879E'
const TRIM = '#B98F5C'


/** Muro de cristal con marco metálico: travesaños arriba y abajo, parantes cada ~1.8, y una franja esmerilada a la altura de los ojos. */
function GlassWall({ w }: { w: Wall }) {
  const alongX = w.w >= w.d
  const len = alongX ? w.w : w.d
  const H = w.h
  const T = 0.16
  const posts = Math.max(2, Math.ceil(len / 3.2) + 1) // paneles anchos: un parante cada ~3
  const metal = <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.38} />
  const at = (u: number): [number, number, number] => (alongX ? [w.x - len / 2 + u, 0, w.z] : [w.x, 0, w.z - len / 2 + u])
  const dims = (a: number, b: number, c: number): [number, number, number] => (alongX ? [a, b, c] : [c, b, a])
  const mid = (y: number): [number, number, number] => [w.x, y, w.z]
  return (
    <group>
      {/* cristal */}
      <mesh position={mid(H / 2)}>
        <boxGeometry args={dims(len, H - 0.2, 0.05)} />
        <meshStandardMaterial color="#BFE2F3" transparent opacity={0.22} roughness={0.08} metalness={0.1} depthWrite={false} />
      </mesh>
      {/* franja esmerilada para privacidad */}
      <mesh position={mid(1.35)}>
        <boxGeometry args={dims(len, 0.62, 0.07)} />
        <meshStandardMaterial color="#F4F8FB" transparent opacity={0.62} roughness={0.9} depthWrite={false} />
      </mesh>
      {/* travesaños */}
      <mesh position={mid(0.14)} castShadow><boxGeometry args={dims(len, 0.28, T)} />{metal}</mesh>
      <mesh position={mid(H - 0.07)} castShadow><boxGeometry args={dims(len, 0.14, T)} />{metal}</mesh>
      {/* parantes */}
      {Array.from({ length: posts }, (_, i) => {
        const u = (len * i) / (posts - 1)
        const p = at(u)
        return (
          <mesh key={i} position={[p[0], H / 2, p[2]]} castShadow>
            <boxGeometry args={dims(0.14, H, T)} />
            {metal}
          </mesh>
        )
      })}
    </group>
  )
}

/** Ventana de cristal en el muro de la recepcionista: marco metálico ancho y un parante al centro. */
function GlassWindow({ win }: { win: Win }) {
  const h = win.y1 - win.y0
  const F = 0.14
  const metal = <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.38} />
  const cy = (win.y0 + win.y1) / 2
  return (
    <group position={[win.x, cy, win.z]}>
      <mesh><boxGeometry args={[win.w - 0.1, h - 0.1, 0.05]} /><meshStandardMaterial color="#BFE2F3" transparent opacity={0.25} roughness={0.08} metalness={0.1} depthWrite={false} /></mesh>
      <mesh position={[0, h / 2 - F / 2, 0]} castShadow><boxGeometry args={[win.w + 0.12, F, 0.36]} />{metal}</mesh>
      <mesh position={[0, -h / 2 + F / 2, 0]} castShadow><boxGeometry args={[win.w + 0.12, F, 0.36]} />{metal}</mesh>
      <mesh position={[-win.w / 2 + F / 2 - 0.02, 0, 0]} castShadow><boxGeometry args={[F, h, 0.36]} />{metal}</mesh>
      <mesh position={[win.w / 2 - F / 2 + 0.02, 0, 0]} castShadow><boxGeometry args={[F, h, 0.36]} />{metal}</mesh>
      <mesh castShadow><boxGeometry args={[0.1, h, 0.3]} />{metal}</mesh>
    </group>
  )
}

/** Oficina armada con el catálogo según el layout. Avisa con los obstáculos para la navegación. */
export default function ParametricOffice({ layout, onBuilt }: { layout: OfficeLayout; onBuilt?: (obstacles: AABB2D[]) => void }) {
  const { scene } = useGLTF('/Office.glb')
  // Metal con brillo lento, como el letrero de la oficina original.
  const signMat = useRef(new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0c0c8'), metalness: 0.95, roughness: 0.15, envMapIntensity: 1.5 }))
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    signMat.current.envMapIntensity = 1.5 + 1.0 * Math.sin(t * 0.6)
    signMat.current.roughness = 0.15 + 0.08 * Math.sin(t * 0.9 + 1.0)
  })
  const prefabs = useMemo(() => {
    const m = buildPrefabs(scene)
    if (new URLSearchParams(window.location.search).has('debug')) {
      const o: Record<string, number[]> = {}
      m.forEach((g, id) => { const b = new THREE.Box3().setFromObject(g); o[id] = [b.min.x, b.max.x, b.min.z, b.max.z, b.max.y] })
      ;(window as any).__prefabs = o
      const det: any = {}
      for (const id of ['bench', 'reception-desk']) {
        const g = m.get(id); if (!g) continue
        g.updateMatrixWorld(true)
        det[id] = g.children.map((c: any) => { const b = new THREE.Box3().setFromObject(c); const mat = Array.isArray(c.material) ? c.material[0] : c.material; return { name: c.name, mat: mat?.name, color: mat?.color?.getHexString?.(), b: [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z].map((v: number) => +v.toFixed(2)) } })
      }
      ;(window as any).__prefabDetail = det
    }
    return m
  }, [scene])
  const [obstacles, setObstacles] = useState<AABB2D[] | null>(null)
  const floorTex = useMemo(() => woodTexture(layout.width / 4, layout.depth / 4), [layout.width, layout.depth])

  const furniture = useMemo(() => {
    const root = new THREE.Group()
    for (const p of layout.placements) {
      const src = prefabs.get(p.id)
      if (!src) continue
      const inst = src.clone(true)
      inst.position.set(p.x, p.y ?? 0, p.z)
      inst.rotation.y = p.facing
      root.add(inst)
    }
    return root
  }, [layout, prefabs])

  useEffect(() => {
    furniture.updateMatrixWorld(true)
    const out: AABB2D[] = []
    furniture.traverse((o: any) => {
      if (!o.isMesh) return
      const b = new THREE.Box3().setFromObject(o)
      const s = b.getSize(new THREE.Vector3())
      if (s.y < 0.1 || s.x > 20 || s.z > 20 || s.y > 5) return
      // Un mueble grande en "L" (el mostrador) no debe bloquear el hueco de su esquina: se usa su huella real.
      if (s.x * s.z > 2.5) {
        const fine = footprintBoxes(meshTris(o))
        if (fine.length) {
          out.push(...fine)
          return
        }
      }
      out.push({ minX: b.min.x, minZ: b.min.z, maxX: b.max.x, maxZ: b.max.z })
    })
    // Las paredes altas también bloquean el paso (los muros bajos no: se pueden rodear con la vista, no caminar encima).
    for (const w of layout.walls) {
      out.push({ minX: w.x - w.w / 2, maxX: w.x + w.w / 2, minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2 })
    }
    // Con ?debug en la URL se expone la lista de obstáculos para revisar la navegación desde fuera.
    const dbg = new URLSearchParams(window.location.search).get('debug')
    if (dbg !== null) (window as any).__obs = out
    if (dbg === 'obs') setObstacles(out) // dibuja las zonas bloqueadas para revisar colisiones
    onBuilt?.(out)
  }, [furniture, layout, onBuilt])

  const { width: W, depth: D, wallHeight: H } = layout
  return (
    <group>
      {/* piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.01, D / 2]} receiveShadow>
        <planeGeometry args={[W + 0.4, D + 0.4]} />
        <meshLambertMaterial map={floorTex} />
      </mesh>
      {/* alfombras por zona */}
      {layout.rugs.map((r, i) => <RugMesh key={i} r={r} />)}
      {/* paredes: fondo (norte y oeste), sala de juntas de cristal, muro de la recepción y muretes del frente */}
      {layout.walls.filter((w) => w.kind === 'glass').map((w, i) => (
        <GlassWall key={`g${i}`} w={w} />
      ))}
      {layout.windows.map((win, i) => (
        <GlassWindow key={`w${i}`} win={win} />
      ))}
      {layout.walls.filter((w) => w.kind !== 'glass').map((w, i) => (
        <group key={i}>
          <mesh position={[w.x, (w.y0 ?? 0) + w.h / 2, w.z]} castShadow receiveShadow>
            <boxGeometry args={[w.w, w.h, w.d]} />
            <meshLambertMaterial color={WALL} />
          </mesh>
          {/* zócalo */}
          {w.h > 1 && !w.y0 && (
            <mesh position={[w.x, 0.14, w.z]}>
              <boxGeometry args={[w.w + (w.w < w.d ? 0.08 : 0), 0.28, w.d + (w.d < w.w ? 0.08 : 0)]} />
              <meshLambertMaterial color={TRIM} />
            </mesh>
          )}
        </group>
      ))}
      {/* letreros: el nombre de la empresa lleva el metal animado del original */}
      {layout.signs.map((sg, i) => (
        <Text key={i} position={[sg.x, sg.y, sg.z]} rotation={[0, sg.facing, 0]} fontSize={sg.size} anchorX="center" anchorY="middle" letterSpacing={0.06} maxWidth={sg.maxWidth ?? 9}
          font="/fonts/inter-black.ttf" material={sg.metal ? signMat.current : undefined} color={sg.metal ? undefined : '#7A4E2D'}
          strokeWidth={sg.metal ? '2.5%' : undefined} strokeColor={sg.metal ? '#8888a0' : undefined}>
          {sg.text}
        </Text>
      ))}
      {/* dintel metálico sobre la puerta de la oficina del CEO y de la sala de juntas */}
      {[layout.ceo.door, layout.meeting.door].map((d: any, i: number) => (
        <mesh key={`dl${i}`} position={[d.x, H - 0.14, (d.z0 + d.z1) / 2]} castShadow>
          <boxGeometry args={[0.16, 0.28, d.z1 - d.z0]} />
          <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.38} />
        </mesh>
      ))}
      {obstacles?.map((o, i) => (
        <mesh key={`o${i}`} position={[(o.minX + o.maxX) / 2, 0.06, (o.minZ + o.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[o.maxX - o.minX + 0.4, o.maxZ - o.minZ + 0.4]} />
          <meshBasicMaterial color="#E5484D" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      <primitive object={furniture} />
    </group>
  )
}
