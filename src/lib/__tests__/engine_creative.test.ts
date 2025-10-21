import { describe, it, expect } from 'vitest'
import { generateRecipeCreative, microTuneAmounts } from '../engine_creative'
import type { Ingredient, FlavorVector } from '../types'
import rules from '@config/generation_rules.json'

const dims = ['sweet','sour','bitter','aroma','fruit','spicy','body'] as const

describe('generateRecipeCreative', () => {
  it('throws when moodKey not found', () => {
    expect(() => generateRecipeCreative({ moodKey: 'unknown' })).toThrow()
  })

  it('returns a recipe with basic shape', () => {
    const r = generateRecipeCreative({ moodKey: 'happy' })
    expect(r).toBeTruthy()
    expect(r.name).toBeTypeOf('string')
    expect(r.method).toBeTypeOf('string')
    expect(r.glass).toBeTypeOf('string')
    expect(r.ingredients).toBeInstanceOf(Array)
    expect(r.flavor).toBeTypeOf('object')

    for (const k of dims){
      expect(r.flavor[k]).toBeGreaterThanOrEqual(0)
      expect(r.flavor[k]).toBeLessThanOrEqual(1)
    }
  })

  it('respects NA mode by setting ABV to 0 for ingredients', () => {
    const r = generateRecipeCreative({ moodKey: 'happy', na: true })
    expect(r.estimatedABV).toBe(0)
    for (const ing of r.ingredients){
      expect(ing.abv || 0).toBe(0)
    }
  })

  it('reduces sweetness when lowSugar is true', () => {
    const rNormal = generateRecipeCreative({ moodKey: 'happy' })
    const rLowSugar = generateRecipeCreative({ moodKey: 'happy', lowSugar: true })
    expect(rLowSugar.flavor.sweet).toBeLessThanOrEqual(rNormal.flavor.sweet)
  })
})

// ---- micro tuning tests ----
function computeFlavor(list: Ingredient[], amts: number[]): FlavorVector{
  const out: FlavorVector = { sweet:0,sour:0,bitter:0,aroma:0,fruit:0,spicy:0,body:0 }
  const sum = Math.max(1, amts.reduce((a,b)=> a+b, 0))
  const KEYS: (keyof FlavorVector)[] = ['sweet','sour','bitter','aroma','fruit','spicy','body']
  for (let i=0;i<list.length;i++){
    const f = (list[i].flavors||{}) as Partial<FlavorVector>
    const w = amts[i]/sum
    for (const k of KEYS){ out[k] = Math.max(0, Math.min(1, out[k] + w * Number(f[k]||0))) }
  }
  return out
}

