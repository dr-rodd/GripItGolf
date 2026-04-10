import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SANDY_HILLS_ID    = '11111111-0000-0000-0000-000000000001'
const OLD_TOM_ID        = '11111111-0000-0000-0000-000000000002'
const ST_PATRICKS_ID    = '11111111-0000-0000-0000-000000000003'

function holes(courseId: string) {
  return Array.from({ length: 18 }, (_, i) => ({
    course_id:    courseId,
    hole_number:  i + 1,
    par:          4,
    stroke_index: i + 1,
  }))
}

async function run() {
  console.log('Seeding courses...')
  const { error: coursesError } = await supabase.from('courses').insert([
    { id: SANDY_HILLS_ID, name: 'Sandy Hills' },
    { id: OLD_TOM_ID,     name: 'Old Tom Morris' },
    { id: ST_PATRICKS_ID, name: 'St Patricks Links' },
  ])
  if (coursesError) throw new Error(`Courses: ${coursesError.message}`)
  console.log('  ✓ 3 courses inserted')

  console.log('Seeding holes...')
  const allHoles = [
    ...holes(SANDY_HILLS_ID),
    ...holes(OLD_TOM_ID),
    ...holes(ST_PATRICKS_ID),
  ]
  const { error: holesError } = await supabase.from('holes').insert(allHoles)
  if (holesError) throw new Error(`Holes: ${holesError.message}`)
  console.log('  ✓ 54 holes inserted (18 per course, placeholder par 4)')

  console.log('Seeding players...')
  const { error: playersError } = await supabase.from('players').insert([
    // Dads
    { name: 'John',    role: 'dad', handicap: 11.9 },
    { name: 'Martin',  role: 'dad', handicap: 14.0 },
    { name: 'Peter',   role: 'dad', handicap: 18.0 },
    { name: 'Paul',    role: 'dad', handicap: 14.6 },
    // Mums
    { name: 'Aisling', role: 'mum', handicap: 21.1 },
    { name: 'Eithne',  role: 'mum', handicap: 26.0 },
    { name: 'Liz',     role: 'mum', handicap: 22.0 },
    { name: 'Gillian', role: 'mum', handicap: 24.0 },
    // Sons
    { name: 'Ross',    role: 'son', handicap:  9.4 },
    { name: 'Matthew', role: 'son', handicap:  5.1 },
    { name: 'Dave',    role: 'son', handicap:  3.3 },
    { name: 'Sam',     role: 'son', handicap: 12.0 },
  ])
  if (playersError) throw new Error(`Players: ${playersError.message}`)
  console.log('  ✓ 12 players inserted')

  console.log('\nSeed complete.')
}

run().catch((err) => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
