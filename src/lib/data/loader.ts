import type { FlavorVector, MoodProfile, Ingredient } from '../types'
import moodsRaw from '@data/moods.json'
import ingredientsRaw from '@data/ingredients.json'
import rulesRaw from '@config/generation_rules.json'

function remapFlavorKeys<T extends Record<string, any>>(src: T): Partial<FlavorVector> {
  const out: Partial<FlavorVector> = {}
  // Map common keys; convert 'spice' -> 'spicy'
  ;(['sweet','sour','bitter','fruit','aroma','body'] as const).forEach(k => {
    const v = src[k]
    if (v !== undefined) (out as any)[k] = Number(v)
  })
  if (src['spice'] !== undefined) (out as any)['spicy'] = Number(src['spice'])
  if (src['spicy'] !== undefined) (out as any)['spicy'] = Number(src['spicy'])
  return out
}

export function normalizeMood(m: any): MoodProfile {
  return {
    key: m.key || m.id,
    displayName: m.displayName || m.name || m.id,
    targetFlavorBias: remapFlavorKeys(m.targetFlavorBias || {}),
    methodBias: Array.isArray(m.methodBias) ? m.methodBias : (m.methodBias ? Object.keys(m.methodBias) : []),
    glassCandidates: m.glassCandidates || [],
    baseCandidates: m.baseCandidates || [],
    templateCandidates: m.templateCandidates || [],
    abvPreference: typeof m.abvPreference === 'object' ? m.abvPreference : undefined,
    namingHints: Array.isArray(m.namingHints) ? m.namingHints : [],
  }
}

export function normalizeIngredient(i: any): Ingredient {
  const flavorsSrc = i.flavors || i.flavorVector || {}
  return {
    id: i.id,
    name: i.name || i.id,
    category: i.category || 'unknown',
    abv: typeof i.abv === 'number' ? (i.abv > 1 ? i.abv : Math.round(i.abv * 100)) : undefined,
    allergens: Array.isArray(i.allergens) ? i.allergens : [],
    flavors: remapFlavorKeys(flavorsSrc),
  }
}

// Normalize moods across src/data and development/data structures
export function loadMoods(): MoodProfile[] {
  const raw: any = moodsRaw as any
  const arr = raw?.moods || raw?.profiles || raw || []
  const normalized = (arr as any[]).map(normalizeMood)
  // Append extra moods if missing to keep even count and enrich choices
  const extrasRaw = [
    {
      id: 'angry',
      name: '生气',
      targetFlavorBias: { sweet: 0.2, sour: 0.4, bitter: 0.5, aroma: 0.3, fruit: 0.2, spice: 0.6, body: 0.6 },
      methodBias: ['stir','build'],
      glassCandidates: ['rocks'],
      baseCandidates: ['Whiskey','Rum'],
      templateCandidates: ['OldFashioned','Highball'],
      abvPreference: { target: 16, range: [12, 22] },
      namingHints: ['火焰','烈']
    },
    {
      id: 'excited',
      name: '兴奋',
      targetFlavorBias: { sweet: 0.55, sour: 0.6, bitter: 0.2, aroma: 0.5, fruit: 0.7, spice: 0.3, body: 0.45 },
      methodBias: ['shake'],
      glassCandidates: ['highball','collins','coupe'],
      baseCandidates: ['Vodka','Gin','Rum'],
      templateCandidates: ['Highball','Collins','Sour'],
      abvPreference: { target: 12, range: [8, 16] },
      namingHints: ['火花','跃动']
    }
  ]
  const extras = extrasRaw.map(normalizeMood)
  const existingKeys = new Set(normalized.map(m => m.key))
  const out = normalized.concat(extras.filter(m => !existingKeys.has(m.key)))
  return out
}

// Normalize ingredients; abv to percentage (0-100)
export function loadIngredients(): Ingredient[] {
  const raw: any = ingredientsRaw as any
  const arr = raw?.ingredients || raw || []
  return (arr as any[]).map(normalizeIngredient)
}

export function loadRules(): any {
  return rulesRaw as any
}

// Index builders
export function createMoodIndexByKey(profiles: MoodProfile[]): Record<string, MoodProfile> {
  const idx: Record<string, MoodProfile> = {}
  for (const m of profiles) idx[m.key] = m
  return idx
}

export function createIngredientIndexByCategory(ings: Ingredient[]): Record<string, Ingredient[]> {
  const idx: Record<string, Ingredient[]> = {}
  for (const i of ings) {
    const k = i.category || 'unknown'
    ;(idx[k] ||= []).push(i)
  }
  return idx
}

export function createIngredientIndexByName(ings: Ingredient[]): Record<string, Ingredient> {
  const idx: Record<string, Ingredient> = {}
  for (const i of ings) idx[i.name.toLowerCase()] = i
  return idx
}

export function createIngredientIndexById(ings: Ingredient[]): Record<string, Ingredient> {
  const idx: Record<string, Ingredient> = {}
  for (const i of ings) if (i.id) idx[i.id] = i
  return idx
}

// Simple flavor-based search (cosine-like similarity)
export function searchIngredientsByFlavor(target: Partial<FlavorVector>, ings: Ingredient[], topN = 10): Ingredient[] {
  function score(i: Ingredient){
    const src = i.flavors || {}
    let acc = 0
    let denomA = 0
    let denomB = 0
    const keys = ['sweet','sour','bitter','aroma','fruit','spicy','body'] as const
    for (const k of keys){
      const a = Number(target[k] ?? 0)
      const b = Number((src as any)[k] ?? 0)
      acc += a*b
      denomA += a*a
      denomB += b*b
    }
    const sim = acc / Math.max(1e-6, Math.sqrt(denomA) * Math.sqrt(denomB))
    return sim
  }
  return [...ings].sort((a,b)=> score(b) - score(a)).slice(0, topN)
}