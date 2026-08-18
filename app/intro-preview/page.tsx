// Throwaway preview harness for SiteIntro — not committed.
import SiteIntro from '@/app/components/SiteIntro'
import TabBar from '@/app/components/TabBar'
import TripHeader from '@/app/components/TripHeader'

export default function Page() {
  return (
    <main className="min-h-dvh bg-cream has-tabbar">
      <TripHeader backTo="/" />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <h1 className="t-h1 text-ink text-center pt-2">North West 26</h1>
        <p className="t-body mt-4">A stand-in page behind the intro, with the real header and the real tab bar. Some more body text so the blur has something to soften.</p>
      </div>
      <TabBar tripCode="PREVIEW" />
      <SiteIntro tripName="North West 26" />
    </main>
  )
}
