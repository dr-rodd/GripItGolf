'use client'

import ClubLook from '@/app/account/club/ClubLook'
import ClubHomeCourse from '@/app/account/club/ClubHomeCourse'
import { cardClass } from '@/app/components/ui'
import { useShell } from '../ShellContext'

/**
 * Club settings (stage (k1)): the club's look — crest, art, colour — and its
 * home course, the same parts the list page held, moved as they are. Both
 * fold to one column, so a phone has them too (D202).
 */
export default function ClubSettings() {
  const { club, setClub, may } = useShell()
  if (!may('set_look')) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse changes the club’s settings.</p>
  return (
    <>
      <h1 className="t-h1 text-ink">Club settings</h1>
      <div className="grid gap-4 mt-6 lg:grid-cols-2 items-start">
        <section className={`${cardClass()} p-5 [&>section]:mt-0`}>
          <ClubLook club={club} onChange={setClub} />
        </section>
        {club.status === 'verified' && (
          <section className={`${cardClass()} p-5 [&>section]:mt-0`}>
            <ClubHomeCourse club={club} onChange={setClub} />
          </section>
        )}
      </div>
    </>
  )
}
