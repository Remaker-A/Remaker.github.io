import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecipesStore } from '../stores/recipesStore'
import { useSettingsStore } from '../stores/settingsStore'

export default function MyRecipes(){
  const { favorites, recent, removeFavorite } = useRecipesStore()
  const { unit } = useSettingsStore()
  const nav = useNavigate()
  const hasFav = favorites.length > 0
  const hasRecent = recent.length > 0
  const favList = useMemo(()=> favorites, [favorites])
  const recentList = useMemo(()=> recent, [recent])
  return (
    <div className="container">
      <div className="h1">我的配方</div>
      <div className="text" style={{marginBottom:12}}>收藏与最近生成的配方集中在此，点击查看详情或生成变体。</div>

      <section className="card">
        <div className="h2" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span>收藏</span>
          {hasFav && <span className="text" style={{fontSize:12}}>共 {favList.length} 条</span>}
        </div>
        {hasFav ? (
          <div className="grid" style={{gridTemplateColumns:'repeat(2, 1fr)'}}>
            {favList.map((r)=> (
              <div key={r.name} className="card" style={{padding:8}}>
                <div className="h3">{r.name} <span className="chip">{r.estimatedABV}% ABV</span></div>
                <div className="text" style={{margin:'4px 0 8px'}}>{r.story}</div>
                <div className="text">{r.ingredients.length} 种材料 · 总量 {formatTotal(unit, r.totalMl)}</div>
                <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:8}}>
                  <button className="btn" onClick={()=> nav(`/result?name=${encodeURIComponent(r.name)}`)}>查看详情</button>
                  <button className="btn" onClick={()=> removeFavorite(r.name)}>移出收藏</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text">暂无收藏。生成结果页点击“收藏”即可加入。</div>
        )}
      </section>

      <section className="card">
        <div className="h2" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span>最近</span>
          {hasRecent && <span className="text" style={{fontSize:12}}>共 {recentList.length} 条</span>}
        </div>
        {hasRecent ? (
          <div className="grid" style={{gridTemplateColumns:'repeat(2, 1fr)'}}>
            {recentList.map((r, idx)=> (
              <div key={`${r.name}-${idx}`} className="card" style={{padding:8}}>
                <div className="h3">{r.name} <span className="chip">{r.estimatedABV}% ABV</span></div>
                <div className="text" style={{margin:'4px 0 8px'}}>{r.story}</div>
                <div className="text">{r.ingredients.length} 种材料 · 总量 {formatTotal(unit, r.totalMl)}</div>
                <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:8}}>
                  <button className="btn" onClick={()=> nav(`/result?name=${encodeURIComponent(r.name)}`)}>查看详情</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text">暂无最近生成记录。返回首页生成一杯吧。</div>
        )}
      </section>
    </div>
  )
}

function formatTotal(unit:'ml'|'oz', ml:number){
  if (unit==='ml') return `${ml} ml`
  return `${(ml/29.5735).toFixed(2)} oz`
}