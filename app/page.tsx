import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6">

      {/* Logo mark */}
      <div className="mb-6 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
        <div className="w-3 h-3 rounded-full bg-[#C9A84C]" />
        <div className="w-3 h-3 rounded-full border-2 border-[#C9A84C]" />
      </div>

      {/* Heading */}
      <h1 className="font-[family-name:var(--font-playfair)] text-5xl sm:text-6xl text-white text-center leading-tight mb-4">
        GripItGolf
      </h1>

      {/* Tagline */}
      <p className="text-white/50 text-sm sm:text-base tracking-wide text-center max-w-xs mb-12">
        Your golf trip. Live scores, leaderboards, and bragging rights.
      </p>

      {/* CTA buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/dashboard/create"
          className="w-full text-center py-5 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors"
        >
          Create a Trip
        </Link>
        <Link
          href="/join"
          className="w-full text-center py-5 border-2 border-white/20 text-white text-sm tracking-[0.2em] uppercase rounded-xl hover:border-white/50 transition-colors"
        >
          Join a Trip
        </Link>
      </div>

    </main>
  )
}
