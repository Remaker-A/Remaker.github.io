import type { FlavorVector, Ingredient, MoodProfile, Recipe } from './types'
import { loadMoods, loadIngredients, loadRules, createIngredientIndexByCategory, searchIngredientsByFlavor, createIngredientIndexById } from './data'

const FLAVOR_KEYS: (keyof FlavorVector)[] = ['sweet', 'sour', 'bitter', 'aroma', 'fruit', 'spicy', 'body']

const moods: MoodProfile[] = loadMoods()
const ingredients: Ingredient[] = loadIngredients()
const rules: any = loadRules()

const ING_BY_CAT = createIngredientIndexByCategory(ingredients)
const ING_BY_ID = createIngredientIndexById(ingredients)

function clamp01(n: number){ return Math.max(0, Math.min(1, n)) }
function toFlavorVector(bias: Partial<FlavorVector>): FlavorVector {
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(Number(bias[k] ?? 0)); return acc }, {} as FlavorVector)
}

function fromTaste(taste?: Partial<FlavorVector>): FlavorVector {
  return FLAVOR_KEYS.reduce((acc,k)=> {
    const pct = Number(taste?.[k] ?? 50)
    acc[k] = clamp01(pct/100)
    return acc
  }, {} as FlavorVector)
}

function mergeTarget(moodBias: Partial<FlavorVector>, taste?: Partial<FlavorVector>): FlavorVector {
  const m = toFlavorVector(moodBias || {})
  const t = fromTaste(taste)
  const fw = (rules?.fusion_weights || { mood: 0.7, taste: 0.3 })
  const MOOD_W = Number(fw.mood ?? 0.7)
  const TASTE_W = Number(fw.taste ?? 0.3)
  return FLAVOR_KEYS.reduce((acc,k)=> {
    acc[k] = clamp01(MOOD_W * m[k] + TASTE_W * t[k])
    return acc
  }, {} as FlavorVector)
}

function isSparkling(i: Ingredient){
  const name = (i.name || '').toLowerCase()
  const cat = (i.category || '').toLowerCase()
  if (cat === 'soft' || cat === 'mixer') return true
  return /soda|tonic|ginger|sparkling|cola|club|ale|beer/.test(name)
}

function toId(s: string){ return String(s).toLowerCase().replace(/\s+/g,'_') }

// 新增：心情模板限定是否允许起泡兜底；并对“angry”禁用
function allowsSparklingTemplate(tpl: string){
  const id = toId(tpl)
  return id === 'highball' || id === 'collins' || id === 'flute'
}
function moodAllowsSparklingFallback(mood: MoodProfile, tpl: string){
  if (String(mood.key).toLowerCase() === 'angry') return false
  if (allowsSparklingTemplate(tpl)) return true
  const cands = (mood.templateCandidates || []).map(s => toId(String(s)))
  return cands.some(id => allowsSparklingTemplate(id))
}

// Map legacy English inventory names to known ids for compatibility
const INV_NAME_MAP: Record<string,string> = {
  'vodka': 'vodka',
  'gin': 'gin',
  'rum': 'white_rum',
  'tequila': 'tequila_blanco',
  'whiskey': 'bourbon',
  'lime juice': 'lime_juice',
  'lemon juice': 'lemon_juice',
  'simple syrup': 'simple_syrup',
  'soda water': 'soda_water',
}

function normalizeInventoryIds(items?: string[]): string[] {
  if (!Array.isArray(items)) return []
  return items.map((s)=>{
    const raw = String(s).trim()
    const lower = raw.toLowerCase()
    if (ING_BY_ID[raw]) return raw
    if (ING_BY_ID[lower]) return lower
    if (INV_NAME_MAP[lower]) return INV_NAME_MAP[lower]
    return toId(lower)
  })
}

function filterByAllergies(pool: Ingredient[], allergies?: string[]): Ingredient[] {
  const set = new Set((allergies||[]).map(a=> String(a).toLowerCase()))
  if (set.size === 0) return pool
  return pool.filter(i => {
    const arr = (i.allergens || []).map(a=> String(a).toLowerCase())
    for (const a of arr){ if (set.has(a)) return false }
    return true
  })
}

function reorderByInventory(pool: Ingredient[], inventoryIds?: string[]): Ingredient[] {
  const set = new Set(normalizeInventoryIds(inventoryIds))
  if (set.size === 0) return pool
  return [...pool].sort((a,b)=> {
    const ai = a.id && set.has(a.id) ? 1 : 0
    const bi = b.id && set.has(b.id) ? 1 : 0
    return bi - ai
  })
}

