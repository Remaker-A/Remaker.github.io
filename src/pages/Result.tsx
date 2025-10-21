import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import ResultCard from '../components/ResultCard'
import ShareOverlay from '../components/ShareOverlay'
import { useRecipesStore } from '../stores/recipesStore'
import { useSettingsStore } from '../stores/settingsStore'
import { generateRecipe } from '../lib/generator'
import type { Recipe } from '../lib/types'
import { track } from '../lib/analytics'

export default function Result(){
  const [sp] = useSearchParams()
  const name = sp.get('name') || ''
  const { favorites, recent, addFavorite, pushRecent } = useRecipesStore()
  const { unit, setUnit, naMode, lowSugar, allergies } = useSettingsStore()
  const [shareOpen, setShareOpen] = useState(false)
  const current = useMemo(()=> {
    const fromFav = favorites.find(f=> f.name === name)
    if (fromFav) return fromFav
    const fromRecent = recent.find(r=> r.name === name)
    if (fromRecent) return fromRecent
    return undefined
  }, [favorites, recent, name])
  const [recipe, setRecipe] = useState<Recipe|undefined>(current)
  const [toast, setToast] = useState<string>('')
  const [generating, setGenerating] = useState<boolean>(false)

  useEffect(()=>{ setRecipe(current) }, [current])

  return (
    <div className="container">
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div className="h1">结果详情</div>
        <Link to="/recipes" className="chip">返回我的配方</Link>
      </div>
      {!recipe ? (
        <div className="card">
          <div className="h2">未找到该配方</div>
          <div className="text">请从“我的配方”列表进入或返回首页重新生成。</div>
        </div>
      ) : (
        <section style={{marginTop:8}}>
          <ResultCard recipe={recipe} na={naMode} lowSugar={lowSugar} onUnitToggle={()=>{ const next = unit==='ml'?'oz':'ml'; track('unit_toggle',{ next }); setUnit(next); setRecipe(prev => prev ? ({ ...prev, unit: next }) : prev) }} onAction={(act)=>{
            track('result_action_detail',{ action: act, name: recipe.name })
            switch(act){
              case 'save': {
                addFavorite(recipe)
                setToast('已保存到 “我的配方”')
              } break
              case 'share': {
                setShareOpen(true)
                setToast('已生成分享卡片')
              } break
              case 'variant': {
                setGenerating(true)
                setTimeout(()=>{
                  const r = generateRecipe({ moodKey: recipe.mood, taste: recipe.flavor, na: naMode, lowSugar, allergies })
                  const withUnit = { ...r, unit }
                  setRecipe(withUnit)
                  pushRecent(withUnit)
                  setToast('已生成变体')
                  setGenerating(false)
                }, 250)
              } break
            }
            setTimeout(()=> setToast(''), 1500)
          }} />
        </section>
      )}
      {toast && <div className="toast">{toast}</div>}
      {recipe && <ShareOverlay open={shareOpen} recipe={recipe} onClose={()=> setShareOpen(false)} />}
    </div>
  )
}