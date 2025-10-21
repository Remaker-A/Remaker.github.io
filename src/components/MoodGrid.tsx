import { useMemo } from 'react'
import type { MoodProfile } from '../lib/types'
import { loadMoods } from '../lib/data'
import { track } from '../lib/analytics'

type Props = {
  selected?: string
  onSelect: (key: string) => void
}

export default function MoodGrid({ selected, onSelect }: Props){
  const profiles: MoodProfile[] = useMemo(()=> loadMoods(), [])
  // Curate visible moods to keep even count and neat grid
  const visibleKeys = ['happy','romantic','celebrate','relax','nostalgia','nervous','angry','excited']
  const list = profiles.filter(p => visibleKeys.includes(p.key))
  return (
    <div className="grid" style={{gridTemplateColumns:'repeat(4, 1fr)'}}>
      {list.map(p => (
        <button key={p.key} className="card" onClick={()=>{ track('mood_select',{ mood: p.key }); onSelect(p.key) }} style={{borderColor: selected===p.key? 'var(--primary)':'var(--border)'}}>
          <div className="label">Mood</div>
          <div className="h2" style={{color:'var(--text)'}}>{p.displayName || p.key}</div>
          <div className="chip">templates: {(p.templateCandidates||[]).slice(0,2).join(', ')}</div>
        </button>
      ))}
    </div>
  )
}