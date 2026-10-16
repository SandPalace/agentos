// @ts-nocheck — R3F JSX types are complex; works at runtime
// Voxel avatar rig: GLB face on a box body, seated typing / idle breathing /
// path walking. Ported from an earlier internal 3D office.
import { useRef, useMemo, Suspense, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { AVATAR_PALETTES, KIND_3D_COLORS, faceModelUrl } from './officeLayout';
import { isWalkableWorld, getFloorBounds, getActiveObstacles } from './officeNavGrid';
import { moveClamped, hits, PLAYER_RADIUS } from '@/lib/office/collide';

export type AgentVisualStatus = 'IDLE' | 'BUSY' | 'OFFLINE' | 'ERROR' | 'MAINTENANCE' | 'TALKING';

export interface VoxelAvatarProps {
  faceIndex: number; // 0–20
  position?: [number, number, number];
  rotation?: number; // Y-axis radians (from desk assignment)
  status?: AgentVisualStatus;
  name?: string;
  kind?: string; // claude | opencode | service | human
  /** When true + BUSY, play seated typing animation instead of walking */
  seated?: boolean;
  /** Force the standing pose (lobby slots, no chair) — idle sway, arms down */
  standing?: boolean;
  /** World-space waypoints to walk along — overrides seated/idle animations */
  path?: [number, number, number][];
  /** Called once when the last waypoint is reached */
  onPathComplete?: () => void;
  /** Clicking the avatar navigates here (e.g. /dashboard/<id>) */
  onSelect?: () => void;
  /** Speech-bubble text (latest voice line); rendered above the head */
  bubble?: string | null;
  /** Modo controlado (la persona usuaria): una referencia con la dirección deseada; el avatar camina y choca solo. */
  /** `seat`: si no es null, la persona está sentada ahí (se asigna para sentarla; el avatar lo limpia al levantarse). `seated`: lo expone el avatar. */
  control?: { current: { dx: number; dz: number; x: number; z: number; moving: boolean; run?: boolean; tp?: [number, number]; seat?: { x: number; z: number; rotation: number } | null; seated?: boolean } };
}

const D = {
  headH: 0.35, headW: 0.34, headD: 0.34,
  torsoH: 0.55, torsoW: 0.42, torsoD: 0.26,
  upperArmH: 0.28, upperArmW: 0.16, upperArmD: 0.16,
  lowerArmH: 0.24, lowerArmW: 0.14, lowerArmD: 0.14,
  handH: 0.12, handW: 0.14, handD: 0.14,
  upperLegH: 0.32, upperLegW: 0.18, upperLegD: 0.18,
  lowerLegH: 0.28, lowerLegW: 0.16, lowerLegD: 0.16,
  footH: 0.1, footW: 0.17, footD: 0.24,
  shoulderOffX: 0.32, hipOffX: 0.12,
} as const;

const SEATED_Y_OFFSET = 0.45;
const AVATAR_SCALE = 1.5;
/** Altura de la cadera sobre el piso con el personaje de pie: las piernas cuelgan del origen del rig (0.32 + 0.28 + 0.1). */
const PLAYER_SPEED = 4.5; // unidades del mundo por segundo
const RUN_MULT = 1.9; // con Shift
const STRIDE = 1.15; // distancia del mundo que recorre cada medio ciclo de paso (un pie)
const STAND_Y = D.upperLegH + D.lowerLegH + D.footH;

const SIT = { hipX: -Math.PI / 2, kneeX: Math.PI / 2, shoulderX: -Math.PI / 10, elbowX: -Math.PI / 4 } as const;

const STATUS_DOT: Record<string, string> = {
  IDLE: '#66ccff',
  BUSY: '#22cc44',
  TALKING: '#22cc44',
  ERROR: '#ff3333',
  MAINTENANCE: '#b388ff',
  OFFLINE: '#999999',
};

export default function VoxelAvatar({
  faceIndex,
  position = [0, 0, 0],
  rotation = 0,
  status = 'IDLE',
  name,
  kind,
  seated = false,
  standing = false,
  path,
  onPathComplete,
  onSelect,
  bubble,
  control,
}: VoxelAvatarProps) {
  const palette = AVATAR_PALETTES[Math.min(faceIndex, AVATAR_PALETTES.length - 1)];
  const labelColor = (kind && KIND_3D_COLORS[kind]) ?? KIND_3D_COLORS.agent;
  const faceUrl = faceModelUrl(faceIndex);
  const walking = !!(path && path.length > 0) || !!control;

  return (
    // Caminando: el grupo va en el origen y el camino se recorre en coordenadas del mundo (ver AvatarRig).
    <group position={walking ? [0, 0, 0] : position} rotation={[0, walking ? 0 : rotation, 0]} scale={AVATAR_SCALE}>
      <AvatarRig
        control={control}
        startPos={position}
        palette={palette}
        status={status}
        seated={seated}
        standing={standing}
        name={name}
        labelColor={labelColor}
        faceUrl={faceUrl}
        path={path}
        onPathComplete={onPathComplete}
        onSelect={onSelect}
        bubble={bubble}
      />
    </group>
  );
}

function AvatarRig({
  palette, status, seated, standing, name, labelColor, faceUrl, path, startPos, control, onPathComplete, onSelect, bubble,
}) {
  const rootRef = useRef<THREE.Group>(null);
  const shoulderLRef = useRef<THREE.Group>(null);
  const shoulderRRef = useRef<THREE.Group>(null);
  const elbowLRef = useRef<THREE.Group>(null);
  const elbowRRef = useRef<THREE.Group>(null);
  const hipLRef = useRef<THREE.Group>(null);
  const hipRRef = useRef<THREE.Group>(null);
  const kneeLRef = useRef<THREE.Group>(null);
  const kneeRRef = useRef<THREE.Group>(null);
  const headPivotRef = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);

  const waypointIndexRef = useRef(0);
  const prevPathRef = useRef(undefined);
  const pathDoneRef = useRef(false);
  const walkStartedRef = useRef(false);
  const controlInitRef = useRef(false);
  const seatAppliedRef = useRef<any>(null); // el asiento al que ya se pegó el personaje controlado

  if (path !== prevPathRef.current) {
    prevPathRef.current = path;
    waypointIndexRef.current = 0;
    pathDoneRef.current = false;
    walkStartedRef.current = false;
  }

  const isSeated = !standing && (status !== 'BUSY' || seated);
  const isTalking = status === 'TALKING';

  useFrame((state, delta) => {
    const root = rootRef.current;
    const sL = shoulderLRef.current, sR = shoulderRRef.current;
    const eL = elbowLRef.current, eR = elbowRRef.current;
    const hL = hipLRef.current, hR = hipRRef.current;
    const kL = kneeLRef.current, kR = kneeRRef.current;
    const headPivot = headPivotRef.current;
    if (!root || !sL || !sR || !eL || !eR || !hL || !hR || !kL || !kR) return;

    const t = state.clock.elapsedTime;

    const S = AVATAR_SCALE;

    // ── Priority 0: personaje controlado por la persona usuaria (WASD / flechas) ──
    if (control) {
      const c = control.current;
      if (!controlInitRef.current) {
        controlInitRef.current = true;
        root.position.set(startPos[0] / S, STAND_Y, startPos[2] / S);
        root.rotation.y = Math.PI;
      }
      if (c.tp) { // teletransporte (sólo pruebas con ?debug)
        root.position.set(c.tp[0] / S, STAND_Y, c.tp[1] / S);
        c.tp = undefined;
      }
      const mag = Math.hypot(c.dx, c.dz);
      const SEAT_FWD = 0.5 - D.torsoD; // misma postura que quien se sienta sin control: un poco adelante del centro de la silla
      // Sentado: cualquier tecla de movimiento lo levanta (a un lugar libre frente a la silla, o a su lado); si no, pose sentada.
      if (c.seat && mag > 0.01) {
        const st = c.seat;
        const fx = Math.sin(st.rotation), fz = Math.cos(st.rotation);
        let ex = st.x + fx * 0.95, ez = st.z + fz * 0.95;
        const obs = getActiveObstacles();
        search: for (const d of [0.95, 1.25, 1.7]) {
          for (const [ax, az] of [[fx, fz], [fz, -fx], [-fz, fx], [-fx, -fz]]) {
            const px = st.x + ax * d, pz = st.z + az * d;
            if (!hits(px, pz, PLAYER_RADIUS, obs)) { ex = px; ez = pz; break search; }
          }
        }
        root.position.set(ex / S, STAND_Y, ez / S);
        c.seat = null;
        c.seated = false;
        seatAppliedRef.current = null;
      }
      if (c.seat) {
        const st = c.seat;
        if (seatAppliedRef.current !== st) { // pegarse a la silla (cualquier tecla E ya la asignó)
          seatAppliedRef.current = st;
          root.position.set(st.x / S + Math.sin(st.rotation) * SEAT_FWD, SEATED_Y_OFFSET, st.z / S + Math.cos(st.rotation) * SEAT_FWD);
          root.rotation.set(0, st.rotation, 0);
        }
        c.seated = true;
        c.moving = false;
        const ks = 1 - Math.exp(-delta * 16);
        const eS = (g: THREE.Group, axis: 'x' | 'z', v: number) => { g.rotation[axis] += (v - g.rotation[axis]) * ks; };
        eS(hL, 'x', SIT.hipX); eS(hR, 'x', SIT.hipX);
        eS(kL, 'x', SIT.kneeX); eS(kR, 'x', SIT.kneeX);
        eS(sL, 'x', SIT.shoulderX); eS(sR, 'x', SIT.shoulderX);
        eS(sL, 'z', 0.06); eS(sR, 'z', -0.06);
        eS(eL, 'x', SIT.elbowX); eS(eR, 'x', SIT.elbowX);
        eS(root, 'x', 0); eS(root, 'z', 0);
        root.position.y += (SEATED_Y_OFFSET + Math.sin(t * 1.4) * 0.012 - root.position.y) * ks; // respiración suave
        if (headPivot) headPivot.rotation.x += (Math.sin(t * 0.7) * 0.03 - headPivot.rotation.x) * ks;
        c.x = root.position.x * S;
        c.z = root.position.z * S;
        return;
      }
      c.seated = false;
      // Todas las articulaciones se acercan a su pose objetivo con amortiguación: arrancar y frenar no "salta".
      const k = 1 - Math.exp(-delta * 16);
      const ease = (g: THREE.Group, axis: 'x' | 'z', v: number) => { g.rotation[axis] += (v - g.rotation[axis]) * k; };
      let tgt;
      if (mag > 0.01) {
        const ux = c.dx / mag, uz = c.dz / mag;
        const run = !!c.run;
        const stepW = PLAYER_SPEED * (run ? RUN_MULT : 1) * delta; // distancia en unidades del mundo
        // colisión exacta (círculo contra las cajas de los muebles), en coordenadas del mundo
        const fb = getFloorBounds();
        const px = root.position.x * S, pz = root.position.z * S;
        const [wx, wz] = moveClamped(px, pz, ux * stepW, uz * stepW, PLAYER_RADIUS, getActiveObstacles(), { minX: fb.minX + 0.5, maxX: fb.maxX - 0.5, minZ: fb.minZ + 0.5, maxZ: fb.maxZ - 0.5 });
        // El ciclo de paso avanza con la distancia realmente recorrida: los pies no patinan y, contra una pared, el personaje no "camina en el lugar".
        const moved = Math.hypot(wx - px, wz - pz);
        walkPhase.current += (moved / STRIDE) * Math.PI;
        const nx = wx / S;
        const nz = wz / S;
        const sw = Math.sin(walkPhase.current);
        const cw = Math.cos(walkPhase.current);
        root.position.set(nx, STAND_Y + Math.abs(cw) * (run ? 0.08 : 0.05), nz);
        let diff = Math.atan2(ux, uz) - root.rotation.y;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        root.rotation.y += diff * Math.min(1, delta * 12);
        const walking = moved > 1e-4;
        const amp = walking ? 1 : 0;
        // La pierna se dobla en la fase de balanceo (cuando pasa de atrás hacia adelante); el brazo opuesto acompaña.
        const g = run ? 1.5 : 1; // al correr: zancada y balanceo más amplios, más inclinación
        tgt = {
          hL: -sw * 0.55 * g * amp, hR: sw * 0.55 * g * amp,
          kL: Math.max(0, cw) * 0.7 * g * amp, kR: Math.max(0, -cw) * 0.7 * g * amp,
          sL: sw * 0.5 * g * amp, sR: -sw * 0.5 * g * amp,
          eL: -(run ? 0.9 : 0.15) - Math.max(0, -sw) * 0.4 * amp, eR: -(run ? 0.9 : 0.15) - Math.max(0, sw) * 0.4 * amp,
          lean: run ? -0.22 : -0.07, roll: -sw * 0.02 * amp,
        };
        c.moving = true;
      } else {
        // quieto: respira con los brazos relajados
        tgt = {
          hL: 0, hR: 0, kL: 0, kR: 0,
          sL: Math.sin(t * 0.9) * 0.03, sR: -Math.sin(t * 0.9) * 0.03,
          eL: -0.08, eR: -0.08,
          lean: 0, roll: Math.sin(t * 0.8) * 0.02,
        };
        root.position.y += (STAND_Y - root.position.y) * k;
        c.moving = false;
      }
      ease(hL, 'x', tgt.hL); ease(hR, 'x', tgt.hR);
      ease(kL, 'x', tgt.kL); ease(kR, 'x', tgt.kR);
      ease(sL, 'x', tgt.sL); ease(sR, 'x', tgt.sR);
      ease(sL, 'z', 0.06); ease(sR, 'z', -0.06);
      ease(eL, 'x', tgt.eL); ease(eR, 'x', tgt.eR);
      ease(root, 'x', tgt.lean); ease(root, 'z', tgt.roll);
      if (headPivot) headPivot.rotation.x += ((c.moving ? 0 : Math.sin(t * 0.7) * 0.03) - headPivot.rotation.x) * k;
      c.x = root.position.x * S;
      c.z = root.position.z * S;
      return;
    }

    // ── Priority 1: path walking ─────────────────────────────────────────
    // El grupo exterior está en [0,0,0] mientras camina (ver VoxelAvatar) y escalado 1.5: las coordenadas del
    // camino son del mundo, así que dentro de `root` se usan divididas entre S.
    if (path && path.length > 0 && !pathDoneRef.current) {
      const idx = waypointIndexRef.current;
      if (idx < path.length) {
        // Primer cuadro de un camino nuevo: arrancar desde donde está parado (el asiento o el sillón).
        if (!walkStartedRef.current) {
          walkStartedRef.current = true;
          root.position.set(startPos[0] / S, STAND_Y, startPos[2] / S);
        }
        const waypoint = path[idx];
        const dx = waypoint[0] / S - root.position.x;
        const dz = waypoint[2] / S - root.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.15 / S) {
          waypointIndexRef.current = idx + 1;
          if (waypointIndexRef.current >= path.length) {
            pathDoneRef.current = true;
            onPathComplete?.();
          }
        } else {
          const speed = 2.0 / S;
          const step = Math.min(speed * delta, dist);
          const moveX = (dx / dist) * step;
          const moveZ = (dz / dist) * step;
          let nx = root.position.x + moveX;
          let nz = root.position.z + moveZ;

          if (!isWalkableWorld(nx * S, nz * S)) {
            const slideX = isWalkableWorld((root.position.x + moveX) * S, root.position.z * S);
            const slideZ = isWalkableWorld(root.position.x * S, (root.position.z + moveZ) * S);
            if (slideX && !slideZ) { nx = root.position.x + moveX; nz = root.position.z; }
            else if (slideZ && !slideX) { nx = root.position.x; nz = root.position.z + moveZ; }
            else if (slideX && slideZ) {
              if (Math.abs(moveX) >= Math.abs(moveZ)) { nx = root.position.x + moveX; nz = root.position.z; }
              else { nx = root.position.x; nz = root.position.z + moveZ; }
            } else {
              waypointIndexRef.current = idx + 1;
              if (waypointIndexRef.current >= path.length) {
                pathDoneRef.current = true;
                onPathComplete?.();
              }
              return;
            }
          }

          const fb = getFloorBounds();
          nx = Math.max(fb.minX + 0.5, Math.min(fb.maxX - 0.5, nx * S)) / S;
          nz = Math.max(fb.minZ + 0.5, Math.min(fb.maxZ - 0.5, nz * S)) / S;

          walkPhase.current += delta * 2.2;
          const bob = Math.abs(Math.cos(walkPhase.current)) * 0.035;
          root.position.set(nx, STAND_Y + bob, nz);

          const targetAngle = Math.atan2(dx, dz);
          let angleDiff = targetAngle - root.rotation.y;
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          root.rotation.y = root.rotation.y + angleDiff * Math.min(1, delta * 8);
          root.rotation.x = -0.04;

          const s = Math.sin(walkPhase.current);
          hL.rotation.x = -s * 0.44; hR.rotation.x = s * 0.44;
          kL.rotation.x = Math.max(0, -s) * 0.34; kR.rotation.x = Math.max(0, s) * 0.34;
          sL.rotation.x = s * 0.36; sR.rotation.x = -s * 0.36;
          eL.rotation.x = Math.max(0, -s) * 0.18; eR.rotation.x = Math.max(0, s) * 0.18;
          if (headPivot) headPivot.rotation.x = 0;
        }
        return;
      }
    }

    // ── Priority 2b: standing pose (lobby, no chair) ──────────────────────
    if (standing) {
      root.position.set(0, STAND_Y, 0);
      root.rotation.set(0, 0, 0);
      const sway = Math.sin(t * 0.8) * 0.03;
      hL.rotation.x = 0; hR.rotation.x = 0;
      kL.rotation.x = 0; kR.rotation.x = 0;
      if (status === 'BUSY') {
        // Standing but working: checking phone / gesturing
        sR.rotation.x = -1.1; sR.rotation.z = -0.15;
        eR.rotation.x = -1.5 + Math.sin(t * 3) * 0.06;
        sL.rotation.x = Math.sin(t * 1.7) * 0.08;
        eL.rotation.x = -0.15;
        if (headPivot) headPivot.rotation.x = Math.sin(t * 1.9) * 0.045;
      } else {
        // Idle standing: subtle weight shift, arms relaxed
        sL.rotation.x = Math.sin(t * 0.9) * 0.03;
        sL.rotation.z = 0.06;
        sR.rotation.x = -Math.sin(t * 0.9) * 0.03;
        sR.rotation.z = -0.06;
        eL.rotation.x = -0.08; eR.rotation.x = -0.08;
        if (headPivot) headPivot.rotation.x = Math.sin(t * 0.7) * 0.03;
      }
      root.rotation.z = sway;
      return;
    }

    // ── Priority 2: seated typing or idle ─────────────────────────────────
    if (isSeated) {
      root.position.set(0, SEATED_Y_OFFSET, 0.5 - D.torsoD);
      root.rotation.set(0, 0, 0);
      hL.rotation.x = SIT.hipX; hR.rotation.x = SIT.hipX;
      kL.rotation.x = SIT.kneeX; kR.rotation.x = SIT.kneeX;

      if ((status === 'BUSY' || status === 'TALKING') && seated) {
        // Typing animation — but while talking, gesture instead (hands mid-air)
        if (isTalking) {
          // Idle gesture: hands half-raised, gentle synchronized sway
          sL.rotation.x = -0.9 + Math.sin(t * 2.6) * 0.1;
          sL.rotation.z = 0.35;
          sR.rotation.x = -0.9 + Math.sin(t * 2.6 + 0.8) * 0.1;
          sR.rotation.z = -0.35;
          eL.rotation.x = -1.2 + Math.sin(t * 3.1) * 0.12;
          eR.rotation.x = -1.2 + Math.sin(t * 3.1 + 1.1) * 0.12;
          root.position.y = SEATED_Y_OFFSET + Math.sin(t * 1.4) * 0.015;
          if (headPivot) headPivot.rotation.x = Math.sin(t * 1.3) * 0.06 - 0.04;
        } else {
          const typingShoulderX = -Math.PI / 4.2;
          const typingElbowBase = -Math.PI / 2.8;
          const typingOsc = 0.15;
          const typingSpeed = 10;
          sL.rotation.x = typingShoulderX + Math.sin(t * typingSpeed) * 0.04;
          sL.rotation.z = 0.22;
          sR.rotation.x = typingShoulderX + Math.sin(t * typingSpeed + Math.PI) * 0.04;
          sR.rotation.z = -0.22;
          eL.rotation.x = typingElbowBase + Math.sin(t * typingSpeed) * typingOsc;
          eR.rotation.x = typingElbowBase + Math.sin(t * typingSpeed + Math.PI) * typingOsc;
          root.position.y = SEATED_Y_OFFSET + Math.sin(t * 1.4) * 0.012;
          if (headPivot) headPivot.rotation.x = Math.sin(t * 4) * 0.025;
        }
      } else {
        sL.rotation.x = SIT.shoulderX; sL.rotation.z = 0;
        sR.rotation.x = SIT.shoulderX; sR.rotation.z = 0;
        eL.rotation.x = SIT.elbowX; eR.rotation.x = SIT.elbowX;
        if (headPivot) headPivot.rotation.x = 0;
        if (status === 'IDLE' || status === 'TALKING') {
          root.position.y = SEATED_Y_OFFSET + Math.sin(t * 1.4) * 0.012;
        }
      }
      return;
    }

    // ── Priority 3: BUSY (not seated) — walk circle ─────────────────────
    walkPhase.current += delta * 2.2;
    const s = Math.sin(walkPhase.current);
    const c = Math.cos(walkPhase.current);
    const cx = Math.sin(t * 0.9) * 0.55;
    const cz = Math.cos(t * 0.9) * 0.55 + 0.5;
    root.position.set(cx, STAND_Y + Math.abs(c) * 0.035, cz);
    root.rotation.set(-0.04, Math.atan2(Math.cos(t * 0.9), -Math.sin(t * 0.9)), 0);
    hL.rotation.x = -s * 0.44; hR.rotation.x = s * 0.44;
    kL.rotation.x = Math.max(0, -s) * 0.34; kR.rotation.x = Math.max(0, s) * 0.34;
    sL.rotation.x = s * 0.36; sR.rotation.x = -s * 0.36;
    eL.rotation.x = Math.max(0, -s) * 0.18; eR.rotation.x = Math.max(0, s) * 0.18;
    if (headPivot) headPivot.rotation.x = 0;
  });

  const isMaintenance = status === 'MAINTENANCE';
  const isError = status === 'ERROR';
  const isTransparent = isMaintenance;
  const effectiveOpacity = isMaintenance ? 0.4 : 1;
  const torsoTopY = D.torsoH;
  const torsoMeshY = D.torsoH / 2;
  const shoulderPivotY = D.torsoH - D.upperArmH * 0.1;

  return (
    <group
      ref={rootRef}
      position={standing ? [0, STAND_Y, 0] : [0, SEATED_Y_OFFSET, 0.5 - D.torsoD]}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={onSelect ? () => { document.body.style.cursor = 'pointer'; } : undefined}
      onPointerOut={onSelect ? () => { document.body.style.cursor = ''; } : undefined}
    >
      {/* ── Torso ── */}
      <mesh position={[0, torsoMeshY, 0]} castShadow>
        <boxGeometry args={[D.torsoW, D.torsoH, D.torsoD]} />
        <meshStandardMaterial
          color={isError ? '#ff2222' : palette.shirt}
          emissive={isError ? '#ff0000' : '#000000'}
          emissiveIntensity={isError ? 0.3 : 0}
          roughness={0.75}
          transparent={isMaintenance}
          opacity={effectiveOpacity}
        />
      </mesh>

      {/* ── Head pivot ── */}
      <group ref={headPivotRef} position={[0, torsoTopY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <HeadMesh faceUrl={faceUrl} skinColor={palette.skin} isMaintenance={isTransparent} headOpacity={effectiveOpacity} />
      </group>

      {/* ── Left shoulder ── */}
      <group ref={shoulderLRef} position={[-(D.torsoW / 2 + D.upperArmW / 2 + 0.01), shoulderPivotY, 0]}>
        <mesh position={[0, -D.upperArmH / 2, 0]} castShadow>
          <boxGeometry args={[D.upperArmW, D.upperArmH, D.upperArmD]} />
          <meshStandardMaterial color={palette.skin} roughness={0.7} transparent={isTransparent} opacity={effectiveOpacity} />
        </mesh>
        <group ref={elbowLRef} position={[0, -D.upperArmH, 0]}>
          <mesh position={[0, -D.lowerArmH / 2, 0]} castShadow>
            <boxGeometry args={[D.lowerArmW, D.lowerArmH, D.lowerArmD]} />
            <meshStandardMaterial color={palette.skin} roughness={0.7} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
          <mesh position={[0, -(D.lowerArmH + D.handH / 2), 0]} castShadow>
            <boxGeometry args={[D.handW, D.handH, D.handD]} />
            <meshStandardMaterial color={palette.skin} roughness={0.6} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
        </group>
      </group>

      {/* ── Right shoulder ── */}
      <group ref={shoulderRRef} position={[D.torsoW / 2 + D.upperArmW / 2 + 0.01, shoulderPivotY, 0]}>
        <mesh position={[0, -D.upperArmH / 2, 0]} castShadow>
          <boxGeometry args={[D.upperArmW, D.upperArmH, D.upperArmD]} />
          <meshStandardMaterial color={palette.skin} roughness={0.7} transparent={isTransparent} opacity={effectiveOpacity} />
        </mesh>
        <group ref={elbowRRef} position={[0, -D.upperArmH, 0]}>
          <mesh position={[0, -D.lowerArmH / 2, 0]} castShadow>
            <boxGeometry args={[D.lowerArmW, D.lowerArmH, D.lowerArmD]} />
            <meshStandardMaterial color={palette.skin} roughness={0.7} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
          <mesh position={[0, -(D.lowerArmH + D.handH / 2), 0]} castShadow>
            <boxGeometry args={[D.handW, D.handH, D.handD]} />
            <meshStandardMaterial color={palette.skin} roughness={0.6} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
        </group>
      </group>

      {/* ── Left hip ── */}
      <group ref={hipLRef} position={[-D.hipOffX, 0, 0]}>
        <mesh position={[0, -D.upperLegH / 2, 0]} castShadow>
          <boxGeometry args={[D.upperLegW, D.upperLegH, D.upperLegD]} />
          <meshStandardMaterial color={palette.pants} roughness={0.8} transparent={isTransparent} opacity={effectiveOpacity} />
        </mesh>
        <group ref={kneeLRef} position={[0, -D.upperLegH, 0]}>
          <mesh position={[0, -D.lowerLegH / 2, 0]} castShadow>
            <boxGeometry args={[D.lowerLegW, D.lowerLegH, D.lowerLegD]} />
            <meshStandardMaterial color={palette.pants} roughness={0.8} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
          <mesh position={[0, -(D.lowerLegH + D.footH / 2), D.footD * 0.15]} castShadow>
            <boxGeometry args={[D.footW, D.footH, D.footD]} />
            <meshStandardMaterial color={palette.shoes} roughness={0.9} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
        </group>
      </group>

      {/* ── Right hip ── */}
      <group ref={hipRRef} position={[D.hipOffX, 0, 0]}>
        <mesh position={[0, -D.upperLegH / 2, 0]} castShadow>
          <boxGeometry args={[D.upperLegW, D.upperLegH, D.upperLegD]} />
          <meshStandardMaterial color={palette.pants} roughness={0.8} transparent={isTransparent} opacity={effectiveOpacity} />
        </mesh>
        <group ref={kneeRRef} position={[0, -D.upperLegH, 0]}>
          <mesh position={[0, -D.lowerLegH / 2, 0]} castShadow>
            <boxGeometry args={[D.lowerLegW, D.lowerLegH, D.lowerLegD]} />
            <meshStandardMaterial color={palette.pants} roughness={0.8} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
          <mesh position={[0, -(D.lowerLegH + D.footH / 2), D.footD * 0.15]} castShadow>
            <boxGeometry args={[D.footW, D.footH, D.footD]} />
            <meshStandardMaterial color={palette.shoes} roughness={0.9} transparent={isTransparent} opacity={effectiveOpacity} />
          </mesh>
        </group>
      </group>

      {/* ── Name label (billboard) ── */}
      {name && (
        <Html position={[0, torsoTopY + D.headH + 0.35, 0]} center sprite style={{ pointerEvents: 'none' }}>
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
            style={{
              color: labelColor,
              background: 'linear-gradient(180deg, #faf6f0 0%, #ede6da 100%)',
              border: '1.5px solid #fff',
              borderRadius: '3px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.06)',
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{
                background: STATUS_DOT[status] ?? '#999999',
                boxShadow: status !== 'OFFLINE' ? `0 0 6px ${STATUS_DOT[status] ?? '#999999'}` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
                animation: status !== 'OFFLINE' ? 'voxel-dot-pulse 2s ease-in-out infinite' : undefined,
              }}
            />
            {name}
          </div>
        </Html>
      )}

      {/* ── Speech bubble (latest voice line) ── */}
      {bubble && (
        <Html position={[0, torsoTopY + D.headH + (name ? 0.75 : 0.55), 0]} center sprite style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: status === 'TALKING' ? 'rgba(34,204,68,0.92)' : 'rgba(250,246,240,0.95)',
              color: status === 'TALKING' ? '#fff' : '#333',
              fontSize: '9px',
              fontWeight: 600,
              fontFamily: 'system-ui, sans-serif',
              padding: '4px 8px',
              borderRadius: '8px',
              maxWidth: '180px',
              width: 'max-content',
              whiteSpace: 'normal',
              textAlign: 'center',
              lineHeight: 1.25,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              border: '1px solid rgba(0,0,0,0.08)',
              animation: 'voxel-bubble-in 0.25s ease-out',
            }}
          >
            {bubble}
          </div>
        </Html>
      )}

      {/* El estado se ve en el punto de la etiqueta del nombre (no hay esfera junto a la cabeza). */}
    </group>
  );
}

