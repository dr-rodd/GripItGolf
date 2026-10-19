import StylePreview from './StylePreview'

/**
 * A style lab look, offered to one phone by a link — how a setup is shown to
 * the group without touching anyone else's phone.
 *
 * Static on purpose, like /join: `?s=` is read on the client, never from
 * searchParams here, and nothing is applied until the person taps.
 */
export const metadata = {
  title: 'Style preview — green dot.',
  robots: { index: false, follow: false },
}

export default function StylePreviewPage() {
  return <StylePreview />
}
