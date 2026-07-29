import Link from "next/link"
import GreenDot from "@/app/components/GreenDot"

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a1a0e] px-6 py-16">

      {/* Wordmark. "Green Dot" leads and "Golf" sits beneath it, so the dot
          below lands in the middle of the mark rather than trailing off it. */}
      <h1 className="text-center leading-[0.92] mb-6">
        <span className="block font-[family-name:var(--font-playfair)] text-white font-bold tracking-tight text-[clamp(2.75rem,15vw,4.75rem)]">
          Green Dot
        </span>
        <span className="block font-[family-name:var(--font-playfair)] text-white/85 font-bold tracking-[0.22em] text-[clamp(1.5rem,8vw,2.5rem)] mt-1">
          Golf
        </span>
      </h1>

      {/* The mark itself, centred beneath the lettering */}
      <GreenDot size={22} label="Green dot" />

      {/* What a green dot actually means */}
      <p className="text-white/45 text-sm sm:text-base leading-relaxed text-center max-w-[19rem] mt-7">
        Your handicap is the best 8 of your last 20.
      </p>
      <p className="text-emerald-300/70 text-sm sm:text-base leading-relaxed text-center max-w-[19rem] mt-1.5 mb-12">
        Those eight are green dots. Go and get one.
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
