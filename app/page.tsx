import Landing from "./Landing"

/**
 * The entry screen.
 *
 * All of it is interactive — the mark collapses into the header when you tap
 * your way off the page — so the screen itself lives in Landing.tsx and this
 * is only the route.
 */
export default function Home() {
  return <Landing />
}
