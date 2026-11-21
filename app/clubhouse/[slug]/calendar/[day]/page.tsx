import { notFound } from 'next/navigation'
import DayView from './DayView'

/** One day in the Clubhouse, every location side by side (D277). */
export default async function ClubhouseDayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T12:00:00Z`).getTime())) notFound()
  return <DayView day={day} />
}
