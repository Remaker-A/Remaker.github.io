import React from 'react'

export function Badge({ children, onClick, style }: { children: React.ReactNode; onClick?: ()=>void; style?: React.CSSProperties }){
  return <span className="chip" style={style} onClick={onClick}>{children}</span>
}