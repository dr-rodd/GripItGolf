'use client'

import ErrorScreen from '@/app/components/ErrorScreen'

/** Any page that fails, inside the site's own layout (lib/staleBuild.ts). */
export default function PageError({ error }: { error: Error & { digest?: string } }) {
  return <ErrorScreen error={error} />
}
