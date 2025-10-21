import { useState } from 'react'
import type { Recipe, FlavorVector } from '../lib/types'
import { FlavorRadar } from './FlavorRadar'
import { loadIngredients, loadMoods, loadRules, createIngredientIndexByName } from '../lib/data'
import { useSettingsStore } from '../stores/settingsStore'

// 详情展示映射
const METHOD_INFO: Record<string, { name: string; steps: string[] }> = {
  shake: {
    name: '摇制',
    steps: ['在摇杯中加入冰块','加入所有材料','摇晃 10–12 秒至杯壁冰凉','过滤入杯']
  },
  stir: {
    name: '搅拌',
    steps: ['在调酒杯中加入大冰','加入材料（先烈酒后辅料）','搅拌 20–30 秒至混合冰冷','过滤入杯']
  },
  build: {
    name: '直注',
    steps: ['在杯中加入冰块','依序倒入材料（先基酒后辅料）','轻轻搅拌融合']
  }
}

const GLASS_INFO: Record<string, { name: string; volume: string; desc: string }> = {
  coupe: { name: '鸡尾酒杯（Coupe）', volume: '150–180 ml', desc: '常用于摇制类，无冰上桌，杯口较宽，便于闻香。' },
  martini: { name: '马天尼杯', volume: '150–180 ml', desc: '锥形杯，适合无冰上桌的烈酒主导款。' },
  rocks: { name: '洛克杯（Rocks）', volume: '250–300 ml', desc: '直筒矮杯，适合加入大冰块或加厚口感的直饮。' },
  old_fashioned: { name: '老式杯', volume: '250–300 ml', desc: '与洛克杯近似，多用于搅拌类、短饮。' },
  highball: { name: '高球杯', volume: '300–400 ml', desc: '适合带气泡的长饮，容量大、利于保留清爽气泡感。' },
  collins: { name: '柯林杯', volume: '300–400 ml', desc: '与高球杯近似，适合直注类长饮。' },
  flute: { name: '香槟笛形杯', volume: '180–220 ml', desc: '狭长杯型，利于保留气泡与香气集中。' },
}

const ICE_INFO: Record<string, { name: string; desc: string }> = {
  strain_no_ice_or_fresh_ice: { name: '滤出不加冰 / 加新冰', desc: '摇制后滤出；可无冰上桌，也可换入新冰再上桌，避免融水影响口感。' },
  fresh_ice: { name: '新冰加杯', desc: '在上桌前向杯中加入新冰，保证冰洁与口感稳定。' },
  lots_of_ice: { name: '充足冰块', desc: '直注或长饮建议将杯中装满冰，维持清爽度与稀释平衡。' },
  crushed_ice: { name: '碎冰', desc: '适合热带风格直注类；融水较快、带来更清凉的口感。' },
  big_cube: { name: '大冰块', desc: '单块大冰用于矮杯搅拌类与直饮，融化慢、风味更稳定。' },
}

const ING_BY_NAME = createIngredientIndexByName(loadIngredients())
const MOODS = loadMoods()
const RULES = loadRules()

function catLabel(cat?: string){
  const map: Record<string, string> = {
    base: '基酒',
    spirit: '烈酒',
    liquor: '利口酒',
    juice: '果汁',
    syrup: '糖浆',
    mixer: '混合饮料',
    soft: '软饮',
    bitters: '苦精',
    herb: '香草',
    garnish: '装饰',
    na_base: '无酒精基底',
    unknown: '其他',
  }
  if (!cat) return '—'
  return map[cat] || cat
}
function getMethodInfo(key?: string){
  const k = String(key||'').toLowerCase()
  return METHOD_INFO[k] || { name: '通用方法', steps: ['按配方加料','搅拌或摇制至冰冷','过滤入杯'] }
}
function getGlassInfo(key?: string){
  const k = String(key||'').toLowerCase()
  return GLASS_INFO[k] || { name: `杯具：${key||'通用'}`, volume: '—', desc: '按配方推荐使用；若无对应杯具，可使用家中常见的透明杯替代。' }
}
function getIceInfo(key?: string){
  const k = String(key||'').toLowerCase()
  return ICE_INFO[k] || { name: `冰：${key||'按需'}`, desc: '根据制作方法选择是否加冰；如直注或长饮，建议使用充足干净冰块。' }
}