function chooseTemplate(mood: MoodProfile, effPref: number, na: boolean): string{
  const catalog: string[] = Array.isArray(rules?.template_catalog) ? (rules.template_catalog.map((t: any)=> String(t.id))) : []
  if (na || effPref >= 0.6){
    const preferred = ['highball','collins']
    const found = preferred.find(p => catalog.some(id => id.toLowerCase() === p))
    if (found) return found
  }
  if (mood.templateCandidates && mood.templateCandidates.length){
    const first = toId(String(mood.templateCandidates[0]))
    const match = catalog.find(id => id.toLowerCase() === first)
    return match || mood.templateCandidates[0]
  }
  return catalog[0] || 'Sour'
}

function resolveTemplate(template: string){
  const id = toId(template)
  const catalog: any[] = Array.isArray(rules?.template_catalog) ? rules.template_catalog : []
  return catalog.find((item: any) => toId(item?.id) === id)
}

function methodAndGlass(template: string){
  const t = resolveTemplate(template)
  return { method: t?.method || 'shake', glass: t?.default_glass || 'coupe' }
}

type RolePickOptions = { na?: boolean; allergies?: string[]; inventoryItems?: string[]; preferInventory?: boolean }

function pickIngredientForRole(roleName: string, target: FlavorVector, opts: RolePickOptions): Ingredient | undefined {
  const sel = rules?.role_selectors?.[roleName]
  if (!sel) return undefined
  let pool: Ingredient[] = []
  // If explicit ids are provided, pick the best matching among them
  if (Array.isArray(sel.ids) && sel.ids.length){
    const cands = sel.ids.map((id: string)=> ING_BY_ID[id]).filter(Boolean)
    pool = cands
  } else {
    // Otherwise, choose from categories
    const cats: string[] = Array.isArray(sel.category_any) ? sel.category_any : []
    for (const c of cats){
      const arr = (ING_BY_CAT[c] || [])
      pool = pool.concat(arr)
    }
  }
  // NA mode: only allow ingredients with abv === 0
  if (opts.na) pool = pool.filter(i => Number(i.abv ?? 0) === 0)
  // Allergy filtering
  pool = filterByAllergies(pool, opts.allergies)
  // Inventory preference: reorder so inventory items are considered first
  if (opts.preferInventory) pool = reorderByInventory(pool, opts.inventoryItems)
  if (pool.length === 0) return undefined
  return searchIngredientsByFlavor(target, pool, 1)[0]
}

function dashToMl(dashes?: number){
  const DASH_ML = 1 // simple approximation
  return Math.max(0, Math.round((Number(dashes || 0)) * DASH_ML))
}

function applyRatioTuning(templateRoles: any[], amounts: number[], taste?: Partial<FlavorVector>): number[]{
  const t = taste || {}
  const rt = rules?.ratio_tuning || {}
  const sweetUnit = Math.round((Number(t.sweet ?? 50) - 50) / 10)
  const sourUnit = Math.round((Number(t.sour ?? 50) - 50) / 10)
  const fruitUnit = Math.round((Number(t.fruit ?? 50) - 50) / 10)
  const bitterUnit = Math.round((Number(t.bitter ?? 50) - 50) / 10)
  const boozyUnit = Math.round((Number(t.body ?? 50) - 50) / 10)

  return templateRoles.map((r, idx) => {
    let ml = amounts[idx]
    if (r.role === 'sweetener' && sweetUnit !== 0){
      ml = Math.max(0, ml + sweetUnit * Number(rt.sweet_adjust_ml_per_unit || 5))
    }
    if (r.role === 'citrus' && sourUnit !== 0){
      ml = Math.max(0, ml + sourUnit * Number(rt.sour_adjust_ml_per_unit || 5))
    }
    if ((r.role === 'mixer' || r.role === 'tropical_juice') && fruitUnit !== 0){
      ml = Math.max(0, ml + fruitUnit * Number(rt.fruit_adjust_ml_per_unit || 8))
    }
    if (r.role === 'bitters' && bitterUnit !== 0){
      ml = Math.max(0, ml + bitterUnit * Number(rt.bitter_adjust_dashes_per_unit || 1))
    }
    if (r.role === 'base' && boozyUnit !== 0){
      ml = Math.max(0, ml + boozyUnit * Number(rt.boozy_adjust_base_ml || 5))
    }
    return Math.round(ml)
  })
}

