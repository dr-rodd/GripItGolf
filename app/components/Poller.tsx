"use client"

import { useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

export default function Poller({ isActive = false }: { isActive?: boolean }) {
  const router = useRouter()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const intervalMs = isActive ? 15000 : 60000

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => router.refresh(), intervalMs)
  }, [intervalMs, router])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!document.hidden) startPolling()

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        router.refresh()
        startPolling()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      stopPolling()
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [startPolling, stopPolling, router])

  return null
}
