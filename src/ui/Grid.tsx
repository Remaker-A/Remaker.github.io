import React from 'react'

type GridProps = React.HTMLAttributes<HTMLDivElement> & {
  columns?: number | string
  children?: React.ReactNode
}

export function Grid({ className = '', columns, style, children, ...rest }: GridProps){
  const gridStyle = { display:'grid', gap:12, ...(columns? { gridTemplateColumns: typeof columns==='number' ? `repeat(${columns}, 1fr)` : columns } : {}), ...(style || {}) }
  return <div className={`grid ${className}`} style={gridStyle} {...rest}>{children}</div>
}