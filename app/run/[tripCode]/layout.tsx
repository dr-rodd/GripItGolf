import TabBar from '@/app/components/TabBar'

/**
 * Everything under `/run/[tripCode]`, with the bottom bar around it — the
 * same bar golf draws, with running's five tabs (app/components/runTabs.ts).
 *
 * Drawn here, once, and never by a page, for the reason golf's trip layout
 * gives: a bar rendered by a page unmounts with it, so every tab press would
 * tear it off the screen. Pages carry `has-tabbar` so the last of their
 * content clears it.
 *
 * Fetches nothing. The pages already know whether this is a run challenge
 * and send golf trips home to `/trip/`; the bar needs only the code.
 */
export default async function RunLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params
  return (
    <>
      {children}
      <TabBar tripCode={tripCode} sport="run" />
    </>
  )
}
