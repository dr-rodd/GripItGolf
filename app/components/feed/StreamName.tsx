import { streamWord, type StreamKind } from '@/lib/feed'

/**
 * A stream's name (D321): its word, an emerald dot, "stream" — club•stream.
 * The dot is a CSS circle in the accent token sized to the text, never the
 * wordmark's artwork (which is never redrawn). Read aloud as "club stream".
 */
export default function StreamName({ kind, className = '' }: { kind: StreamKind; className?: string }) {
  const word = streamWord(kind)
  return (
    <span className={`stream-name ${className}`}>
      <span className="sr-only">{word} stream</span>
      <span aria-hidden="true">{word}</span>
      <span aria-hidden="true" className="stream-name-dot" />
      <span aria-hidden="true">stream</span>
    </span>
  )
}