function applyLowSugarReduction(templateRoles: any[], amounts: number[], lowSugar?: boolean): number[]{
  if (!lowSugar) return amounts
  const reduce = Number(rules?.allergy_and_constraints?.low_sugar_preference?.reduce_sweetener_ratio ?? 0.30)
  return templateRoles.map((r, idx) => {
    let ml = amounts[idx]
    if (r.role === 'sweetener'){
      ml = Math.max(5, Math.round(ml * (1 - reduce)))
    }
    return ml
  })
}

function computeFlavorFromIngredients(selected: Ingredient[], amounts: number[]): FlavorVector {
  const totalMl = Math.max(1, amounts.reduce((a,b)=> a+b, 0))
  return FLAVOR_KEYS.reduce((acc, k) => {
    const sum = selected.reduce((s, ing, idx) => s + (ing.flavors?.[k] ?? 0) * amounts[idx], 0)
    acc[k] = clamp01(sum / totalMl)
    return acc
  }, {} as FlavorVector)
}

function computeEffervescenceBoost(hasSparkling: boolean, effPref: number, flavor: FlavorVector){
  if (!hasSparkling) return flavor
  const BOOST_F = Number((rules?.effervescence_boost_factor ?? 0.10))
  const boost = effPref * BOOST_F
  flavor.spicy = clamp01(flavor.spicy + boost)
  return flavor
}

function computeABV(selected: Ingredient[], amounts: number[], method: string, na?: boolean): number{
  const totalMl = Math.max(1, amounts.reduce((a,b)=> a+b, 0))
  const alcoholMl = na ? 0 : selected.reduce((acc, ing, idx) => acc + (amounts[idx] * ((ing.abv ?? 0) / 100)), 0)
  const dilMap = rules?.dilution_by_method || { shake: 0.18, stir: 0.12, build: 0.08 }
  const dilution = totalMl * Number(dilMap[method] ?? 0.12)
  return Math.round((alcoholMl / Math.max(1, totalMl + dilution)) * 100)
}

function pickIceByMethod(method: string): string{
  const ice = rules?.ice_rules || { shake: 'strain_no_ice_or_fresh_ice', stir: 'fresh_ice', build: 'lots_of_ice' }
  return String(ice[method] || 'fresh_ice')
}

function pickGarnish(baseId?: string): string[]{
  const rulesG = Array.isArray(rules?.garnish_rules) ? rules.garnish_rules : []
  let prefers: string[] = []
  for (const gr of rulesG){
    if (Array.isArray(gr.when_base) && baseId && gr.when_base.includes(baseId)){
      prefers = gr.prefer || []
      break
    }
  }
  return prefers
}

// 命名V2：轻量规则按方案实现
function quantizeFlavor(f: FlavorVector): string {
  const q = ['sweet','sour','bitter','fruit','aroma','spicy','body'] as (keyof FlavorVector)[]
  return q.map(k => Math.min(3, Math.max(0, Math.floor(Number(f[k]||0)*4)))).join('-')
}
function hashSeed(s: string): number {
  let h = 0
  for (let i=0; i<s.length; i++){ h = (h*31 + s.charCodeAt(i)) >>> 0 }
  return h
}
function seededPick<T>(arr: T[], seedStr: string): T | undefined {
  if (!arr || arr.length === 0) return undefined
  const idx = hashSeed(seedStr) % arr.length
  return arr[idx]
}
function seededPickWeighted(arr: string[], weights: number[], seedStr: string): string | undefined {
  if (!arr || arr.length === 0) return undefined
  const norm = weights.map(w => Math.max(1, Math.floor(Number(w||1))))
  const sum = norm.reduce((a,b)=> a+b, 0) || 1
  let r = hashSeed(seedStr) % sum
  for (let i=0; i<arr.length; i++){
    r -= norm[i]
    if (r < 0) return arr[i]
  }
  return arr[0]
}
function pickWeighted(arr: string[], seedStr: string): string | undefined {
  const nv2 = rules?.naming_v2 || {}
  const sw = (nv2?.style_weights || {}) as Record<string, number>
  const weights = arr.map(s => Number(sw[s] ?? 1))
  return seededPickWeighted(arr, weights, seedStr)
}

