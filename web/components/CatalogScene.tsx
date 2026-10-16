// @ts-nocheck — three.js tipos complejos
'use client'
import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CATALOG } from '@/lib/office/catalog'
import { buildPrefabs } from './office/prefabs'

const COLS = 5
const PITCH = 6.5

function Sheet() {
  const { scene } = useGLTF('/Office.glb')
  const prefabs = useMemo(() => buildPrefabs(scene), [scene])
  return (
    <>
      {CATALOG.map((def, i) => {
        const p = prefabs.get(def.id)
        if (!p) return null
        const x = (i % COLS) * PITCH
        const z = Math.floor(i / COLS) * PITCH
        const size = p.userData.size
        return (
          <group key={def.id} position={[x, 0, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
              <planeGeometry args={[PITCH - 0.6, PITCH - 0.6]} />
              <meshLambertMaterial color="#EFE3CE" />
            </mesh>
            <primitive object={p.clone(true)} />
            {/* flecha hacia el frente (+Z) */}
            <mesh position={[0, 0.05, size[2] / 2 + 0.55]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.18, 0.42, 12]} />
              <meshBasicMaterial color="#2D6BFF" />
            </mesh>
            <Html position={[0, size[1] + 0.9, 0]} center style={{ pointerEvents: 'none' }}>
              <div className="whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink">{i + 1}. {def.label}</div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

export default function CatalogScene() {
  const rows = Math.ceil(CATALOG.length / COLS)
  const cx = ((COLS - 1) * PITCH) / 2
  const cz = ((rows - 1) * PITCH) / 2
  return (
    <Canvas shadows orthographic camera={{ position: [cx + 40, 40, cz + 40], zoom: 26, near: 0.1, far: 300 }}>
      <color attach="background" args={['#FBEFD9']} />
      <ambientLight intensity={0.95} color="#FFE9CF" />
      <hemisphereLight args={['#FFF6E6', '#C79A68', 0.9]} />
      <directionalLight position={[cx + 12, 22, cz + 10]} intensity={1.3} color="#FFD9A6" />
      <Suspense fallback={null}>
        <Sheet />
      </Suspense>
      <OrbitControls enablePan target={[cx, 0, cz]} minZoom={10} maxZoom={90} />
    </Canvas>
  )
}
