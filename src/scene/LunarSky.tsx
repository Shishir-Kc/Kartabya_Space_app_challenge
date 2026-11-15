import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, type Group, type PointsMaterial, ShaderMaterial, SphereGeometry, SpriteMaterial, type Texture } from 'three'
import type { LunarExterior } from '../maps/types'
import { bearingVector } from './kit/lunar'
import { bodyVertex, earthFragment, glowTexture, haloFragment, loadTexture, makeStars } from './Space'
import { Color } from 'three'

/** How far away the Sun and Earth are drawn. */
const DISTANCE = 600
/**
 * Earth's size in the lunar sky, as an angle from its centre to its edge.
 * The real value is about 1 degree; it is drawn a little bigger so it reads
 * on screen.
 */
const EARTH_RADIUS_DEGREES = 1.8

/**
 * The sky over the lunar south pole: black, with a few faint stars (the
 * bright ground washes most out), the Sun's glare just above the horizon,
 * and Earth hanging low, lit from the side, using the same NASA Blue Marble
 * map as the spacecraft's view.
 */
export function LunarSky({ exterior }: { exterior: LunarExterior }) {
  const group = useRef<Group>(null)
  const [earthMap, setEarthMap] = useState<Texture | null>(null)
  const sun = useMemo(() => bearingVector(exterior.sun.bearing, exterior.sun.elevation), [exterior])
  const earth = useMemo(() => bearingVector(exterior.earth.bearing, exterior.earth.elevation), [exterior])

  const resources = useMemo(() => {
    const sphere = new SphereGeometry(1, 64, 32)
    const earthMaterial = new ShaderMaterial({
      vertexShader: bodyVertex,
      fragmentShader: earthFragment,
      fog: false,
      uniforms: {
        uMap: { value: null },
        uSun: { value: sun },
        uHaze: { value: new Color(0, 0, 0) },
        uClarity: { value: 1 },
        uReady: { value: 0 },
      },
    })
    const haloMaterial = new ShaderMaterial({
      vertexShader: bodyVertex,
      fragmentShader: haloFragment,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      uniforms: { uSun: { value: sun }, uStrength: { value: 1 } },
    })
    const glare = new SpriteMaterial({ map: glowTexture(), color: '#fffaf0', blending: AdditiveBlending, depthWrite: false, fog: false })
    const stars = makeStars(exterior.stars, 0.45)
    return { sphere, earthMaterial, haloMaterial, glare, stars }
  }, [exterior, sun])

  useEffect(() => {
    let cancelled = false
    let loaded: Texture | null = null
    loadTexture('earth-blue-marble.webp')
      .then((texture) => {
        loaded = texture
        if (cancelled) texture.dispose()
        else setEarthMap(texture)
      })
      .catch((error: unknown) => console.error('Could not load the Earth map', error))
    return () => {
      cancelled = true
      loaded?.dispose()
    }
  }, [])

  useEffect(() => {
    if (!earthMap) return
    resources.earthMaterial.uniforms.uMap!.value = earthMap
    resources.earthMaterial.uniforms.uReady!.value = 1
  }, [earthMap, resources])

  useEffect(
    () => () => {
      resources.sphere.dispose()
      resources.earthMaterial.dispose()
      resources.haloMaterial.dispose()
      resources.glare.map?.dispose()
      resources.glare.dispose()
      resources.stars.geometry.dispose()
      ;(resources.stars.material as PointsMaterial).dispose()
    },
    [resources],
  )

  // Infinitely far: everything rides along with the camera.
  useFrame(({ camera }) => group.current?.position.copy(camera.position))

  const radius = DISTANCE * Math.sin((EARTH_RADIUS_DEGREES * Math.PI) / 180)
  return (
    <group ref={group}>
      <primitive object={resources.stars} />
      <sprite material={resources.glare} position={sun.clone().multiplyScalar(DISTANCE)} scale={[70, 70, 1]} renderOrder={-1} />
      <mesh geometry={resources.sphere} material={resources.earthMaterial} position={earth.clone().multiplyScalar(DISTANCE)} scale={radius} rotation={[0.3, 2.6, 0.2]} />
      <mesh geometry={resources.sphere} material={resources.haloMaterial} position={earth.clone().multiplyScalar(DISTANCE)} scale={radius * 1.03} renderOrder={1} />
    </group>
  )
}
