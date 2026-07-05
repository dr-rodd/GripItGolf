'use client'

import { useEffect, useState } from 'react'

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export default function TripCountdown({
  target,
  children,
}: {
  target: string | null  // ISO date string (YYYY-MM-DD or full ISO); null = skip countdown
  children: React.ReactNode
}) {
  const [mounted, setMounted]     = useState(false)
  const [timeLeft, setTimeLeft]   = useState<TimeLeft | null>(null)
  const [timerGone, setTimerGone] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!target) {
      setTimerGone(true)
      return
    }
    const targetDate = new Date(target)
    const initial = getTimeLeft(targetDate)
    if (!initial) {
      // Already in the past — skip straight to nav
      setTimerGone(true)
      return
    }
    setTimeLeft(initial)
    const id = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000)
    return () => clearInterval(id)
  }, [target])

  // When ticker hits zero, animate collapse then remove from DOM
  useEffect(() => {
    if (!mounted || timerGone || timeLeft !== null) return
    const t = setTimeout(() => setTimerGone(true), 700)
    return () => clearTimeout(t)
  }, [timeLeft, mounted, timerGone])

  const collapsing = mounted && !timeLeft && !timerGone

  return (
    <div className="flex flex-col items-center w-full">

      {/* Collapsible timer block — uses grid-rows trick to avoid iOS transform bug */}
      {!timerGone && (
        <div
          className="grid w-full"
          style={{
            gridTemplateRows: collapsing ? '0fr' : '1fr',
            transition: 'grid-template-rows 700ms ease-in-out',
          }}
        >
          <div className="overflow-hidden flex flex-col items-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-px w-16 bg-[#C9A84C]/40" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/60" />
              <div className="h-px w-16 bg-[#C9A84C]/40" />
            </div>

            {/* Placeholder preserves height before hydration to prevent layout shift */}
            {!mounted ? (
              <div className="h-[84px]" />
            ) : timeLeft ? (
              <div className="flex gap-5 sm:gap-8 bg-white/5 px-5 py-4 rounded-sm">
                {[
                  { label: 'Days',    value: timeLeft.days },
                  { label: 'Hours',   value: timeLeft.hours },
                  { label: 'Minutes', value: timeLeft.minutes },
                  { label: 'Seconds', value: timeLeft.seconds },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5">
                    <span
                      className="font-[family-name:var(--font-playfair)] text-4xl sm:text-5xl font-bold tabular-nums"
                      style={{ color: '#C9A84C', textShadow: '0 0 30px rgba(201,168,76,0.4), 0 2px 4px rgba(0,0,0,0.8)' }}
                    >
                      {String(value).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] tracking-[0.25em] uppercase text-white/50 font-light">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-2" />
          </div>
        </div>
      )}

      {/* Divider always present — nav slides up naturally as timer collapses */}
      <div className="flex items-center gap-4 mb-4">
        <div className="h-px w-16 bg-[#C9A84C]/40" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/60" />
        <div className="h-px w-16 bg-[#C9A84C]/40" />
      </div>

      {children}
    </div>
  )
}
