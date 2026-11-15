import { CREDIT_GROUPS } from '../../data/credits'
import { describeStorm, DONKI, formatDonkiDate } from '../../data/donki'
import { linkedStudies, OSDR } from '../../data/osdr'
import { REFERENCES } from '../../data/sources'
import { LiveSpaceWeather } from '../LiveSpaceWeather'

const short = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/**
 * For judges and teachers: "where these numbers come from". The real Sun
 * right now (live), the real storms the game draws from (archived), every
 * reference behind the choices with what it says, real NASA research from
 * OSDR, and the free assets, each named and credited. Read from
 * src/data/sources.json, osdr-archive.json, donki-archive.json and credits.ts.
 */
export function MissionDataTab() {
  return (
    <div className="data">
      <p className="panel__lead">
        Every choice in this game stands for a real trade-off that NASA mission planners face. Here is where each one comes from.
      </p>

      <section className="group" aria-labelledby="data-live">
        <h3 id="data-live" className="group__title">
          The Sun right now
        </h3>
        <p className="group__note">Live from NASA. If it can’t be reached, the game still plays with real archived storms.</p>
        <LiveSpaceWeather />
      </section>

      <section className="group" aria-labelledby="data-storms">
        <h3 id="data-storms" className="group__title">
          Real solar storms in the game
        </h3>
        <p className="group__note">
          Each mission draws one of these real events from NASA DONKI for its solar storm. Archived data, retrieved {formatDonkiDate(DONKI.retrieved)}; it is not live.
        </p>
        <ul className="credits">
          {DONKI.events.map((event) => (
            <li key={event.id} className="credit">
              <p className="credit__use">{describeStorm(event)}</p>
              {event.link && (
                <a className="credit__link" href={event.link} target="_blank" rel="noopener noreferrer">
                  {short(event.link)}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="group" aria-labelledby="data-refs">
        <h3 id="data-refs" className="group__title">
          Where the numbers come from
        </h3>
        <p className="group__note">
          The meters are game units, but every trade-off is backed by these documents. Radiation dose is shown in real millisieverts (mSv).
        </p>
        <ul className="credits">
          {REFERENCES.map((ref) => (
            <li key={ref.id} className="credit">
              <div className="credit__head">
                <h4 className="credit__title">{ref.title}</h4>
              </div>
              <p className="credit__source">{ref.publisher}</p>
              <p className="credit__use">{ref.fact}</p>
              <a className="credit__link" href={ref.url} target="_blank" rel="noopener noreferrer">
                {short(ref.url)}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="group" aria-labelledby="data-osdr">
        <h3 id="data-osdr" className="group__title">
          Real NASA research on astronaut health and food
        </h3>
        <p className="group__note">
          Studies from the {OSDR.source}, archived {formatDonkiDate(OSDR.retrieved)}.
        </p>
        <ul className="credits">
          {linkedStudies().map((study) => (
            <li key={study.accession} className="credit">
              <div className="credit__head">
                <h4 className="credit__title">
                  {study.accession}: {study.title}
                </h4>
              </div>
              <p className="credit__use">{study.why}</p>
              <a className="credit__link" href={study.url} target="_blank" rel="noopener noreferrer">
                {short(study.url)}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {CREDIT_GROUPS.map((group) => (
        <section key={group.id} className="group" aria-labelledby={`data-${group.id}`}>
          <h3 id={`data-${group.id}`} className="group__title">
            {group.title}
          </h3>
          <p className="group__note">{group.note}</p>
          <ul className="credits">
            {group.credits.map((credit) => (
              <li key={credit.id} className="credit" data-soon={credit.comingSoon ? 'true' : undefined}>
                <div className="credit__head">
                  <h4 className="credit__title">{credit.title}</h4>
                  {credit.comingSoon && <span className="credit__badge">Coming soon</span>}
                </div>
                <p className="credit__source">{credit.source}</p>
                <p className="credit__use">{credit.usedFor}</p>
                <p className="credit__by">Credit: {credit.credit}</p>
                <a className="credit__link" href={credit.url} target="_blank" rel="noopener noreferrer">
                  {short(credit.url)}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
