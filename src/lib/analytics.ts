type AnalyticsEvent = { name: string; params?: Record<string, any>; ts: number }

let queue: AnalyticsEvent[] = []
let enabled = true

export function initAnalytics(){
  enabled = true
}

export function track(name: string, params?: Record<string, any>){
  if (!enabled) return
  const evt = { name, params, ts: Date.now() }
  queue.push(evt)
  // In production, send to your provider here
  console.log('[analytics]', name, params || {})
}

export function flush(){
  const payload = queue.splice(0, queue.length)
  return payload
}