const KEYS: (keyof FlavorVector)[] = ['sweet','sour','bitter','aroma','fruit','spicy','body']
const KEY_LABEL: Record<keyof FlavorVector, string> = { sweet:'甜', sour:'酸', bitter:'苦', aroma:'香', fruit:'果', spicy:'辛', body:'醇' }
function clamp01(x: number){ return Math.max(0, Math.min(1, x)) }
function sim(target: Partial<FlavorVector>, actual: FlavorVector): number {
  let acc=0, denomA=0, denomB=0
  for (const k of KEYS){ const a=Number(target[k]??0), b=Number(actual[k]??0); acc+=a*b; denomA+=a*a; denomB+=b*b }
  return acc / Math.max(1e-6, Math.sqrt(denomA)*Math.sqrt(denomB))
}
// 新增：计算风味目标用于解释卡片
function topsDesc(t: Partial<FlavorVector>, n=3): string{
  const arr = KEYS.map(k => [k, Number(t[k]||0)] as [keyof FlavorVector, number])
  const top = arr.sort((a,b)=> b[1]-a[1]).slice(0,n)
  return top.map(([k,v])=> `${KEY_LABEL[k]} ${Math.round(v*100)}%`).join(' · ')
}
function computeTargets(recipe: Recipe): { nose: Partial<FlavorVector>; palate: Partial<FlavorVector>; finish: Partial<FlavorVector> }{
  const mood = MOODS.find(m=> m.key === recipe.mood)
  const base: Partial<FlavorVector> = (mood?.targetFlavorBias || {}) as Partial<FlavorVector>
  const palate = { ...base }
  let nose: Partial<FlavorVector> = { ...base }
  if (recipe.method === 'shake'){
    nose.aroma = clamp01(Number(nose.aroma||0) + 0.10)
    nose.fruit = clamp01(Number(nose.fruit||0) + 0.08)
  } else if (recipe.method === 'stir'){
    nose.aroma = clamp01(Number(nose.aroma||0) + 0.06)
    nose.sour = clamp01(Number(nose.sour||0) - 0.04)
  } else {
    nose.aroma = clamp01(Number(nose.aroma||0) + 0.04)
  }
  let finish: Partial<FlavorVector> = { ...base }
  finish.bitter = clamp01(Number(finish.bitter||0) + 0.08)
  finish.spicy = clamp01(Number(finish.spicy||0) + 0.06)
  finish.sweet = clamp01(Number(finish.sweet||0) - 0.06)
  return { nose, palate, finish }
}
function fmtPct(x: number){ return `${Math.round(x*100)}%` }

