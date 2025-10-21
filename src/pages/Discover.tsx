import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { generateRecipe } from '../lib/generator'
import { useNavigate } from 'react-router-dom'
import type { Recipe } from '../lib/types'

const moodIds = ['happy','romantic','celebrate','relax','nostalgia','nervous','angry','excited']

export default function Discover(){
  const { naMode, lowSugar } = useSettingsStore()
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()

  const recipe: Recipe = useMemo(()=> generateRecipe({ moodKey: moodIds[index % moodIds.length], na: naMode, lowSugar }), [index, naMode, lowSugar])

  useEffect(()=>{
    const timer = setInterval(()=> setIndex(prev => prev + 1), 3500)
    return () => clearInterval(timer)
  },[])

  return (
    <div className="container">
      <div className="h2">试试发现：不同心情的灵感</div>
      <div className="text">每 3.5 秒切换一次心情样本：{moodIds[index % moodIds.length]}</div>
      <div className="card" style={{marginTop:12}}>
        <div className="text">{recipe.name}（{recipe.method} / {recipe.glass}）</div>
        <div style={{display:'flex', gap:8, marginTop:8}}>
          <button className="btn" onClick={()=> navigate('/')}>返回首页</button>
        </div>
      </div>
    </div>
  )
}

function formatTotal(unit:'ml'|'oz', ml:number){
  if (unit==='ml') return `${ml} ml`
  return `${(ml/29.5735).toFixed(2)} oz`
}