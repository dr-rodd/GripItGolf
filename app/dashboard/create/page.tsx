import { supabase } from '@/lib/supabase'
import CreateTripForm from './CreateTripForm'

export const dynamic = 'force-dynamic'

export default async function CreateTripPage() {
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name')
    .is('trip_id', null)
    .order('name')

  return <CreateTripForm courses={courses ?? []} />
}
