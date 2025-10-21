import React from 'react'

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange:(next:boolean)=>void }){
  return (
    <button
      className="chip"
      aria-pressed={checked}
      onClick={()=> onChange(!checked)}
      style={{ borderColor: checked ? 'var(--primary)' : 'var(--border)', color: checked ? 'var(--primary)' : 'inherit' }}
    >
      {label}
    </button>
  )
}

export function SwitchGroup({ children }: { children: React.ReactNode }){
  return <div className="switches">{children}</div>
}