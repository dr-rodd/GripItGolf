import Link from "next/link"
import SettingsClient from "./SettingsClient"
import BackButton from "@/app/components/BackButton"

export default function SettingsPage() {
  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="border-b border-[#1e3d28]">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href="/" />
          <h1 className="font-[family-name:var(--font-playfair)] text-xl sm:text-2xl text-white tracking-wide">
            The Donegal Masters
          </h1>
          <span className="text-white/30 text-xs tracking-widest uppercase hidden sm:block">2026</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-white mb-2">Settings</h2>
        <p className="text-white/30 text-sm mb-8 tracking-wide">Administrative actions — password required.</p>
        <SettingsClient />
      </div>
    </div>
  )
}
