import { useEffect } from 'react'
import { useGame } from '../state/store'
import './grade.css'

/**
 * A light colour grade per place and a subtle vignette, done by the page
 * rather than a post-processing pass, so it costs Medium nothing: warm dusk
 * at the launch center, cool white in the spacecraft, harsh contrast on the
 * Moon's surface, neutral indoors at the outpost.
 */
export function SceneGrade() {
  const mapId = useGame((s) => s.mapId)
  const outdoors = useGame((s) => s.outdoors)
  const grade = mapId === 'launch-center' ? (outdoors ? 'dusk' : 'warm-indoor') : mapId === 'spacecraft' ? 'cool' : mapId === 'outpost' ? (outdoors ? 'moon' : 'outpost') : 'none'
  useEffect(() => {
    document.documentElement.dataset.grade = grade
    return () => {
      delete document.documentElement.dataset.grade
    }
  }, [grade])
  return <div className="scene-grade" data-grade={grade} aria-hidden="true" />
}
