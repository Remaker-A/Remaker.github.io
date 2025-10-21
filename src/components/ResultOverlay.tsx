import { useEffect, useState } from 'react'
import { Recipe } from '../lib/types'
import ResultCard from './ResultCard'

export default function ResultOverlay({
  open,
  recipe,
  na,
  lowSugar,
  generating,
  progress,
  stage,
  onUnitToggle,
  onAction,
  onClose,
}: {
  open: boolean
  recipe: Recipe
  na: boolean
  lowSugar: boolean
  generating?: boolean
  progress?: number
  stage?: string
  onUnitToggle: ()=>void
  onAction: (action: 'save'|'share'|'variant')=>void
  onClose: ()=>void
}){
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(()=>{
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  },[])
  const isSm = vw <= 600

  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e=> e.stopPropagation()}
        style={{ maxWidth: isSm ? 380 : 920, width: '92%', maxHeight: '85vh', overflowY: 'auto', borderRadius: 12 }}
      >
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div className="h2">调制结果</div>
          <button className="btn" onClick={onClose}>再调一杯</button>
        </div>
        {generating ? (
          <div className="card" aria-busy="true" style={{marginBottom:12}}>
            <div className="text" style={{marginBottom:6}}>{stage ?? '正在生成...'}</div>
            <div style={{height:10, background:'#eee', borderRadius:9999, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${Math.max(0, Math.min(100, progress ?? 0))}%`, background:'var(--primary)'}}></div>
            </div>
          </div>
        ) : null}
        <ResultCard
          recipe={recipe}
          na={na}
          lowSugar={lowSugar}
          onUnitToggle={onUnitToggle}
          onAction={onAction}
        />
      </div>
    </div>
  )
}