import JoinForm from './JoinForm'

/**
 * Static on purpose.
 *
 * Reading `?code=` here would make the route dynamic, and a dynamic route
 * cannot be prefetched whole — every arrival is then a server round trip,
 * which coming in from the landing page is a visible gap after the mark has
 * already landed. The form reads the code off the URL itself instead, so
 * this page is a fixed shell the browser is holding before it is asked for.
 */
export default function JoinPage() {
  return <JoinForm />
}
