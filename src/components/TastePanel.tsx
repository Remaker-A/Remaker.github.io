import type { FlavorKey, FlavorVector } from '../lib/types'
import { track } from '../lib/analytics'

const dims: FlavorKey[] = ['sweet','sour','bitter','fruit','aroma','body','spicy']

type Props = {
  values: Partial<FlavorVector>
  lowSugar?: boolean
  compact?: boolean
  onChange: (next: Partial<FlavorVector>) => void
}

export default function TastePanel({ values, lowSugar, compact, onChange }: Props){
  const rowSpacing = compact ? 8 : 12
  const rightGap = compact ? 6 : 8
  const hintStyle = { fontSize: compact ? 11 : 12, color:'#64748B' }
  return (
    <div className="card">
      <div className="h2">口味微调</div>
      <div className="grid" style={{gridTemplateColumns:'1fr'}}>
        {dims.map(k => {
          const max = (lowSugar && k==='sweet') ? 30 : 100
          const val = Math.min(max, Math.max(0, Number(values[k] ?? 50)))
          return (
            <div key={k} style={{marginBottom: rowSpacing}}>
              <div className="label" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{minWidth:48}}>{label(k)}</span>
                <span style={{display:'flex', alignItems:'center', gap:rightGap}}>
                  {lowSugar && k === 'sweet' ? <span style={hintStyle as any}>低糖模式将甜度上限固定为30%</span> : null}
                  <span>{Math.round(val)}%</span>
                </span>
              </div>
              <input className="slider" type="range" min={0} max={max} step={1}
                value={val}
                style={{width:'100%'}}
                onInput={e=>{
                  const v = parseFloat(e.currentTarget.value)
                  const next = { ...values, [k]: v }
                  onChange(next)
                }}
                onChange={e=>{
                  const v = parseFloat(e.target.value)
                  const next = { ...values, [k]: v }
                  track('taste_adjust_one',{ dim: k, value: v })
                  onChange(next)
                }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function label(k: FlavorKey){
  switch(k){
    case 'sweet': return '甜'
    case 'sour': return '酸'
    case 'bitter': return '苦'
    case 'aroma': return '花香'
    case 'fruit': return '果香'
    case 'spicy': return '气泡感'
    case 'body': return '酒感'
  }
}