export default function ResultCard({ recipe, na, lowSugar, onUnitToggle, onAction }: { recipe: Recipe; na?: boolean; lowSugar?: boolean; onUnitToggle: ()=>void; onAction:(act:'save'|'share'|'variant')=>void }){
  const [displayMode, setDisplayMode] = useState<'graph'|'text'>('graph')
  const [explainOpen, setExplainOpen] = useState(false)
  const { unit } = useSettingsStore()

  const mInfo = getMethodInfo(recipe.method)
  const gInfo = getGlassInfo(recipe.glass)
  const iInfo = getIceInfo(recipe.ice)
  const garnishList = Array.isArray(recipe.garnish) ? recipe.garnish : []

  // 解释用风味目标与约束评估
  const targets = computeTargets(recipe)
  const scoreNose = sim(targets.nose, recipe.flavor)
  const scorePalate = sim(targets.palate, recipe.flavor)
  const scoreFinish = sim(targets.finish, recipe.flavor)
  const { allergies } = useSettingsStore()
  const allergySet = new Set((allergies||[]).map(a=> String(a).toLowerCase()))
  const allergyOk = (allergySet.size === 0) || recipe.ingredients.every(it => {
    const ref = ING_BY_NAME[String(it.name).toLowerCase()]
    const arr: string[] = Array.isArray(ref?.allergens) ? (ref!.allergens as string[]) : []
    for (const a of arr){ if (allergySet.has(String(a).toLowerCase())) return false }
    return true
  })
  const naOk = !na || recipe.ingredients.every(it => Number(it.abv||0) === 0)
  const lowSugarOk = !lowSugar || Number(recipe.flavor.sweet||0) <= 0.35

  return (
    <div className="card">
      <div className="h1">
        {recipe.name} <span className="chip">{recipe.estimatedABV}% ABV</span>
        {na ? <span className="chip">NA</span> : null}
        {lowSugar ? <span className="chip">低糖</span> : null}
      </div>
      <div className="text" style={{marginBottom:8}}>{recipe.story}</div>
      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:8}}>
        <span className="chip" style={{cursor:'pointer'}} onClick={()=> setDisplayMode('graph')}>展示：图示{displayMode==='graph'?' ✓':''}</span>
        <span className="chip" style={{cursor:'pointer'}} onClick={()=> setDisplayMode('text')}>展示：简洁{displayMode==='text'?' ✓':''}</span>
        <span className="chip" style={{cursor:'pointer'}} onClick={onUnitToggle}>单位：{recipe.unit}</span>
        <span className="chip" style={{cursor:'pointer'}} onClick={()=> setExplainOpen(o=>!o)}>风味弧线与解释{explainOpen?' ▼':' ▶'}</span>
      </div>

      {displayMode==='graph' ? (
        <div className="card" style={{padding:8}}>
          <div className="h2">风味雷达</div>
          <FlavorRadar size={220} vector={recipe.flavor} />
        </div>
      ) : null}

      {explainOpen ? (
        <div className="card" style={{padding:8, marginTop:8}}>
          <div className="h2">风味弧线与解释</div>
          <div className="text">入口（nose）目标：{topsDesc(targets.nose)}</div>
          <div className="text">匹配评分：{fmtPct(scoreNose)}</div>
          <div className="text" style={{marginTop:6}}>中段（palate）目标：{topsDesc(targets.palate)}</div>
          <div className="text">匹配评分：{fmtPct(scorePalate)}</div>
          <div className="text" style={{marginTop:6}}>尾段（finish）目标：{topsDesc(targets.finish)}</div>
          <div className="text">匹配评分：{fmtPct(scoreFinish)}</div>
          <div className="h3" style={{marginTop:8}}>约束满足情况</div>
          <div className="text">NA 模式：{na ? (naOk ? '满足' : '不满足') : '未开启'}</div>
          <div className="text">低糖偏好：{lowSugar ? (lowSugarOk ? '满足' : '未满足') : '未开启'}</div>
          <div className="text">过敏项：{allergies && allergies.length ? (allergyOk ? '满足' : '含过敏原') : '未设置'}</div>
        </div>
      ) : null}

      <div className="h2">材料清单</div>
      <table className="table" style={{marginTop:8}}>
        <thead>
          <tr><th>材料</th><th>类别</th><th>用量</th><th>ABV</th></tr>
        </thead>
        <tbody>
          {recipe.ingredients.map((it,i)=> {
            const ref = ING_BY_NAME[it.name.toLowerCase()]
            return (
              <tr key={i}>
                <td>{it.name}</td>
                <td>{catLabel(ref?.category)}</td>
                <td>{formatAmount(recipe.unit, it.amountMl)}</td>
                <td>{formatAbv(it.abv)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 装饰建议展示 */}
      <div className="h2" style={{marginTop:12}}>装饰建议</div>
      {garnishList.length ? (
        <div className="text">{garnishList.join('、')}</div>
      ) : (
        <div className="text">— 无</div>
      )}

      {/* 详细方法/杯具/冰建议 */}
      <div className="h2" style={{marginTop:12}}>制作方法</div>
      <div className="text" style={{marginBottom:6}}><strong>{mInfo.name}</strong></div>
      <ul className="text" style={{paddingLeft:18, marginTop:0}}>
        {mInfo.steps.map((s, i)=> (<li key={i}>{s}</li>))}
      </ul>

      <div className="h2" style={{marginTop:12}}>推荐杯具</div>
      <div className="text"><strong>{gInfo.name}</strong> · 容量 {gInfo.volume} · {gInfo.desc}</div>

      <div className="h2" style={{marginTop:12}}>冰的使用建议</div>
      <div className="text"><strong>{iInfo.name}</strong> · {iInfo.desc}</div>

      <div style={{display:'flex', gap:8, marginTop:12}}>
        <button className="btn" onClick={()=>onAction('save')}>保存</button>
        <button className="btn" onClick={()=>onAction('share')}>分享</button>
        <button className="btn" onClick={()=>onAction('variant')}>变体</button>
      </div>
    </div>
  )
}

function formatAmount(unit:'ml'|'oz', ml:number){
  if (unit==='ml') return `${ml} ml`
  const oz = ml/29.5735
  return `${oz.toFixed(2)} oz`
}

function formatAbv(abv?: number){
  if (typeof abv !== 'number') return '—'
  return `${Math.round(abv)}%`
}