function detectBaseSpiritKey(selected: Ingredient[], baseId?: string): string | undefined {
  const keys = ['gin','whiskey','scotch','rum','vodka','tequila','brandy']
  const match = (s?: string) => {
    const x = (s||'').toLowerCase()
    if (!x) return undefined
    if (x.includes('gin')) return 'gin'
    if (x.includes('whisky') || x.includes('whiskey') || x.includes('bourbon') || x.includes('scotch')) return x.includes('scotch')? 'scotch':'whiskey'
    if (x.includes('rum')) return 'rum'
    if (x.includes('vodka')) return 'vodka'
    if (x.includes('tequila') || x.includes('mezcal')) return 'tequila'
    if (x.includes('brandy') || x.includes('cognac')) return 'brandy'
    return undefined
  }
  // try baseId first
  const byId = match(baseId)
  if (byId) return byId
  // then scan selected
  for (const i of selected){
    const m = match(i.id) || match(i.name) || match(i.category)
    if (m) return m
  }
  return undefined
}

function chooseTasteStyleV2(flavor: FlavorVector, hasSparkling: boolean): string {
  const nv2 = rules?.naming_v2 || {}
  const th = Number(nv2?.thresholds?.high ?? 0.6)
  const combos = nv2?.taste_styles?.combos || {}
  const singles = nv2?.taste_styles?.singles || {}
  const aliases = (nv2?.style_aliases || {}) as Record<string, string[]>
  const keys = ['sour','fruit','sweet','aroma','body','spicy','bitter'] as (keyof FlavorVector)[]
  const sorted = [...keys].sort((a,b)=> Number(flavor[b]||0) - Number(flavor[a]||0))
  const topA = sorted[0]
  const topB = sorted[1]
  const aStrong = Number(flavor[topA]||0) >= th
  const bStrong = Number(flavor[topB]||0) >= th
  // Sparkling override
  if (hasSparkling){
    const sp = nv2?.taste_styles?.sparkling_style || '清新气泡'
    const citrusList = combos['sour+fruit'] as string[] | undefined
    if (citrusList && (aStrong || bStrong) && (topA==='sour'|| topB==='sour') && (topA==='fruit' || topB==='fruit')){
      const picked = pickWeighted(citrusList, 'sparkling-citrus') || seededPick(citrusList, 'sparkling-citrus') || sp
      const alias = (aliases[picked] || [])
      return alias.length ? (seededPick(alias, 'alias-spark') || alias[0]) : picked
    }
    const alias = (aliases[sp] || [])
    return alias.length ? (seededPick(alias, 'alias-spark') || alias[0]) : sp
  }
  // try combos (only if both strong)
  if (aStrong && bStrong){
    const key = `${topA}+${topB}`
    const keyRev = `${topB}+${topA}`
    const cand = (combos[key] || combos[keyRev]) as string[] | undefined
    if (cand && cand.length){
      const picked = pickWeighted(cand, `combo-${key}`) || seededPick(cand, `combo-${key}`) || cand[0]
      const alias = (aliases[picked] || [])
      return alias.length ? (seededPick(alias, `alias-${key}`) || alias[0]) : picked
    }
  }
  // singles fallback using topA
  const sList = (singles[topA] || []) as string[]
  if (sList.length){
    const picked = pickWeighted(sList, `single-${String(topA)}`) || seededPick(sList, `single-${String(topA)}`) || sList[0]
    const alias = (aliases[picked] || [])
    return alias.length ? (seededPick(alias, `alias-${String(topA)}`) || alias[0]) : picked
  }
  // fallback use top key map
  return '风味平衡'
}

