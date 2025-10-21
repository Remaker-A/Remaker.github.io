import type { FlavorVector, FlavorKey } from '../lib/types'

const dims: FlavorKey[] = ['sweet','sour','bitter','fruit','aroma','spicy','body']

export default function FlavorBars({ flavor }: { flavor: FlavorVector }){
  return (
    <div className="card">
      <div className="h2">风味分布</div>
      <div className="grid" style={{gridTemplateColumns:'1fr'}}>
        {dims.map(k => (
          <div key={k} style={{display:'flex', alignItems:'center', gap:8}}>
            <div className="label" style={{width:64}}>{label(k)}</div>
            <div style={{flex:1, height:8, background:'#EEF2FF', borderRadius:8}}>
              <div style={{width: `${Math.round((flavor[k]||0)*100)}%`, height:8, background:'var(--primary)', borderRadius:8}} />
            </div>
            <div className="label" style={{width:40, textAlign:'right'}}>{`${Math.round((flavor[k]||0)*100)}%`}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function label(k: FlavorKey){
  switch(k){
    case 'sweet': return '甜'
    case 'sour': return '酸'
    case 'bitter': return '苦'
    case 'fruit': return '果香'
    case 'aroma': return '花香'
    case 'body': return '酒感'
    case 'spicy': return '气泡感'
  }
}