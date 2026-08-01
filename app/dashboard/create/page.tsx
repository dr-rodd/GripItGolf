import CreateTripForm from './CreateTripForm'

/**
 * Static on purpose.
 *
 * The platform course list used to be fetched here, which made the route
 * dynamic — and a dynamic route cannot be prefetched whole, so every arrival
 * was a server round trip plus a database query, showing as a gap after the
 * mark has already landed in the header.
 *
 * The form fetches its own courses now. They are not needed until step two,
 * which is a screen and several keystrokes away, so they load while the trip
 * is being named and this page is a fixed shell the browser already holds.
 */
export default function CreateTripPage() {
  return <CreateTripForm />
}
