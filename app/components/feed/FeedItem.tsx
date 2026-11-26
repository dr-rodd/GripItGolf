'use client'

import { ago, ordinal, replyNote, replyQuote, type Reaction, type ReactionCount } from '@/lib/feed'
import { IconLink, IconReply } from '../icons'
import Initials from '../Initials'
import { SC_SF } from '../scorecardStyle'
import { MoreMenu, ReactionChip, ReplyMenu } from './ItemActions'
import SwipeReply from './SwipeReply'

/** A reply on an item, as the server hands it (app/api/feed/feed.ts `ThreadComment`). */
export interface ThreadComment {
  id: string
  name: string
  text: string
  at: string
  mine: boolean
  replyTo: string | null
  replyName: string | null
  canDelete: boolean
  canReport: boolean
  reactions: ReactionCount[]
  myReaction: Reaction | null
}

/** An item as the server hands it to this viewer (app/api/feed/feed.ts `FeedView`). */
export interface FeedView {
  id: string
  kind: 'card' | 'highlight' | 'comment' | 'board_move' | 'match_result' | 'status' | 'post'
  at: string
  name: string
  line: string
  status: string | null
  gross: number | null
  points: number | null
  holes: number | null
  place: number | null
  highlights: string[]
  /** Each emoji with its count, and this viewer's own (D348). */
  reactions: ReactionCount[]
  myReaction: Reaction | null
  comments: number
  latest: { name: string; text: string } | null
  /** Every reply, oldest first — each its own message in the chat (D346). */
  thread: ThreadComment[]
  /** "2 comments · John and 1 other" (D329). */
  commentLine: { count: string; who: string } | null
  /** Why a card is in friends.stream when it is not a friend's own (D327). */
  why: string | null
  /** A club post's words and link (D325). */
  text: string | null
  link: string | null
  /** May be replied to and reacted to (D329, D348). */
  talk: boolean
  mine: boolean
  audience: 'wide' | 'me' | null
  parentId: string | null
  on: string | null
  canDelete: boolean
  canReport: boolean
  code: string | null
}

/** Who a reply being written answers (D346): the item, or one of its replies. */
export interface ReplyTarget {
  rootId: string
  commentId: string | null
  name: string
  mine: boolean
  quote: 'card' | 'comment' | 'item'
  text: string
  card: Pick<FeedView, 'name' | 'points' | 'gross'> | null
}

/** Replying to an item itself — the card quoted as its square, anything else named. */
export function replyToItem(item: FeedView): ReplyTarget {
  return {
    rootId: item.id, commentId: null, name: item.name, mine: item.mine, quote: replyQuote(item, null),
    text: item.kind === 'post' ? item.line || item.text || '' : item.status || item.line || '',
    card: item.kind === 'card' ? { name: item.name, points: item.points, gross: item.gross } : null,
  }
}

/** Replying to one of an item's replies. */
export function replyToComment(item: FeedView, c: ThreadComment): ReplyTarget {
  return { rootId: item.id, commentId: c.id, name: c.name, mine: c.mine, quote: 'comment', text: c.text, card: null }
}

/** A host for the line under a post — the whole address is the link itself. */
function hostOf(link: string): string {
  try { return new URL(link).hostname.replace(/^www\./, '') } catch { return link }
}

/**
 * A chat bubble's shape (D342, D349): rounded and opaque — yours solid in the
 * system's green with white words (Ross, 26 Nov 2026: "shouldn't be
 * transparent, use system green"; `accent-deep`, the primary button's fill,
 * the green white words read on), everybody else's white.
 */
const bubble = (mine: boolean) =>
  `rounded-[22px] px-4 py-2.5 ${mine ? 'bg-accent-deep text-white' : 'bg-surface text-ink border border-line'}`

/** Their initial beside the message; a found message's gets the green dot's pop (D346). */
function Face({ name, flash }: { name: string; flash: boolean }) {
  return (
    <span className="relative flex-shrink-0 mt-5">
      <Initials name={name} size={28} />
      {flash && <span aria-hidden="true" className="chat-dot-pop absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent border-2 border-surface" />}
    </span>
  )
}

/**
 * One item of a stream as a chat message (D342, D346): everybody else's on
 * the left at about seven tenths of the width, under their initial and
 * name; **yours on the right**. A signed card is a **square** (`CardSquare`)
 * with its status as a caption bubble beneath; a status or a club post is a
 * **chat bubble**; a leaderboard move or a cut a line across the middle, as
 * a chat says the time. Its reactions hang on its foot (D348: hold it for the six); under it when, how many replies (a tap
 * opens the card with every reply, as before) and the ⋯. Its replies are
 * messages of their own further down the chat (`ChatReply`). **Swipe it
 * right to reply** (`SwipeReply`). Tapping it opens its sheet, sprung out of
 * where it was tapped (the pop-out, D330). Never an animated number (D9).
 */