describe('microTuneAmounts', () => {
  const list: Ingredient[] = [
    { name:'Gin', id:'gin', category:'base', abv:40, flavors: { aroma:0.6, bitter:0.1, sweet:0.1, sour:0.1, fruit:0.2, spicy:0.2, body:0.6 } },
    { name:'Lemon', id:'lemon', category:'citrus', abv:0, flavors: { sour:0.8, aroma:0.3, fruit:0.6, sweet:0.05, body:0.2 } },
    { name:'Simple Syrup', id:'syrup', category:'sweetener', abv:0, flavors: { sweet:0.9, body:0.1 } },
    { name:'Aromatic Bitters', id:'bitters', category:'bitters', abv:0, flavors: { bitter:0.9, aroma:0.7, body:0.1 } },
  ]
  const roleDefs = [
    { role:'base', ml:50 },
    { role:'citrus', ml:25 },
    { role:'sweetener', ml:20 },
    { role:'bitters', ml:2 },
  ]
  const amounts = roleDefs.map(r=> Number(r.ml||0))

  it('keeps total sum unchanged when keepTotal=true', () => {
    const target: FlavorVector = { sweet:0.35, sour:0.55, bitter:0.15, aroma:0.4, fruit:0.3, spicy:0.2, body:0.5 }
    const tuned = microTuneAmounts(list, roleDefs, amounts, target, { iterations:2, stepMl:5, keepTotal:true })
    const s0 = amounts.reduce((a,b)=> a+b, 0)
    const s1 = tuned.reduce((a,b)=> a+b, 0)
    expect(s1).toBe(s0)
  })

  it('reduces max-dimension flavor error toward target', () => {
    const target: FlavorVector = { sweet:0.30, sour:0.60, bitter:0.18, aroma:0.45, fruit:0.30, spicy:0.20, body:0.50 }
    const cur = computeFlavor(list, amounts)
    // find max error dimension excluding body
    const KEYS: (keyof FlavorVector)[] = ['sweet','sour','bitter','aroma','fruit','spicy']
    let maxK: keyof FlavorVector = 'sweet'
    let maxErr = -1
    for (const k of KEYS){ const e = Math.abs(Number(target[k]||0) - Number(cur[k]||0)); if (e > maxErr){ maxErr = e; maxK = k } }

    const tuned = microTuneAmounts(list, roleDefs, amounts, target, { iterations:2, stepMl:5, keepTotal:true })
    const cur2 = computeFlavor(list, tuned)
    const errBefore = Math.abs(Number(target[maxK]||0) - Number(cur[maxK]||0))
    const errAfter = Math.abs(Number(target[maxK]||0) - Number(cur2[maxK]||0))
    expect(errAfter).toBeLessThanOrEqual(errBefore)
  })

  it('actually adjusts some role amounts', () => {
    const target: FlavorVector = { sweet:0.25, sour:0.65, bitter:0.20, aroma:0.40, fruit:0.30, spicy:0.20, body:0.5 }
    const tuned = microTuneAmounts(list, roleDefs, amounts, target, { iterations:2, stepMl:5, keepTotal:true })
    // at least one amount changed
    const changed = tuned.some((v, i) => v !== amounts[i])
    expect(changed).toBe(true)
  })
})

describe('naming v4 rules and bilingual output', () => {
  it('produces bilingual title structure "ZH (EN)"', () => {
    const r = generateRecipeCreative({ moodKey: 'happy' })
    expect(r.name).toMatch(/\(.+\)/)
    const zh = r.name.split('(')[0].trim()
    const en = r.name.substring(r.name.indexOf('(')+1, r.name.lastIndexOf(')')).trim()
    expect(zh.length).toBeGreaterThan(0)
    expect(en.length).toBeGreaterThan(0)
  })

  it('narrative includes EN segment', () => {
    const r = generateRecipeCreative({ moodKey: 'happy' })
    expect(r.story).toContain('EN:')
    expect(r.story).toMatch(/aroma|fruit|sour|sweet|bitter/i)
  })

  it('respects connector sanitization at edges', () => {
    const r = generateRecipeCreative({ moodKey: 'happy' })
    const zh = r.name.split('(')[0].trim()
    expect(zh).not.toMatch(/^[·之与的]/)
    expect(zh).not.toMatch(/[·之与的]$/)
  })

  it('respects naming length control roughly', () => {
    const maxLen = Number((rules?.naming_v2?.max_len) || 12)
    const r = generateRecipeCreative({ moodKey: 'happy' })
    const zh = r.name.split('(')[0].trim()
    // 中文名长度不超过配置的两倍（考虑前缀和样式组合的边界情况）
    expect(zh.length).toBeLessThanOrEqual(maxLen * 2)
  })

  it('NA mode filters na_banned_terms from Chinese name', () => {
    const banned: string[] = Array.isArray(rules?.naming_v2?.na_banned_terms) ? rules.naming_v2.na_banned_terms : []
    const r = generateRecipeCreative({ moodKey: 'happy', na: true })
    const zh = r.name.split('(')[0].trim()
    for (const t of banned){
      expect(zh).not.toContain(t)
    }
  })
})