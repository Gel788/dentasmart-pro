'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { JawStage } from '@/lib/jaw';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export function JawScene({ stages, progress }: { stages: JawStage[]; progress: number }) {
  return (
    <Canvas camera={{ position: [0, 1.15, 4.35], fov: 38 }} dpr={[1, 1.6]}>
      <color attach="background" args={['#10211c']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]} intensity={1.35} />
      <pointLight position={[-2, 1.2, 2]} intensity={0.45} color="#99f6e4" />
      <Arch stages={stages} progress={progress} />
      <ContactShadows position={[0, -0.85, 0]} opacity={0.35} scale={8} blur={2.4} far={3} />
      <OrbitControls enablePan={false} minDistance={2.6} maxDistance={7} autoRotate autoRotateSpeed={0.55} />
    </Canvas>
  );
}

function Arch({ stages, progress }: { stages: JawStage[]; progress: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.08;
  });
  return (
    <group ref={group} position={[0, 0.05, 0]}>
      <Gum y={0.28} />
      <Gum y={-0.28} />
      {UPPER.map((tooth, index) => (
        <Tooth key={tooth} tooth={tooth} index={index} count={UPPER.length} y={0.34} stages={stages} progress={progress} />
      ))}
      {LOWER.map((tooth, index) => (
        <Tooth key={tooth} tooth={tooth} index={index} count={LOWER.length} y={-0.34} stages={stages} progress={progress} />
      ))}
    </group>
  );
}

function Gum({ y }: { y: number }) {
  const geom = useMemo(() => {
    const points = Array.from({ length: 18 }, (_, index) => {
      const [x, , z] = place(index, 18);
      return new THREE.Vector3(x * 1.02, y, z * 1.02 - 0.05);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.13, 8, false);
  }, [y]);
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial color={y > 0 ? '#f0b7b3' : '#e7a8a4'} roughness={0.82} />
    </mesh>
  );
}

function Tooth({
  tooth,
  index,
  count,
  y,
  stages,
  progress,
}: {
  tooth: number;
  index: number;
  count: number;
  y: number;
  stages: JawStage[];
  progress: number;
}) {
  const [x, , z] = place(index, count);
  const angle = archAngle(index, count);
  const look = stages
    .map((stage, order) => ({ stage, order }))
    .filter((row) => row.stage.tooth === tooth && row.order < progress && row.stage.kind !== 'other');
  const done = look.at(-1)?.stage.kind ?? null;
  const pending = stages.some((stage) => stage.tooth === tooth && stage.kind !== 'other');
  const implantLater = stages.some((stage, order) => stage.tooth === tooth && stage.kind === 'implant' && order >= progress);
  const missing = done == null && implantLater;
  const size = scaleFor(tooth);
  if (missing) {
    return (
      <mesh position={[x, y, z]} rotation={[0, angle, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.05, 16]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.9} />
      </mesh>
    );
  }
  const color = done === 'crown' || done === 'implant' ? '#e7c56a' : done === 'filling' ? '#3b82f6' : pending ? '#fb7185' : '#f6f1e8';
  const metal = done === 'crown' || done === 'implant' ? 0.55 : 0.05;
  return (
    <group position={[x, y, z]} rotation={[0, angle, 0]}>
      <mesh position={[0, done === 'implant' ? 0.08 : 0, 0]} castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} metalness={metal} roughness={done === 'crown' || done === 'implant' ? 0.28 : 0.45} />
      </mesh>
      {done === 'implant' && (
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.26, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </mesh>
      )}
    </group>
  );
}

function place(index: number, count: number): [number, number, number] {
  const angle = archAngle(index, count);
  return [Math.cos(angle) * 2.15, 0, Math.sin(angle) * 1.28];
}

function archAngle(index: number, count: number) {
  const t = count <= 1 ? 0.5 : index / (count - 1);
  return Math.PI * (0.1 + 0.8 * t);
}

function scaleFor(tooth: number): [number, number, number] {
  const pos = tooth % 10;
  if (pos <= 2) return [0.16, 0.3, 0.14];
  if (pos === 3) return [0.18, 0.36, 0.18];
  if (pos <= 5) return [0.2, 0.28, 0.2];
  return [0.26, 0.24, 0.24];
}