export function FeedItem({ item, now, onOpen, onPatch, onGone, onReply, onReact, onHold, flash = false, held = false, arriving = false }: {
  item: FeedView
  now: Date
  /** Opens the item's sheet, out of the element tapped (D330). */
  onOpen?: (el: HTMLElement) => void
  onPatch: (p: Partial<FeedView>) => void
  onGone: () => void
  /** Reply to it (D346) — absent where it takes no replies. */
  onReply?: () => void
  /** React to it (D348); `onHold` opens the long-press bar over it. */
  onReact?: (e: Reaction) => void
  onHold?: (el: HTMLElement) => void
  /** Just jumped to: highlighted for a moment. */
  flash?: boolean
  /** Held, its reactions bar open: ringed while it is. */
  held?: boolean
  /** New since the stream was last read: it fades in (M13). */
  arriving?: boolean
}) {
  const opens = !!onOpen && item.talk
  const open = (e: React.MouseEvent<HTMLElement>) => {
    if (!opens || (e.target as HTMLElement).closest('button, a')) return
    onOpen!(e.currentTarget)
  }
  const keyOpen = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!opens || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onOpen!(e.currentTarget)
  }
  const tappable = (label: string) => opens
    ? { onClick: open, onKeyDown: keyOpen, role: 'button' as const, tabIndex: 0, 'aria-label': label, 'data-pop-origin': '' }
    : {}

  // A leaderboard move, a cut: one line across the middle, as a chat says the time.
  if (!item.talk) {
    return (
      <article data-msg={item.id} className={`flex items-center justify-center gap-1 py-1 ${arriving ? 'stream-arrive' : ''}`}>
        <p className={`t-cap text-ink/65 text-center break-words min-w-0 rounded-tile px-2 ${flash ? 'chat-flash' : ''}`}>
          {item.line} · <time dateTime={item.at}>{ago(item.at, now)}</time>
        </p>
        <MoreMenu item={item} onPatch={onPatch} onGone={onGone} className="!w-9 !h-9 -my-2" />
      </article>
    )
  }

  const mine = item.mine
  const isCard = item.kind === 'card'
  return (
    <SwipeReply onReply={onReply} onHold={onHold}>
      <article data-msg={item.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''} ${arriving ? 'stream-arrive' : ''}`}>
        {!mine && <Face name={item.name} flash={flash} />}
        <div className={`flex flex-col min-w-0 ${mine ? 'items-end' : 'items-start'} ${isCard ? 'w-[72%]' : 'max-w-[72%]'}`}>
          {!mine && <p className="t-cap text-ink/65 px-3 mb-1 truncate max-w-full">{item.name}</p>}
          {item.why && <p className="t-cap text-ink/65 px-3 mb-1">{item.why}</p>}

          {isCard ? (
            <>
              <div {...tappable(`${item.name}’s card — open it, with every reply`)}
                className={`w-full rounded-[22px] ${flash || held ? 'chat-flash' : ''} ${opens ? 'cursor-pointer press ch-focus' : ''}`}>
                <CardSquare item={item} />
              </div>
              {item.status && <p className={`${bubble(mine)} mt-1 text-[15px] leading-snug break-words max-w-full`}>{item.status}</p>}
            </>
          ) : (
            <div {...tappable(`${item.name}’s ${item.kind === 'post' ? 'post' : 'status'} — open it, with every reply`)}
              className={`${bubble(mine)} max-w-full ${flash || held ? 'chat-flash' : ''} ${opens ? 'cursor-pointer press ch-focus' : ''}`}>
              {item.kind === 'post' && item.line && <p className={`t-label break-words ${mine ? 'text-white' : 'text-ink'}`}>{item.line}</p>}
              {item.kind === 'post' && item.text && (
                <div className={`${item.line ? 'mt-1 ' : ''}space-y-2`}>
                  {item.text.split(/\n{2,}/).map((para, i) => <p key={i} className="text-[16px] leading-snug break-words whitespace-pre-line">{para}</p>)}
                </div>
              )}
              {item.kind === 'post' && item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className={`mt-1 inline-flex items-center gap-1.5 min-h-11 t-label press ch-focus rounded-tile break-all ${mine ? 'text-white underline' : 'text-accent-deep'}`}>
                  <IconLink size={16} className="flex-shrink-0" /> {hostOf(item.link)}
                </a>
              )}
              {item.kind === 'status' && item.status && <p className="text-[16px] leading-snug break-words">{item.status}</p>}
              {item.kind === 'match_result' && <p className="text-[16px] leading-snug break-words">{item.line}</p>}
            </div>
          )}

          {/* D348: its reactions hang on the foot of the bubble, as WhatsApp's do. */}
          <ReactionChip itemId={item.id} reactions={item.reactions} myReaction={item.myReaction} onTake={() => item.myReaction && onReact?.(item.myReaction)} />
          {/* When, the replies, the ⋯ — small, under the message. */}
          <div className={`flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
            <time dateTime={item.at} className="t-cap text-ink/65 px-1">{ago(item.at, now)}</time>
            {item.comments > 0 && opens && (
              <button type="button" data-pop-origin="" onClick={e => onOpen!(e.currentTarget)}
                className="min-h-11 px-1.5 t-cap text-accent-deep font-semibold press ch-focus rounded-tile">
                {item.comments} {item.comments === 1 ? 'reply' : 'replies'}
              </button>
            )}
            <MoreMenu item={item} onPatch={onPatch} onGone={onGone} onReply={onReply} onReact={onReact} className="!w-9 !h-9" />
          </div>
        </div>
      </article>
    </SwipeReply>
  )
}

