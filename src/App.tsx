import { useMemo, useState, useEffect } from 'react'
import MoodGrid from './components/MoodGrid'
import TastePanel from './components/TastePanel'
import ModeToggles from './components/ModeToggles'
import InventoryOverlay from './components/InventoryOverlay'
import ResultCard from './components/ResultCard'
import ShareOverlay from './components/ShareOverlay'
import ResultOverlay from './components/ResultOverlay'
import { generateRecipe } from './lib/generator'
import { generateRecipeCorpus } from './lib/engine_corpus'
import type { FlavorVector } from './lib/types'
import { track } from './lib/analytics'
import { useSettingsStore } from './stores/settingsStore'
import { useRecipesStore } from './stores/recipesStore'
import { useInventoryStore } from './stores/inventoryStore'
import { FlavorRadar } from './components/FlavorRadar'
import { finalizeRecipe } from './lib/verify'
import { generateRecipeCreative } from './lib/engine_creative'

export default function App(){
  const [mood, setMood] = useState<string>('happy')
  const defaultTaste: Partial<FlavorVector> = {
    sweet: 50,
    sour: 50,
    bitter: 50,
    aroma: 50,
    fruit: 50,
    spicy: 50,
    body: 50,
  }
  const [taste, setTaste] = useState<Partial<FlavorVector>>(defaultTaste)
  const { unit, naMode, lowSugar, setUnit, setNaMode, setLowSugar, allergies } = useSettingsStore()
  const { items: inventoryItems, setItems: setInventoryItems } = useInventoryStore()
  const { addFavorite, pushRecent } = useRecipesStore()
  const [useInventory, setUseInventory] = useState(false)
  const [genMode, setGenMode] = useState<'classic'|'corpus'|'creative'>('classic')
  const [showInventory, setShowInventory] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [recipe, setRecipe] = useState(()=> ({ ...generateRecipe({ moodKey: mood }), unit }))
  const [toast, setToast] = useState<string>('')
  const [prevSweet, setPrevSweet] = useState<number|undefined>(undefined)
  const [generating, setGenerating] = useState<boolean>(false)
  const [resultOpen, setResultOpen] = useState<boolean>(false)
  const [genProgress, setGenProgress] = useState<number>(0)
  const [genStage, setGenStage] = useState<string>('')

  const canGenerate = useMemo(()=> !!mood, [mood])

  // 实时雷达预览向量（将滑杆 0–100 归一化为 0–1）
  const tastePreviewVector = useMemo(()=> ({
    sweet: Math.max(0, Math.min(1, Number(taste.sweet ?? 50)/100)),
    sour: Math.max(0, Math.min(1, Number(taste.sour ?? 50)/100)),
    bitter: Math.max(0, Math.min(1, Number(taste.bitter ?? 50)/100)),
    aroma: Math.max(0, Math.min(1, Number(taste.aroma ?? 50)/100)),
    fruit: Math.max(0, Math.min(1, Number(taste.fruit ?? 50)/100)),
    spicy: Math.max(0, Math.min(1, Number(taste.spicy ?? 50)/100)),
    body: Math.max(0, Math.min(1, Number(taste.body ?? 50)/100)),
  }), [taste])

  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(()=>{
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  },[])
  const isSm = vw <= 600
  const columns = isSm ? '1fr' : '1fr'
  const [microTuneEnabled, setMicroTuneEnabled] = useState<boolean>(true)
  const [microTuneIntensity, setMicroTuneIntensity] = useState<number>(2)

  function runGenerationFlow({ variant }: { variant?: boolean } = {}){
    const baseOpts = { moodKey: mood, taste, na: naMode, lowSugar, allergies, inventoryItems, preferInventory: useInventory }
    track(variant ? 'generate_variant_start' : 'generate_start',{ mood, taste, na: naMode, lowSugar, useInventory, mode: genMode })
    setGenerating(true)
    setResultOpen(!!variant)
    setGenStage('准备配方...')
    setGenProgress(6)

    setTimeout(()=>{
      setGenStage('生成初稿...')
      const base = genMode === 'corpus'
        ? generateRecipeCorpus(baseOpts)
        : (genMode === 'creative'
          ? generateRecipeCreative({ ...baseOpts, microTune: { enabled: microTuneEnabled, intensity: microTuneIntensity } })
          : generateRecipe(baseOpts))
      setGenProgress(35)

      setTimeout(()=>{
        setGenStage('校验与补全材料...')
        const verified = finalizeRecipe(base, { inventoryItems, preferInventory: useInventory, na: naMode, allergies })
        setGenProgress(70)

        setTimeout(()=>{
          setGenStage('计算 ABV 与总量...')
          const withUnit = { ...verified, unit }
          setRecipe(withUnit)
          pushRecent(withUnit)
          setGenProgress(92)

          setTimeout(()=>{
            setGenStage('完成')
            setGenProgress(100)
            setGenerating(false)
            if (!variant) setResultOpen(true)
            track(variant ? 'generate_variant_done' : 'generate_done',{ name: withUnit.name, template: withUnit.template, method: withUnit.method, glass: withUnit.glass, ice: withUnit.ice, abv: withUnit.estimatedABV, totalMl: withUnit.totalMl, mode: genMode })
            if (variant) setToast('已生成变体')
            setTimeout(()=>{ setGenStage(''); setGenProgress(0) }, 500)
          }, 450)
        }, 500)
      }, 500)
    }, 400)
  }

  return (
    <div className="container">
      <header style={{marginBottom:12}}>
        <div className="h1">调酒小精灵</div>
        <div className="h2">选择心情，微调口味，然后生成你的鸡尾酒</div>
      </header>
      <section className="card">
        <div className="h2">心情选择</div>
        <MoodGrid selected={mood} onSelect={(m)=>{ track('mood_select',{ mood: m }); setMood(m) }} />
      </section>
      <section style={{display:'grid', gridTemplateColumns: columns, gap:12}}>
        <TastePanel compact={isSm} values={taste} lowSugar={lowSugar} onChange={(next)=>{ track('taste_adjust',{ next }); setTaste(next) }} />
      </section>
      <section className="card">
        <div className="h2">风味雷达预览</div>
        <FlavorRadar size={isSm ? 200 : 240} vector={tastePreviewVector as FlavorVector} />
      </section>
      <ModeToggles na={naMode} lowSugar={lowSugar} useInventory={useInventory} onChange={(n)=>{
        if (n.na!==undefined) setNaMode(!!n.na)
        if (n.lowSugar!==undefined) {
          if (n.lowSugar) {
            const current = Number(taste.sweet ?? 50)
            setPrevSweet(current)
            setLowSugar(true)
            setTaste(prev => ({ ...prev, sweet: Math.min(current, 30) }))
            track('toggle_low_sugar', { to: true, prevSweet: current })
          } else {
            setLowSugar(false)
            setTaste(prev => ({ ...prev, sweet: prevSweet ?? 50 }))
            track('toggle_low_sugar', { to: false, restoreSweet: prevSweet ?? 50 })
          }
        }
        if (n.useInventory!==undefined) setUseInventory(!!n.useInventory)
      }} />

      <div className="switches card" style={{marginTop:8}}>
        <label className="chip"><input type="radio" name="genmode" checked={genMode==='classic'} onChange={()=>{ track('toggle_gen_mode',{ to:'classic' }); setGenMode('classic') }} /> 经典生成模式</label>
        <label className="chip"><input type="radio" name="genmode" checked={genMode==='corpus'} onChange={()=>{ track('toggle_gen_mode',{ to:'corpus' }); setGenMode('corpus') }} /> 语料生成模式</label>
        <label className="chip"><input type="radio" name="genmode" checked={genMode==='creative'} onChange={()=>{ track('toggle_gen_mode',{ to:'creative' }); setGenMode('creative') }} /> 创意生成模式</label>
      </div>

      <div className="card" style={{marginTop:8, display:'flex', alignItems:'center', gap:12}}>
        <label className="chip">
          <input type="checkbox" checked={microTuneEnabled} onChange={e=> setMicroTuneEnabled(e.currentTarget.checked)} />
          启用配比微调
        </label>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span className="text">强度</span>
          <input type="range" min={1} max={3} step={1} value={microTuneIntensity} onChange={e=> setMicroTuneIntensity(Number(e.currentTarget.value))} />
          <span className="text">{microTuneIntensity===1 ? '低' : microTuneIntensity===2 ? '中' : '高'}</span>
        </div>
      </div>

      <div style={{display:'flex', gap:8}}>
        <button className="btn" disabled={!canGenerate || generating} onClick={()=>{
          runGenerationFlow({ variant: false })
        }}>开始调制！</button>
        <button className="btn" onClick={()=>{ track('inventory_open'); setShowInventory(true) }}>管理库存</button>
      </div>

      <section style={{marginTop:16}}>
        {generating && !resultOpen ? (
          <div className="card" aria-busy="true">
            <div className="h2" style={{marginBottom:8}}>正在生成配方...</div>
            <div className="text" style={{marginBottom:6}}>{genStage}</div>
            <div style={{height:10, background:'#eee', borderRadius:9999, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${Math.max(0, Math.min(100, genProgress))}%`, background:'var(--primary)'}}></div>
            </div>
          </div>
        ) : null}
      </section>

      {toast && <div className="toast">{toast}</div>}
      <InventoryOverlay open={showInventory} onClose={()=> setShowInventory(false)} onSave={(items)=>{ setInventoryItems(items); track('inventory_save',{ count: items.length }); setShowInventory(false); setToast('库存已保存'); setTimeout(()=> setToast(''), 1500); }} />
      <ResultOverlay
        open={resultOpen}
        recipe={recipe}
        na={naMode}
        lowSugar={lowSugar}
        generating={generating}
        progress={genProgress}
        stage={genStage}
        onUnitToggle={()=> { const next = unit==='ml'?'oz':'ml'; track('unit_toggle',{ next }); setUnit(next); setRecipe(prev=> ({ ...prev, unit: next })) }}
        onAction={(act)=>{
          track('result_action',{ action: act })
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
              runGenerationFlow({ variant: true })
            } break
          }
          setTimeout(()=> setToast(''), 1500)
        }}
        onClose={()=> setResultOpen(false)}
      />
      <ShareOverlay open={shareOpen} recipe={recipe} onClose={()=> setShareOpen(false)} />
    </div>
  )
}