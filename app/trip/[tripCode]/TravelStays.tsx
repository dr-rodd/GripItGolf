import {
  type ItineraryItem, describeDay, dateForDay,
} from '@/lib/itinerary'
import {
  stayRuns, travelLegs, describeStayRun, describeLeg,
} from '@/lib/stays'
import { mapsUrl } from '@/lib/places'
import { itineraryIcon, IconMapPin } from '@/app/components/icons'

/**
 * Where the group sleeps, and how it gets about.
 *
 * These are the two things on the itinerary that were pure text and read
 * like it — a guesthouse and a four-hour drive rendered in the same grey
 * caption as everything else, distinguishable only by reading them.
 *
 * So: icon-led and centred, the way a course is presented. The icon carries
 * more weight than the guide's defaults would normally allow for a list
 * item, which is the deliberate exception this section is granted — it is
 * what makes the section scannable rather than readable.
 *
 * A four-night stay is four rows in the database, one per night, because the
 * running order needs somewhere to sleep on every day of it. Here they are
 * folded back into the one booking the organiser made — see `lib/stays.ts`.
 * The itinerary section above still lists every night.
 *
 * Every place gets a maps link. No phone or address detection: these fields
 * hold names, and a maps *search* takes a name perfectly well, so there is
 * nothing to detect and nothing that can fail into a dead link.
 */

/**
 * Both icons come from `itineraryIcon`, which is also what the running order
 * above draws from. They were two lists: this one picked the car, the plane
 * or the train off the journey's mode and that one drew every journey as an
 * arrow, so the same flight was two different icons on one screen.
 */
const StayIcon = itineraryIcon('stay')

/** The place, and a tap that opens it in maps. Plain text when it is blank. */
function Place({ name }: { name: string }) {
  const href = mapsUrl(name)
  if (!href) return <span className="t-card text-ink">{name}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 t-card text-ink hover:text-accent-deep transition-colors duration-150"
    >
      {name}
      <span className="text-accent-deep flex-shrink-0">
        <IconMapPin size={14} />
      </span>
    </a>
  )
}

export default function TravelStays({
  items,
  startDate,
}: {
  items: ItineraryItem[]
  startDate: string | null
}) {
  const stays = stayRuns(items)
  const legs = travelLegs(items)

  if (stays.length === 0 && legs.length === 0) {
    return (
      <p className="t-cap text-ink/65 text-center py-2 leading-relaxed">
        No travel or accommodation on the itinerary yet. Go to Trip Settings
        to add your plans.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-7">

      {stays.length > 0 && (
        <div className="flex flex-col gap-5">
          <p className="t-cap uppercase tracking-[0.18em] text-ink/50 text-center">
            Staying
          </p>
          {stays.map(run => (
            <div key={`${run.name}-${run.fromDay}`} className="flex flex-col items-center text-center gap-2">
              <span className="w-11 h-11 rounded-xl bg-bark/[0.06] text-bark flex items-center justify-center">
                <StayIcon size={22} />
              </span>
              <Place name={run.name} />
              <p className="t-cap text-ink/65">{describeStayRun(run, startDate)}</p>
            </div>
          ))}
        </div>
      )}

      {legs.length > 0 && (
        <div className="flex flex-col gap-5">
          <p className="t-cap uppercase tracking-[0.18em] text-ink/50 text-center">
            Getting there
          </p>
          {legs.map(leg => {
            const Icon = itineraryIcon('travel', leg.mode)
            const day = describeDay(dateForDay(startDate, leg.dayIndex), leg.dayIndex)
            return (
              <div key={leg.id} className="flex flex-col items-center text-center gap-2">
                <span className="w-11 h-11 rounded-xl bg-bark/[0.06] text-bark flex items-center justify-center">
                  <Icon size={22} />
                </span>
                {/* The destination is the part worth a map. Where you are
                    leaving from is where you already are. */}
                {leg.to ? <Place name={leg.to} /> : <span className="t-card text-ink">{describeLeg(leg)}</span>}
                {leg.to && leg.from && (
                  <p className="t-cap text-ink/65">from {leg.from}</p>
                )}
                <p className="t-cap text-ink/65">
                  {[day, leg.duration].filter(Boolean).join(' · ')}
                </p>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