/**
 * A reply as its own message in the chat (D346, Ross, 26 Nov 2026): at its
 * own time, left or right as any message. Stuck to the top of it, what it
 * answers — **a reply to a card quotes the card** as a small square (whose
 * initial and score; a tap goes back up to the card in the chat), **any
 * other reply carries a note** — "Replying to Dave" and the first words of
 * what it answers — a tap going to that message, briefly lit. Swipe it right
 * to reply to it in turn.
 */
export function ChatReply({ item, reply, now, onJump, onReply, onGone, onReact, onHold, flash = false, held = false, arriving = false }: {
  item: FeedView
  reply: ThreadComment
  now: Date
  /** Go to a message in the chat: the item, or another reply. */
  onJump: (id: string) => void
  onReply?: () => void
  onGone: () => void
  onReact?: (e: Reaction) => void
  onHold?: (el: HTMLElement) => void
  flash?: boolean
  held?: boolean
  arriving?: boolean
}) {
  const mine = reply.mine
  const kind = replyQuote(item, reply.replyTo)
  const target = reply.replyTo ? item.thread.find(c => c.id === reply.replyTo) ?? null : null
  const note = kind === 'comment'
    ? { to: target?.id ?? item.id, label: replyNote({ name: target?.name ?? reply.replyName ?? 'a member', mine: target?.mine ?? false }), text: target?.text ?? '' }
    : { to: item.id, label: replyNote({ name: item.name, mine: item.mine }), text: item.kind === 'post' ? item.line || item.text || '' : item.status || item.line }
  return (
    <SwipeReply onReply={onReply} onHold={onHold}>
      <article data-msg={reply.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''} ${arriving ? 'stream-arrive' : ''}`}>
        {!mine && <Face name={reply.name} flash={flash} />}
        <div className={`flex flex-col min-w-0 max-w-[72%] ${mine ? 'items-end' : 'items-start'}`}>
          {!mine && <p className="t-cap text-ink/65 px-3 mb-1 truncate max-w-full">{reply.name}</p>}
          {kind === 'card' ? (
            <MiniCard item={item} onTap={() => onJump(item.id)} />
          ) : (
            // The note, stuck to the top of the bubble: square where they meet, the bubble over its foot.
            <button type="button" onClick={() => onJump(note.to)} aria-label={`${note.label} — go to it`}
              className={`chat-note relative z-0 -mb-3 pb-4 pt-1.5 px-3 max-w-full text-left press ch-focus ${mine ? 'self-end' : 'self-start'}`}>
              <span className="flex items-center gap-1 t-cap text-ink/80 font-semibold min-w-0">
                <IconReply size={13} className="flex-shrink-0" /><span className="truncate">{note.label}</span>
              </span>
              {note.text && <span className="block t-cap text-ink/65 truncate">{note.text}</span>}
            </button>
          )}
          <p className={`${bubble(mine)} relative z-[1] max-w-full text-[16px] leading-snug break-words ${flash || held ? 'chat-flash' : ''}`}>{reply.text}</p>
          <ReactionChip itemId={reply.id} reactions={reply.reactions} myReaction={reply.myReaction} onTake={() => reply.myReaction && onReact?.(reply.myReaction)} />
          <div className={`flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
            <time dateTime={reply.at} className="t-cap text-ink/65 px-1">{ago(reply.at, now)}</time>
            <ReplyMenu reply={reply} onReply={onReply} onGone={onGone} onReact={onReact} />
          </div>
        </div>
      </article>
    </SwipeReply>
  )
}

