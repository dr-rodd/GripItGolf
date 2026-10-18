import { splitCourseName } from '@/lib/courseDirectory'

/**
 * A course's name on a tile: the club on the first line and, where the club
 * has more than one, the course under it in caption type. The stored name
 * keeps both halves apart with "--", which is never printed
 * (`splitCourseName`, lib/courseDirectory.ts).
 */
export default function CourseName({
  name, className = '', courseClassName = 't-cap text-ink/65 mt-0.5',
}: {
  name: string
  /** The club's line — whatever the tile's title already was. */
  className?: string
  courseClassName?: string
}) {
  const { club, course } = splitCourseName(name)
  return (
    <>
      <span className={`block ${className}`.trim()}>{club}</span>
      {course && <span className={`block ${courseClassName}`.trim()}>{course}</span>}
    </>
  )
}
