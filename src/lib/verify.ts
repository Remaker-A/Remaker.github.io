import type { Recipe, RecipeIngredient, FlavorVector, Ingredient } from './types'
import { loadIngredients, createIngredientIndexById, createIngredientIndexByName } from './data'

// 归一化库存条目为已知 id 或面向比对的 key
function toId(s: string){ return String(s).toLowerCase().replace(/\s+/g,'_') }

const ING_LIST: Ingredient[] = loadIngredients()
const ING_BY_ID = createIngredientIndexById(ING_LIST)
const ING_BY_NAME = createIngredientIndexByName(ING_LIST)

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
  return items.map((raw)=>{
    const lower = String(raw).trim().toLowerCase()
    if (ING_BY_ID[raw]) return raw
    if (ING_BY_ID[lower]) return lower
    if (INV_NAME_MAP[lower]) return INV_NAME_MAP[lower]
    return toId(lower)
  })
}

function defaultAmountForCategory(cat?: string): number {
  const c = String(cat||'').toLowerCase()
  switch(c){
    case 'base':
    case 'spirit':
    case 'na_base':
      return 45
    case 'liquor':
      return 20
    case 'juice':
      return 20
    case 'syrup':
      return 15
    case 'mixer':
    case 'soft':
      return 120
    case 'bitters':
      return 2 // 约 2 ml ~ 2 dashes
    case 'herb':
    case 'garnish':
      return 1 // 以“1片/枝”近似为 1 ml 展示
    default:
      return 15
  }
}

function computeABV(ings: RecipeIngredient[], method: string, na?: boolean): number{
  const totalMl = Math.max(1, ings.reduce((a,b)=> a + Math.max(0, Number(b.amountMl||0)), 0))
  const alcoholMl = na ? 0 : ings.reduce((acc, it) => acc + (Number(it.amountMl||0) * ((Number(it.abv||0)) / 100)), 0)
  const dilMap: Record<string, number> = { shake: 0.18, stir: 0.12, build: 0.08 }
  const dilution = totalMl * Number(dilMap[method] ?? 0.12)
  return Math.round((alcoholMl / Math.max(1, totalMl + dilution)) * 100)
}

function filterOutByConstraints(ing: Ingredient, opts: { na?: boolean; allergies?: string[] }): boolean {
  if (opts.na && Number(ing.abv||0) > 0) return true
  const set = new Set((opts.allergies||[]).map(a=> String(a).toLowerCase()))
  const allergens = (ing.allergens||[]).map(a=> String(a).toLowerCase())
  for (const a of allergens){ if (set.has(a)) return true }
  return false
}

export function finalizeRecipe(recipe: Recipe, opts: { inventoryItems?: string[]; preferInventory?: boolean; na?: boolean; allergies?: string[] }): Recipe {
  const namesSet = new Set(recipe.ingredients.map(it=> String(it.name).toLowerCase()))
  const out: RecipeIngredient[] = [...recipe.ingredients]

  // 当未选用库存时也进行校验：补齐缺失 ABV
  for (let i=0; i<out.length; i++){
    const it = out[i]
    if (typeof it.abv !== 'number'){
      const ref = ING_BY_NAME[String(it.name).toLowerCase()]
      if (ref && typeof ref.abv === 'number') out[i] = { ...it, abv: ref.abv }
    }
  }

  if (opts.preferInventory && Array.isArray(opts.inventoryItems) && opts.inventoryItems.length){
    const invIds = normalizeInventoryIds(opts.inventoryItems)
    for (const id of invIds){
      const byId = ING_BY_ID[id]
      const byName = ING_BY_NAME[id]
      const ref = byId || byName
      if (ref){
        if (filterOutByConstraints(ref, { na: opts.na, allergies: opts.allergies })) continue
        const key = String(ref.name).toLowerCase()
        if (!namesSet.has(key)){
          out.push({ name: ref.name, amountMl: defaultAmountForCategory(ref.category), abv: ref.abv })
          namesSet.add(key)
        }
      } else {
        // 未在库中命中，仍以名称纳入材料表，ABV未知
        const displayName = id
        if (!namesSet.has(displayName)){
          out.push({ name: displayName, amountMl: defaultAmountForCategory('unknown') })
          namesSet.add(displayName)
        }
      }
    }
  }

  const totalMl = Math.round(out.reduce((a,b)=> a + Math.max(0, Number(b.amountMl||0)), 0))
  const estimatedABV = computeABV(out, recipe.method, opts.na)

  return { ...recipe, ingredients: out, totalMl, estimatedABV }
}