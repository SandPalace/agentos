// @ts-nocheck — R3F JSX types are complex; works at runtime
// Iluminación de la escena según la hora local: sol con sombras, cielo, relleno y lámparas de noche.
// Reemplaza a ambientLight + hemisphereLight + Sun + luz de relleno de OfficeScene.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lightingFor, localHour, type Lighting } from '@/lib/office/daylight';
import type { OfficeLayout } from '@/lib/office/generate';

const REFRESH_MS = 60_000;
const SUN_DISTANCE = 40;
const LAMP_COLOR = '#FFD08A';
const LAMP_STRENGTH = 16; // candela por lámpara a plena noche (decay 2)
const LAMP_HEIGHT = 2.6;

// Hora actual; `?hour=` en la URL la sustituye para revisar cómo se ve a otra hora.
function currentLighting(): Lighting {
  const override = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('hour') : null;
  return lightingFor(localHour(new Date(), override));
}

// Mantiene la iluminación actual y la recalcula cada minuto.
export function useDaylight(): Lighting {
  const [lighting, setLighting] = useState<Lighting>(() => currentLighting());
  useEffect(() => {
    const tick = () => setLighting(currentLighting());
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return lighting;
}

// Puntos de luz nocturna: dos en el área de trabajo, recepción, sala de juntas y el lado oeste (café, esquina y lounge).
function lampPoints(layout: OfficeLayout): [number, number][] {
  const z = layout.zones ?? {};
  const pts: [number, number][] = [];
  const cw = z.cowork;
  if (cw) {
    pts.push([cw.x + cw.w * 0.25, cw.z + cw.d * 0.5], [cw.x + cw.w * 0.75, cw.z + cw.d * 0.5]);
  }
  // Lado oeste: café, esquina noroeste de la columna y lounge (donde esté).
  if (z.coffee) pts.push([z.coffee.x + z.coffee.w / 2, z.coffee.z + z.coffee.d / 2]);
  if (z.chill) pts.push([z.chill.x + z.chill.w / 2, 3.2]);
  if (z.lounge) pts.push([z.lounge.x + z.lounge.w / 2, z.lounge.z + z.lounge.d / 2]);
  for (const key of ['reception', 'meeting']) {
    const zn = z[key];
    if (zn) pts.push([zn.x + zn.w / 2, zn.z + zn.d / 2]);
  }
  return pts;
}

export default function Daylight({ layout, dark }: { layout: OfficeLayout; dark?: boolean }) {
  const L = useDaylight();
  const { scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const [cx, cz] = layout.center;
  const k = dark ? 0.85 : 1; // el tema oscuro baja un poco la luz

  // El target del sol debe estar en la escena para que el sol apunte al centro de la oficina.
  useEffect(() => {
    const l = sunRef.current;
    if (!l) return;
    l.target.position.set(cx, 0, cz);
    scene.add(l.target);
    return () => { scene.remove(l.target); };
  }, [cx, cz, scene]);

  // Extensión de la sombra según el tamaño de la oficina (igual que el Sun anterior).
  const span = Math.max(layout.width, layout.depth) * 0.75;
  const sunPos = useMemo<[number, number, number]>(
    () => [cx + L.sun.dir[0] * SUN_DISTANCE, L.sun.dir[1] * SUN_DISTANCE, cz + L.sun.dir[2] * SUN_DISTANCE],
    [cx, cz, L.sun.dir],
  );

  const lamps = useMemo(() => lampPoints(layout), [layout]);
  const lampOn = L.lamps > 0.02;
  const lampIntensity = LAMP_STRENGTH * L.lamps * k;

  return (
    <group>
      {/* Luz ambiental y de cielo (cambian con la hora) */}
      <ambientLight intensity={L.ambient.intensity * k} color={L.ambient.color} />
      <hemisphereLight color={L.hemi.sky} groundColor={L.hemi.ground} intensity={L.hemi.intensity * k} />

      {/* Sol: proyecta sombras, apunta al centro de la oficina */}
      <directionalLight
        ref={sunRef}
        position={sunPos}
        intensity={L.sun.intensity * k}
        color={L.sun.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-radius={4}
        shadow-camera-far={120}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
      />

      {/* Relleno frío, débil, desde el lado opuesto al sol */}
      <directionalLight ref={fillRef} position={[cx - 14, 14, cz - 10]} intensity={0.3 * k} color="#CFE0FF" />

      {/* Lámparas nocturnas: sin sombras para no castigar el rendimiento */}
      {lampOn && lamps.map(([x, z], i) => (
        <group key={`lamp-${i}`}>
          <pointLight position={[x, LAMP_HEIGHT, z]} intensity={lampIntensity} color={LAMP_COLOR} distance={14} decay={2} />
          <mesh position={[x, LAMP_HEIGHT + 0.15, z]}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial color={LAMP_COLOR} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
