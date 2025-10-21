import React, { useEffect, useState } from 'react'

export function Toast({ message, visible, duration = 1500, onHide }: { message: string; visible: boolean; duration?: number; onHide?: ()=>void }){
  const [show, setShow] = useState(visible)
  useEffect(()=>{ setShow(visible) }, [visible])
  useEffect(()=>{
    if (!show) return
    const t = setTimeout(()=>{ setShow(false); onHide?.() }, duration)
    return ()=> clearTimeout(t)
  }, [show, duration, onHide])
  if (!show) return null
  return <div className="toast">{message}</div>
}