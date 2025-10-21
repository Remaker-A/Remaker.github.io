type Props = {
  na: boolean
  lowSugar: boolean
  useInventory: boolean
  onChange: (next: { na?: boolean; lowSugar?: boolean; useInventory?: boolean }) => void
}

import { track } from '../lib/analytics'

export default function ModeToggles({ na, lowSugar, useInventory, onChange }: Props){
  return (
    <div className="switches card">
      <label className="chip"><input type="checkbox" checked={na} onChange={e=>{ track('toggle_na',{value:e.target.checked}); onChange({na:e.target.checked}) }}/> 无酒精</label>
      <label className="chip"><input type="checkbox" checked={lowSugar} onChange={e=>{ track('toggle_low_sugar',{value:e.target.checked}); onChange({lowSugar:e.target.checked}) }}/> 低糖</label>
      <label className="chip"><input type="checkbox" checked={useInventory} onChange={e=>{ track('toggle_use_inventory',{value:e.target.checked}); onChange({useInventory:e.target.checked}) }}/> 使用库存</label>
    </div>
  )
}