function generateNameV2(mood: MoodProfile, flavor: FlavorVector, flags: { hasSparkling: boolean; na?: boolean; method?: string; baseSpirit?: string; variability?: number; seedSalt?: string }): string {
  const nv2 = rules?.naming_v2
  if (!nv2) {
    const style = pickTasteStyle(flavor, flags.hasSparkling)
    const colors: string[] = Array.isArray(rules?.naming?.colors) ? rules.naming.colors : []
    const nature: string[] = Array.isArray(rules?.naming?.nature) ? rules.naming.nature : []
    const left = colors.length ? pickFrom(colors) : (nature.length ? pickFrom(nature) : mood.displayName)
    return `${left}·${style}`
  }
  const dateSeed = (()=>{ try{ return new Date().toISOString().slice(0,10) }catch{ return 'date' } })()
  const salt = flags.seedSalt || dateSeed
  const seedBase = `${mood.key}|${quantizeFlavor(flavor)}|${flags.hasSparkling?'s':'ns'}|${flags.na?'na':'alc'}|${flags.baseSpirit||'unknown'}|${salt}`
  const connectors: string[] = nv2.connectors || ['·']
  const prefixPool: string[] = nv2.prefix_pool || []
  const twists: string[] = nv2.twists || []
  const templates: string[] = nv2.templates || ['{prefix}{connector}{style}']
  const maxLen: number = Number(nv2.max_len || 12)
  const bannedPairs: string[][] = Array.isArray(nv2.banned_pairs) ? nv2.banned_pairs : []
  const naBannedTerms: string[] = Array.isArray(nv2.na_banned_terms) ? nv2.na_banned_terms : []

  const style = chooseTasteStyleV2(flavor, flags.hasSparkling)

  const hints: string[] = Array.isArray((mood as any).namingHints) ? ((mood as any).namingHints as string[]) : []
  const weights = prefixPool.map(p => hints.some(h => String(p).includes(String(h))) ? 2 : 1)
  const prefix = seededPickWeighted(prefixPool, weights, seedBase) || seededPick(prefixPool, seedBase) || mood.displayName

  let spiritHint = flags.baseSpirit ? (nv2.spirit_hints?.[flags.baseSpirit]?.[0] || '') : ''
  const techHint = flags.method ? (nv2.technique_hints?.[flags.method]?.[0] || '') : ''

  if (flags.na && spiritHint){
    for (const t of naBannedTerms){ if (t && spiritHint.includes(t)) { spiritHint = ''; break } }
  }

  const conn = seededPick(connectors, seedBase) || '·'

  let tpl = seededPick(templates, seedBase) || '{prefix}{connector}{style}'
  const variability = Number(flags.variability || 0)
  if (variability <= 0.3 && tpl.includes('{twist}')) tpl = '{prefix}{connector}{style}'

  let twist = ''
  if (variability > 0.3){
    twist = seededPick(twists, seedBase + '-tw') || ''
    if (flags.na){ for (const t of naBannedTerms){ if (twist.includes(t)) twist = '' } }
  }

  const tokens: Record<string,string> = { prefix, connector: conn, style, spiritHint, twist, techniqueHint: techHint }
  let name = tpl
    .replace('{prefix}', tokens.prefix)
    .replace('{connector}', tokens.connector)
    .replace('{style}', tokens.style)
    .replace('{spiritHint}', tokens.spiritHint)
    .replace('{twist}', tokens.twist)

  name = name.replace(/\{connector\}/g, conn)
  name = name.replace(/([·之与的])\1+/g, '$1')
  name = name.replace(/(^[·之与的]|[·之与的]$)/g, '')

  for (const [a,b] of bannedPairs){
    if (name.includes(a) && name.includes(b)){
      if (name.includes(tokens.spiritHint)){
        name = name.replace(tokens.spiritHint, '').replace(/([·之与的])\1+/g,'$1').replace(/([·之与的])$/,'')
      } else {
        name = `${prefix}${conn}${style}`
      }
    }
  }

  if (name.length > maxLen){ if (twist) name = name.replace(tokens.twist, '').replace(/([·之与的])$/,'') }
  if (name.length > maxLen){ if (spiritHint) name = name.replace(tokens.spiritHint, '').replace(/([·之与的])$/,'') }
  if (name.length > maxLen){ name = `${prefix}${conn}${style}` }

  return name
}

export type GenerateOptions = { moodKey: string; taste?: Partial<FlavorVector>; na?: boolean; lowSugar?: boolean; allergies?: string[]; inventoryItems?: string[]; preferInventory?: boolean; variability?: number; seedSession?: string }

