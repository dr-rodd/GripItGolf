import CreateFlow from './CreateFlow'

/**
 * Static on purpose.
 *
 * The platform course list used to be fetched here, which made the route
 * dynamic — and a dynamic route cannot be prefetched whole, so every arrival
 * was a server round trip plus a database query, showing as a gap after the
 * mark has already landed in the header.
 *
 * The forms fetch their own courses now. They are not needed until each
 * wizard's venue step, which is a screen and several keystrokes away, so
 * they load while the trip is being named and this page is a fixed shell
 * the browser already holds. CreateFlow decides which form: the trip
 * wizard, or — through the tournament door — league or match play first.
 */
export default function CreateTripPage() {
  return <CreateFlow />
}
