/**
 * Real NASA research from the Open Science Data Repository (OSDR), archived
 * in ./osdr-archive.json by tools/fetch-osdr.mjs, and what each study has to
 * do with this game. Shown on the MISSION DATA tab and in the debrief.
 */
import archive from './osdr-archive.json'

export interface OsdrStudy {
  accession: string
  title: string
  description: string
  organism: string | null
  projectType: string | null
  flightProgram: string | null
  url: string
}

/** What part of the game a study speaks to. */
export type OsdrTopic = 'dose' | 'health' | 'greenhouse'

/** Why each study is in the game, in a child's words. */
const LINKS: Record<string, { topic: OsdrTopic; why: string }> = {
  'OSD-53': { topic: 'health', why: 'Scientists compared astronauts’ blood before and after flying, and found that spaceflight changes how the body handles stress. That’s why the crew’s health faces matter.' },
  'OSD-569': { topic: 'health', why: 'The Inspiration4 crew gave blood samples before, during and after their flight, so scientists could see how a few days in space change the body.' },
  'OSD-992': { topic: 'dose', why: 'Scientists studied how space radiation changes human cells. It’s one reason NASA keeps a strict limit on every astronaut’s radiation dose.' },
  'OSD-412': { topic: 'greenhouse', why: 'Astronauts grew several leafy greens together in Veggie on the space station, and scientists checked the tiny living things on them to keep fresh food safe to eat.' },
  'OSD-772': { topic: 'greenhouse', why: 'Chile peppers were grown on the space station: one of the longest and hardest crops astronauts have tried.' },
}

export const OSDR = {
  source: archive.source,
  sourceUrl: archive.sourceUrl,
  retrieved: archive.retrieved,
  studies: archive.studies as OsdrStudy[],
}

export interface LinkedStudy extends OsdrStudy {
  topic: OsdrTopic
  why: string
}

/** The archived studies with their link to the game, optionally only some topics. */
export function linkedStudies(topics?: readonly OsdrTopic[]): LinkedStudy[] {
  return OSDR.studies.flatMap((study) => {
    const link = LINKS[study.accession]
    if (!link || (topics && !topics.includes(link.topic))) return []
    return [{ ...study, ...link }]
  })
}
