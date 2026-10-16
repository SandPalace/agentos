// @ts-nocheck — R3F JSX types are complex; works at runtime
'use client'
import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import VoxelAvatar from './office/VoxelAvatar'
import { FACE_GLB_COUNT } from './office/officeLayout'

const COLS = 7
const PITCH_X = 2.1
const PITCH_Z = 2.9

function Frame({ rows }: { rows: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const w = (COLS - 1) * PITCH_X + 2.2
    const h = (rows - 1) * PITCH_Z + 3.2
    camera.zoom = Math.min(size.width / w, size.height / h)
    const cx = ((COLS - 1) * PITCH_X) / 2
    const cy = 1.15 - ((rows - 1) * PITCH_Z) / 2
    camera.position.set(cx, cy, 30)
    camera.lookAt(cx, cy, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, rows])
  return null
}

/** Galería de las 21 caras de voxel: un solo canvas, se elige con un clic. `taken` marca las que ya usa otro agente. */
export default function AvatarGallery({ value, taken = [], onPick }: { value: number | null; taken?: number[]; onPick: (face: number) => void }) {
  const rows = Math.ceil(FACE_GLB_COUNT / COLS)
  return (
    <Canvas orthographic camera={{ position: [6, 2, 30], zoom: 60, near: 0.1, far: 100 }} dpr={[1, 2]} style={{ background: '#FBF1DD' }}>
      <ambientLight intensity={1.1} color="#FFF1DC" />
      <directionalLight position={[4, 10, 12]} intensity={1.1} />
      <Frame rows={rows} />
      <Suspense fallback={null}>
        {Array.from({ length: FACE_GLB_COUNT }, (_, i) => {
          const x = (i % COLS) * PITCH_X
          const y = -Math.floor(i / COLS) * PITCH_Z
          const sel = value === i
          return (
            <group key={i} position={[x, y, 0]}>
              <mesh position={[0, 1.15, -1]} onClick={() => onPick(i)}>
                <planeGeometry args={[1.9, 2.7]} />
                <meshBasicMaterial color={sel ? '#CFE0FF' : '#F4E3C3'} />
              </mesh>
              <VoxelAvatar faceIndex={i} position={[0, 0, 0]} rotation={0} standing status="IDLE" onSelect={() => onPick(i)} />
              <Html position={[0, -0.3, 0]} center style={{ pointerEvents: 'none' }}>
                <div className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${sel ? 'bg-blue text-white' : 'bg-surface text-ink'}`}>
                  {i + 1}{taken.includes(i) && !sel ? ' · en uso' : ''}
                </div>
              </Html>
            </group>
          )
        })}
      </Suspense>
    </Canvas>
  )
}
