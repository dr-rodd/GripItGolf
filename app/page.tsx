import Link from "next/link";
import Countdown from "./components/Countdown";
import SettingsButton from "./components/SettingsButton";

export default function Home() {
  return (
    <main
      className="relative min-h-dvh flex flex-col items-center justify-center pt-5 pb-5"
      style={{
        backgroundImage: "url(/rosapenna.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center 30%",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/55 pointer-events-none" />

      <SettingsButton />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center w-full">

        {/* Est. ornament */}
        <div className="flex items-center gap-4 mb-4">
          <div className="h-px w-14 bg-gold opacity-70" />
          <span className="text-gold text-xs tracking-[0.3em] uppercase">Est. 2023</span>
          <div className="h-px w-14 bg-gold opacity-70" />
        </div>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Retro_donegal_masters_logo.png"
          alt="The Donegal Masters"
          style={{ width: "95vw", maxWidth: "360px", marginLeft: "auto", marginRight: "auto", height: "auto", display: "block", filter: "brightness(0) saturate(100%) invert(74%) sepia(27%) saturate(739%) hue-rotate(5deg) brightness(95%) contrast(95%)" }}
        />

        {/* Subtitle */}
        <p className="text-white/80 text-sm sm:text-lg tracking-[0.3em] uppercase mb-0 [text-shadow:0_2px_12px_rgba(0,0,0,0.9)]">
          16 – 18 April 2026
        </p>
        <p className="text-white/60 text-xs tracking-[0.2em] uppercase mb-3 [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
          Rosapenna Hotel &amp; Golf Resort, Co. Donegal
        </p>

        {/* Countdown collapses when expired; nav always in DOM below it */}
        <Countdown>
          <nav className="flex flex-col gap-3">
            <Link
              href="/teams"
              className="w-[312px] text-center py-[18px] border-2 border-white/70 text-white text-sm tracking-[0.25em] uppercase rounded-xl hover:border-gold hover:text-gold transition-colors duration-300 opacity-80"
            >
              Team Selection
            </Link>
            <Link
              href="/tee-times"
              className="w-[312px] text-center py-[18px] border-2 border-white/70 text-white text-sm tracking-[0.25em] uppercase rounded-xl hover:border-gold hover:text-gold transition-colors duration-300 opacity-80"
            >
              Tee Times
            </Link>
            <Link
              href="/scoring"
              className="w-[312px] text-center py-[18px] border-2 border-white/70 text-white text-sm tracking-[0.25em] uppercase rounded-xl hover:border-gold hover:text-gold transition-colors duration-300 opacity-80"
            >
              Scoring
            </Link>
            <Link
              href="/leaderboard"
              className="w-[312px] text-center py-[18px] border-2 border-white/70 text-white text-sm tracking-[0.25em] uppercase rounded-xl hover:border-gold hover:text-gold transition-colors duration-300 opacity-80"
            >
              Leaderboard
            </Link>
          </nav>
        </Countdown>

      </div>
    </main>
  );
}