/** The score a card is quoted by: its points, else its strokes. */
function cardScore(item: Pick<FeedView, 'points' | 'gross'>): { v: number; l: string } | null {
  return item.points != null ? { v: item.points, l: 'pts' } : item.gross != null ? { v: item.gross, l: 'strokes' } : null
}

/**
 * A card quoted on a reply (D346, Ross: "a small card square shows on the
 * comment … the initials and score visible"): the card's own square in
 * small — whose initial and the score in the scorecard's serif — rounded
 * all round, just above the reply (D349). A tap goes back up to the card.
 */
export function MiniCard({ item, onTap, stuck = true }: { item: Pick<FeedView, 'name' | 'points' | 'gross'>; onTap?: () => void; stuck?: boolean }) {
  const score = cardScore(item)
  // Whose initial and the number side by side, what the number is under them.
  const inner = (
    <>
      <span className="flex items-center gap-1">
        {stuck && <Initials name={item.name} size={20} />}
        <span className="font-bold text-ink text-[17px] leading-none tabular-nums" style={SC_SF}>{score ? score.v : '–'}</span>
      </span>
      <span className="text-[13px] leading-none text-ink/65">{score ? (score.l === 'pts' ? 'pts' : 'gross') : 'card'}</span>
    </>
  )
  // D349: small, opaque and rounded all round, sitting just above the reply's bubble (Ross: "too big and should be rounded").
  const box = stuck
    ? 'mb-1 w-[60px] h-[52px] rounded-[16px] bg-surface border border-line shadow-raised flex flex-col items-center justify-center gap-1'
    : 'w-12 h-12 rounded-[14px] bg-surface border border-line flex flex-col items-center justify-center gap-1 flex-shrink-0'
  return onTap
    ? <button type="button" onClick={onTap} aria-label={`${item.name}’s card${score ? `, ${score.v} ${score.l === 'pts' ? 'points' : 'strokes'}` : ''} — go to it`} className={`${box} press ch-focus`}>{inner}</button>
    : <div className={box}>{inner}</div>
}

/**
 * A signed card as a square (D342, Ross: "scorecards should be roughly
 * square, with clear points / strokes total… the old trip typeface for the
 * totals"): the event and course at the top; the points large, the strokes
 * under them, both in the scorecard's own bold serif (`SC_SF`, the trip
 * card's totals); the holes, the place (gold only for 1st, gold being for
 * winning) and the first highlight at the foot.
 */
export function CardSquare({ item }: { item: Pick<FeedView, 'line' | 'gross' | 'points' | 'place' | 'holes' | 'highlights'> }) {
  const lead = item.points != null ? { v: item.points, l: 'points' } : item.gross != null ? { v: item.gross, l: 'strokes' } : null
  const second = item.points != null && item.gross != null ? { v: item.gross, l: 'strokes' } : null
  return (
    <div className="aspect-square w-full rounded-[22px] bg-surface border border-line shadow-raised p-4 flex flex-col overflow-hidden">
      {item.line && <p className="t-cap text-ink/65 line-clamp-2 break-words">{item.line}</p>}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        {lead ? (
          <>
            <span className="font-bold text-ink leading-none text-[56px] tabular-nums" style={SC_SF}>{lead.v}</span>
            <span className="t-label text-ink/65 mt-1">{lead.l}</span>
            {second && (
              <span className="mt-3 inline-flex items-baseline gap-1.5">
                <span className="font-bold text-ink leading-none text-[26px] tabular-nums" style={SC_SF}>{second.v}</span>
                <span className="t-cap text-ink/65">{second.l}</span>
              </span>
            )}
          </>
        ) : <span className="t-cap text-ink/65">No total yet</span>}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        {item.highlights[0] && <span className="t-cap text-accent-deep font-semibold truncate min-w-0">{item.highlights[0]}</span>}
        {!item.highlights[0] && item.holes != null && item.holes < 18 && <span className="t-cap text-ink/65">{item.holes} holes</span>}
        {item.place && (
          <span className={`ml-auto t-label flex-shrink-0 ${item.place === 1 ? 'text-gold-deep' : 'text-ink/80'}`}>{ordinal(item.place)}</span>
        )}
      </div>
    </div>
  )
}
