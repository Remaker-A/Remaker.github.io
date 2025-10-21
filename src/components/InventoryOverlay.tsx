import { useEffect, useMemo, useState } from 'react'
import { loadIngredients } from '../lib/data'
import { useInventoryStore } from '../stores/inventoryStore'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (items: string[]) => void
}

function sortCategories(cats: string[]): string[] {
  const order = [
    'base',
    'spirit',
    'liquor',
    'juice',
    'syrup',
    'mixer',
    'soft',
    'bitters',
    'herb',
    'garnish',
    'na_base',
    'unknown',
  ]
  return [...cats].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

// 中文分类显示映射
function catLabel(cat: string){
  const map: Record<string, string> = {
    all: '全部',
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
  return map[cat] || cat
}

export default function InventoryOverlay({ open, onClose, onSave }: Props){
  const { items } = useInventoryStore()
  const allIngredients = useMemo(() => loadIngredients(), [])
  const categories = useMemo(() => sortCategories(Array.from(new Set(allIngredients.map(i => i.category || 'unknown')))), [allIngredients])

  const [selected, setSelected] = useState<string[]>(items || [])
  const [activeCat, setActiveCat] = useState<string>('all')
  const [q, setQ] = useState('')

  // 视口宽度用于响应式布局与合理尺寸控制
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(()=>{
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  },[])
  const isSm = vw <= 600

  useEffect(() => {
    if (open) {
      setSelected(items || [])
    }
  }, [open, items])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return allIngredients.filter(i => {
      const inCat = activeCat === 'all' ? true : (i.category === activeCat)
      if (!inCat) return false
      if (query.length === 0) return true
      const idMatch = (i.id || '').toLowerCase().includes(query)
      const nameMatch = (i.name || '').toLowerCase().includes(query)
      const tagMatch = Array.isArray((i as any).tags) ? ((i as any).tags.join(' ').toLowerCase().includes(query)) : false
      return idMatch || nameMatch || tagMatch
    })
  }, [allIngredients, activeCat, q])

  const toggle = (val: string) => {
    setSelected(s => s.includes(val) ? s.filter(x => x !== val) : [...s, val])
  }

  // 键盘切换支持（Enter/Space）
  const onCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, val: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(val)
    }
  }

  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{ maxWidth: isSm ? 360 : 900, width: '90%', maxHeight: '80vh', overflowY: 'auto', borderRadius: 12 }}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div className="h2">我的库存</div>
          <button className="btn" onClick={onClose} aria-label="关闭库存管理">关闭</button>
        </div>

        <div style={{display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px'}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索材料（名称/标签）" className="input" style={{flex:1}} />
        </div>

        <div style={{display:'flex', gap:8, overflowX:'auto', paddingBottom:8}}>
          <button className="chip" onClick={()=>setActiveCat('all')} style={{background: activeCat==='all' ? 'var(--primary)' : 'transparent', color: activeCat==='all' ? '#fff' : 'var(--text)'}}>{catLabel('all')}</button>
          {categories.map(cat => (
            <button key={cat} className="chip" onClick={()=>setActiveCat(cat)} style={{background: activeCat===cat ? 'var(--primary)' : 'transparent', color: activeCat===cat ? '#fff' : 'var(--text)'}}>{catLabel(cat)}</button>
          ))}
        </div>

        <div className="grid" style={{gridTemplateColumns: `repeat(${isSm ? 2 : 3}, 1fr)`, gap:8}}>
          {filtered.map(i => {
            const val = i.id || i.name
            const checked = selected.includes(val)
            return (
              <div
                key={val}
                className="card"
                role="button"
                tabIndex={0}
                onClick={()=> toggle(val)}
                onKeyDown={(e)=> onCardKeyDown(e, val)}
                aria-pressed={checked}
                style={{
                  padding:8,
                  cursor:'pointer',
                  borderColor: checked ? 'var(--primary)' : 'var(--border)',
                  background: checked ? 'rgba(99,102,241,0.08)' : 'transparent'
                }}
              >
                <div className="h3" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <span>{i.name}</span>
                  {checked && <span className="hint" style={{color:'var(--primary)'}}>已选</span>}
                </div>
                <div className="hint" style={{fontSize:12, opacity:0.7}}>{catLabel(i.category || 'unknown')}</div>
              </div>
            )
          })}
        </div>

        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
          <button className="btn" onClick={()=> onSave(selected)}>保存</button>
        </div>
      </div>
    </div>
  )
}