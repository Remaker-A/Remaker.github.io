import { useRef } from 'react'
import type { Recipe } from '../lib/types'
import { FlavorRadar } from './FlavorRadar'

export default function ShareOverlay({ open, recipe, onClose }: { open: boolean; recipe: Recipe; onClose: ()=>void }){
  const textRef = useRef<HTMLTextAreaElement|null>(null)
  if (!open) return null
  const text = `${recipe.name}\n${recipe.story || ''}\nABV: ${recipe.estimatedABV}%\n材料：\n` +
    recipe.ingredients.map(it=>`- ${it.name}：${formatAmount(recipe.unit, it.amountMl)}`).join('\n')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="h2">分享卡片</div>
        <div className="card" style={{padding:8}}>
          <div className="h3" style={{marginBottom:8}}>{recipe.name} · {recipe.estimatedABV}% ABV</div>
          <div className="text" style={{marginBottom:8}}>{recipe.story}</div>
          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
            <FlavorRadar size={160} vector={recipe.flavor} />
            <div className="text" style={{maxWidth:260}}>
              <div><strong>材料：</strong></div>
              <ul style={{paddingLeft:18, marginTop:6}}>
                {recipe.ingredients.map((it,i)=> (
                  <li key={i}>{it.name} · {formatAmount(recipe.unit, it.amountMl)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div style={{marginTop:12}}>
          <textarea ref={textRef} defaultValue={text} style={{width:'100%', height:80}} />
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:8}}>
          <button className="btn" onClick={()=>{ copyText(textRef.current?.value || text) }}>复制文本</button>
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

function formatAmount(unit:'ml'|'oz', ml:number){
  if (unit==='ml') return `${ml} ml`
  const oz = ml/29.5735
  return `${oz.toFixed(2)} oz`
}

function copyText(s: string){
  try {
    navigator.clipboard.writeText(s)
  } catch (e) {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = s
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}