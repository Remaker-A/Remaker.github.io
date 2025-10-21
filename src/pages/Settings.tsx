import { useSettingsStore } from '../stores/settingsStore'

export default function Settings(){
  const { unit, naMode, lowSugar, allergies, setUnit, setNaMode, setLowSugar, setAllergies } = useSettingsStore()
  const allergyOptions = [
    { key: 'nuts', label: '坚果' },
    { key: 'dairy', label: '乳制品' },
    { key: 'egg', label: '蛋类' },
    { key: 'gluten', label: '麸质' },
    { key: 'shellfish', label: '贝类' },
    { key: 'soy', label: '大豆' },
  ]
  return (
    <div className="container">
      <div className="h1">设置</div>
      <div className="card">
        <div className="h2">单位</div>
        <div className="switches">
          <label className="chip">
            <input type="radio" name="unit" checked={unit==='ml'} onChange={()=>setUnit('ml')} /> ml
          </label>
          <label className="chip">
            <input type="radio" name="unit" checked={unit==='oz'} onChange={()=>setUnit('oz')} /> oz
          </label>
        </div>
      </div>
      <div className="card">
        <div className="h2">偏好</div>
        <label className="chip"><input type="checkbox" checked={naMode} onChange={e=>setNaMode(e.target.checked)} /> 无酒精模式</label>
        <label className="chip"><input type="checkbox" checked={lowSugar} onChange={e=>setLowSugar(e.target.checked)} /> 低糖模式</label>
      </div>
      <div className="card">
        <div className="h2">过敏项</div>
        <div className="switches" aria-label="过敏项选择">
          {allergyOptions.map(opt => (
            <label key={opt.key} className="chip">
              <input
                type="checkbox"
                checked={allergies.includes(opt.key)}
                onChange={(e)=>{
                  const checked = e.target.checked
                  setAllergies(checked ? [...allergies, opt.key] : allergies.filter(a=>a!==opt.key))
                }}
              /> {opt.label}
            </label>
          ))}
        </div>
        <div className="text" style={{marginTop:8, color:'var(--muted)'}}>我们会在生成时避开含有所选过敏原的材料。</div>
      </div>
    </div>
  )
}