// ─── Head GLB ─────────────────────────────────────────────────────────────────

class HeadErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_err: Error, _info: ErrorInfo) { /* swallow */ }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function HeadMesh({ faceUrl, skinColor, isMaintenance, headOpacity }) {
  const fallback = <HeadFallback skinColor={skinColor} isMaintenance={isMaintenance} headOpacity={headOpacity} />;
  return (
    <HeadErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <HeadGLB url={faceUrl} isMaintenance={isMaintenance} headOpacity={headOpacity} />
      </Suspense>
    </HeadErrorBoundary>
  );
}

function HeadGLB({ url, isMaintenance, headOpacity }) {
  const { scene } = useGLTF(url);
  const effectiveOp = headOpacity ?? (isMaintenance ? 0.4 : 1);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    c.scale.setScalar(D.headH / maxDim);
    const box2 = new THREE.Box3().setFromObject(c);
    const centre = box2.getCenter(new THREE.Vector3());
    c.position.set(-centre.x, -box2.min.y, -centre.z);

    if (isMaintenance) {
      c.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const mat = (mesh.material as THREE.Material).clone();
          (mat as THREE.MeshStandardMaterial).transparent = true;
          (mat as THREE.MeshStandardMaterial).opacity = effectiveOp;
          mesh.material = mat;
        }
      });
    }
    return c;
  }, [scene, isMaintenance, effectiveOp]);

  return <primitive object={cloned} castShadow />;
}

function HeadFallback({ skinColor, isMaintenance, headOpacity }) {
  const op = headOpacity ?? (isMaintenance ? 0.4 : 1);
  return (
    <mesh castShadow>
      <boxGeometry args={[D.headW, D.headH, D.headD]} />
      <meshStandardMaterial color={skinColor} roughness={0.6} transparent={isMaintenance || op < 1} opacity={op} />
    </mesh>
  );
}