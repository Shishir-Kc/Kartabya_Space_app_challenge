import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { Astronaut, loadAstronaut } from '../character/astronaut'
import type { OutfitId } from '../character/outfits'
import type { AstronautProfile } from '../state/astronaut'
import { reducedMotion } from '../state/settings'

/** Turns slowly, playing the idle animation. */
function Turntable({ profile, outfit, onReady }: { profile: AstronautProfile; outfit: OutfitId; onReady: (ready: boolean) => void }) {
  const group = useRef<Group>(null)
  const body = useRef<Astronaut | null>(null)
  const latest = useRef({ profile, outfit })
  latest.current = { profile, outfit }

  useEffect(() => {
    let cancelled = false
    let created: Astronaut | null = null
    onReady(false)
    loadAstronaut(profile.variant)
      .then((gltf) => {
        if (cancelled || !group.current) return
        const now = latest.current
        created = new Astronaut(gltf, { name: now.profile.name, outfit: now.outfit, look: now.profile })
        group.current.add(created.root)
        body.current = created
        onReady(true)
      })
      .catch(() => onReady(false))
    return () => {
      cancelled = true
      created?.dispose()
      body.current = null
    }
    // The name and the look are applied by the effect below, so they don't reload the body.
  }, [profile.variant])

  useEffect(() => {
    body.current?.setName(profile.name)
    body.current?.applyLook(profile)
    body.current?.setOutfit(outfit)
  }, [profile, outfit])

  useFrame((_, delta) => {
    if (group.current && !reducedMotion()) group.current.rotation.y += delta * 0.45
    body.current?.update(delta, 0)
  })

  // Start facing the camera (the body faces its local -z).
  return <group ref={group} rotation-y={Math.PI} />
}

/** A small 3D view of an astronaut, on a transparent background over a glass card (the pause menu). */
export function AstronautPreview({ profile, outfit = 'flight' }: { profile: AstronautProfile; outfit?: OutfitId }) {
  const [ready, setReady] = useState(false)
  return (
    <div className="preview">
      <Canvas
        className="preview__canvas"
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 1.05, 3.5], fov: 32 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.92, 0)}
      >
        <hemisphereLight args={['#dfe6f5', '#3a3f4a', 2.2]} />
        <directionalLight position={[2, 4, 3]} intensity={2.4} />
        <directionalLight position={[-3, 2, -2]} intensity={1} color="#8fb4ff" />
        <Turntable profile={profile} outfit={outfit} onReady={setReady} />
        <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
          <circleGeometry args={[0.65, 48]} />
          <meshBasicMaterial color="#ff8a2a" transparent opacity={0.16} />
        </mesh>
      </Canvas>
      {!ready && <p className="preview__loading">Loading astronaut…</p>}
    </div>
  )
}
