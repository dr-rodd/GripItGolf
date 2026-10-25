'use client'

import { useEffect } from 'react'
import { isStaleBuildError, reloadForNewVersion } from '@/lib/staleBuild'

/**
 * Listens on every page for the site's own files failing to load — a phone
 * still running a version that has since been replaced — and reloads it
 * onto the new one before the error screen can appear (lib/staleBuild.ts).
 * Renders nothing.
 */
export default function StaleBuildGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isStaleBuildError(e.error ?? e.message)) reloadForNewVersion()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleBuildError(e.reason)) reloadForNewVersion()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