export function generateRecipe(options: GenerateOptions): Recipe {
  const mood = moods.find(m => m.key === options.moodKey)
  if (!mood) throw new Error(`Unknown mood: ${options.moodKey}`)

  const targetFlavor = mergeTarget(mood.targetFlavorBias || {}, options.taste)
  const effPref = clamp01(Number(options.taste?.spicy ?? 50)/100)
  const template = chooseTemplate(mood, effPref, !!options.na)
  const tpl = resolveTemplate(template) || { roles: [] }
  const { method, glass } = methodAndGlass(template)

  // Role-based selection
  const selected: Ingredient[] = []
  const roleDefs: any[] = Array.isArray(tpl.roles) ? tpl.roles : []
  for (const r of roleDefs){
    const ing = pickIngredientForRole(String(r.role), targetFlavor, { na: !!options.na, allergies: options.allergies, inventoryItems: options.inventoryItems, preferInventory: !!options.preferInventory })
    if (ing) selected.push(ing)
  }
  // If still empty, fallback to flavor-matched list with allergy/NA/inventory considerations
  if (selected.length === 0){
    const invIds = normalizeInventoryIds(options.inventoryItems)
    const invSet = new Set(invIds)
    const basePool: Ingredient[] = options.na ? (ING_BY_CAT.na_base || ING_BY_CAT.soft || ING_BY_CAT.mixer || ingredients.filter(i=> (i.abv ?? 0)===0)) : (ING_BY_CAT.base || ING_BY_CAT.spirit || ingredients)
    let base: Ingredient | undefined
    // Prefer inventory base if available
    if (options.preferInventory){
      base = basePool.find(i => i.id && invSet.has(i.id))
    }
    if (!base){
      base = searchIngredientsByFlavor(targetFlavor, basePool, 1)[0]
    }
    // Build candidate pool respecting NA + allergies
    let pool = options.na ? ingredients.filter(i => Number(i.abv ?? 0) === 0) : ingredients
    pool = filterByAllergies(pool, options.allergies)
    pool = reorderByInventory(pool, options.preferInventory ? options.inventoryItems : undefined)
    const flavorMatched = searchIngredientsByFlavor(targetFlavor, pool, 12)
    const alt = [base, ...flavorMatched.filter(i => i && i !== base)].filter(Boolean).slice(0, 4) as Ingredient[]
    alt.forEach(i => selected.push(i))
  }

  // Ensure NA mode strictly removes any alcoholic picks
  if (options.na){
    for (let i = selected.length - 1; i >= 0; i--){
      if (Number(selected[i].abv ?? 0) > 0){
        selected.splice(i, 1)
      }
    }
  }

  // Amounts from template roles (ml or dashes)
  let amounts: number[] = roleDefs.map((r: any) => {
    if (r.ml !== undefined) return Number(r.ml)
    if (r.dashes !== undefined) return dashToMl(Number(r.dashes))
    const roleName = String(r.role)
    if (roleName === 'base') return 45
    if (roleName === 'mixer') return 120
    if (roleName === 'citrus' || roleName === 'sweetener') return 20
    return 15
  })
  if (amounts.length !== selected.length){
    const len = selected.length
    while (amounts.length < len) amounts.push(15)
    amounts = amounts.slice(0, len)
  }

  // Ratio tuning based on taste sliders
  amounts = applyRatioTuning(roleDefs, amounts, options.taste)

  // Low-sugar reduction per rules
  amounts = applyLowSugarReduction(roleDefs, amounts, options.lowSugar)

  // Ensure sparkling preference influences selection pool, respecting NA mode and mood templates
  if (effPref >= 0.6 && moodAllowsSparklingFallback(mood, template)){
    const sp = selected.find(isSparkling)
    if (!sp){
      const sparklingCand = ingredients.find(i => isSparkling(i) && (!options.na || Number(i.abv ?? 0) === 0))
      if (sparklingCand){
        selected[selected.length - 1] = sparklingCand
      }
    }
  }

  const flavor = computeFlavorFromIngredients(selected, amounts)
  const hasSparkling = selected.some(isSparkling)
  const flavorBoosted = computeEffervescenceBoost(hasSparkling, effPref, flavor)

  const baseId = selected.find(i => (i.category||'').toLowerCase().includes('base'))?.id
  const garnish = pickGarnish(baseId)
  const ice = pickIceByMethod(method)

  const totalMl = Math.round(amounts.reduce((a,b)=> a+b, 0))
  const estimatedABV = computeABV(selected, amounts, method, options.na)

  const recipe: Recipe = {
    name: generateNameV2(mood, flavorBoosted, { hasSparkling, na: options.na, method, baseSpirit: detectBaseSpiritKey(selected, baseId), variability: options.variability, seedSalt: options.seedSession || (new Date().toISOString().slice(0,10)) }),
    story: '灵感来袭。此杯结合你的口味微调形成的风味倾向，带来恰到好处的层次。',
    mood: mood.key,
    template,
    method,
    glass,
    ice,
    garnish,
    ingredients: selected.map((ing, idx) => ({ name: ing.name, amountMl: amounts[idx], abv: ing.abv })),
    totalMl,
    unit: 'ml',
    estimatedABV,
    estimatedCalories: Math.round(totalMl * 0.6),
    flavor: flavorBoosted,
  }

  return recipe
}