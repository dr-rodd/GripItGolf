'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const GROUP_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'teams',      label: 'Teams (up to 4 players)' },
] as const

const COMPETITION_OPTIONS = [
  { value: 'league',    label: 'League ranking' },
  { value: 'matchplay', label: 'Matchplay bracket' },
] as const

type GroupStyle       = typeof GROUP_OPTIONS[number]['value']
type CompetitionStyle = typeof COMPETITION_OPTIONS[number]['value']

export default function FormatPicker({
  tripId,
  initialGroup,
  initialCompetition,
}: {
  tripId:             string
  initialGroup:       GroupStyle
  initialCompetition: CompetitionStyle
}) {
  const [group,       setGroup]       = useState<GroupStyle>(initialGroup)
  const [competition, setCompetition] = useState<CompetitionStyle>(initialCompetition)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function save(nextGroup: GroupStyle, nextCompetition: CompetitionStyle) {
    setSaving(true)
    setError('')
    const prev = { group, competition }
    setGroup(nextGroup)
    setCompetition(nextCompetition)
    const { error: err } = await supabase
      .from('trips')
      .update({ group_style: nextGroup, competition_style: nextCompetition })
      .eq('id', tripId)
    if (err) {
      setGroup(prev.group)
      setCompetition(prev.competition)
      setError('Could not save — try again')
    }
    setSaving(false)
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label className="text-white/40 text-[10px] tracking-[0.2em] uppercase">Group style</label>
        <select
          value={group}
          disabled={saving}
          onChange={e => save(e.target.value as GroupStyle, competition)}
          className="w-full py-4 px-5 bg-white/5 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-[#C9A84C]/60 transition-colors disabled:opacity-50 appearance-none cursor-pointer"
        >
          {GROUP_OPTIONS.map(o => (
            <option key={o.value} value={o.value} className="bg-[#0a1a0e]">{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-white/40 text-[10px] tracking-[0.2em] uppercase">Competition style</label>
        <select
          value={competition}
          disabled={saving}
          onChange={e => save(group, e.target.value as CompetitionStyle)}
          className="w-full py-4 px-5 bg-white/5 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-[#C9A84C]/60 transition-colors disabled:opacity-50 appearance-none cursor-pointer"
        >
          {COMPETITION_OPTIONS.map(o => (
            <option key={o.value} value={o.value} className="bg-[#0a1a0e]">{o.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-[#C9A84C] text-xs text-center">{error}</p>}
    </div>
  )
}
