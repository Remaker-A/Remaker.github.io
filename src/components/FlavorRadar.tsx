import React from 'react'
import type { FlavorVector, FlavorKey } from '../lib/types'

const dims: FlavorKey[] = ['sweet','sour','bitter','fruit','aroma','body','spicy']
const labels: Record<FlavorKey,string> = {
  sweet:'甜', sour:'酸', bitter:'苦', aroma:'花香', fruit:'果香', spicy:'气泡感', body:'酒感'
}

function polarToCartesian(cx:number, cy:number, r:number, angleRad:number){
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  }
}

export function FlavorRadar({ vector, size=200 }: { vector: FlavorVector; size?: number }){
  const center = size/2
  const radius = center - 12
  const step = (Math.PI*2)/dims.length
  const points = dims.map((k, i)=>{
    const val = Math.max(0, Math.min(1, vector[k]||0))
    const r = val * radius
    const ang = -Math.PI/2 + i*step
    return polarToCartesian(center, center, r, ang)
  })
  const path = points.map((p,i)=> (i===0? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ') + ' Z'

  const gridRings = [0.25,0.5,0.75,1]
  const axisLines = dims.map((_,i)=>{
    const ang = -Math.PI/2 + i*step
    const end = polarToCartesian(center, center, radius, ang)
    return <line key={i} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#ddd" strokeWidth={1} />
  })

  const labelsEls = dims.map((k,i)=>{
    const ang = -Math.PI/2 + i*step
    const pos = polarToCartesian(center, center, radius+10, ang)
    return <text key={k} x={pos.x} y={pos.y} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill="#666">{labels[k]}</text>
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g>
        {gridRings.map((r,i)=> (
          <circle key={i} cx={center} cy={center} r={r*radius} fill="none" stroke="#eee" />
        ))}
        {axisLines}
        <path d={path} fill="rgba(34, 197, 94, 0.35)" stroke="#22c55e" strokeWidth={2} />
      </g>
      {labelsEls}
    </svg>
  )
}