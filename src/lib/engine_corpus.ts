import type { FlavorVector, Recipe, RecipeIngredient, Ingredient, MoodProfile } from './types'
import corpusRaw from '@data/recipes_corpus.json'
import { loadMoods, loadIngredients, loadRules, createIngredientIndexByName } from './data'

// 维度与工具
const FLAVOR_KEYS: (keyof FlavorVector)[] = ['sweet','sour','bitter','aroma','fruit','spicy','body']
function clamp01(n: number){ return Math.max(0, Math.min(1, n)) }
function toId(s: string){ return String(s).toLowerCase().replace(/\s+/g,'_') }

// 输入类型（与经典生成器一致）
export type GenerateCorpusOptions = { moodKey: string; taste?: Partial<FlavorVector>; na?: boolean; lowSugar?: boolean; allergies?: string[]; inventoryItems?: string[]; preferInventory?: boolean }

// 语料类型
export type CorpusRecipe = { id: string; name: string; method: string; glass: string; tags?: string[]; ingredients: { name: string; amountMl: number }[]; garnish?: string[] }

// 预加载与索引
const moods: MoodProfile[] = loadMoods()
const ingredients: Ingredient[] = loadIngredients()
const rules: any = loadRules()
const ING_BY_NAME = createIngredientIndexByName(ingredients)

// 将滑杆口味 0–100 映射为 0–1 向量
function fromTaste(taste?: Partial<FlavorVector>): FlavorVector {
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(Number(taste?.[k] ?? 50)/100); return acc }, {} as FlavorVector)
}

// 提取 mood 偏好并融合权重
function toFlavorVector(bias: Partial<FlavorVector>): FlavorVector {
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(Number(bias[k] ?? 0)); return acc }, {} as FlavorVector)
}

function mergeTarget(moodBias: Partial<FlavorVector>, taste?: Partial<FlavorVector>): FlavorVector {
  const m = toFlavorVector(moodBias || {})
  const t = fromTaste(taste)
  const fw = (rules?.fusion_weights || { mood: 0.7, taste: 0.3 })
  const MOOD_W = Number(fw.mood ?? 0.7)
  const TASTE_W = Number(fw.taste ?? 0.3)
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(MOOD_W * m[k] + TASTE_W * t[k]); return acc }, {} as FlavorVector)
}

// 简化风味估算（按材料 flavor 权重/总量）
function computeFlavorFromIngredients(items: { name: string; amountMl: number }[]): FlavorVector {
  const totalMl = Math.max(1, items.reduce((a,b)=> a + Math.max(0, Number(b.amountMl||0)), 0))
  return FLAVOR_KEYS.reduce((acc,k)=>{
    const sum = items.reduce((s,it)=>{
      const ref = ING_BY_NAME[String(it.name).toLowerCase()]
      return s + ((ref?.flavors?.[k] || 0) * Math.max(0, Number(it.amountMl||0)))
    }, 0)
    acc[k] = clamp01(sum / totalMl)
    return acc
  }, {} as FlavorVector)
}

// 简化打分：与目标的 L2 误差 + NA 需求罚分
function scoreCandidate(target: FlavorVector, recipe: CorpusRecipe, opts: { na?: boolean }): number {
  const fv = computeFlavorFromIngredients(recipe.ingredients)
  const l2 = Math.sqrt(FLAVOR_KEYS.reduce((acc,k)=> acc + Math.pow((fv[k]||0) - (target[k]||0), 2), 0))
  let penalty = 0
  if (opts.na){
    // 任何含酒精材料（根据库中 ABV）加罚分
    for (const it of recipe.ingredients){
      const ref = ING_BY_NAME[String(it.name).toLowerCase()]
      if (ref && Number(ref.abv||0) > 0){ penalty += 0.35; break }
    }
  }
  return l2 + penalty
}

// mood 限定：是否允许起泡兜底；并对“angry”禁用
function moodAllowsSparklingFallback(mood?: MoodProfile): boolean {
  if (!mood) return false
  if (String(mood.key).toLowerCase() === 'angry') return false
  const cands = (mood.templateCandidates || []).map(s => toId(String(s)))
  return cands.some(id => id === 'highball' || id === 'collins' || id === 'flute')
}

// 约束与偏好简化改编：NA/低糖/起泡偏好
function adaptRecipe(base: CorpusRecipe, opts: { na?: boolean; lowSugar?: boolean; taste?: Partial<FlavorVector>; mood?: MoodProfile }): CorpusRecipe {
  let out: CorpusRecipe = JSON.parse(JSON.stringify(base))

  if (opts.na){
    // 将含酒精基酒替换为“无酒精植物基底”，方法与杯型更贴近直注/高杯
    out.ingredients = out.ingredients.map((it)=>{
      const ref = ING_BY_NAME[String(it.name).toLowerCase()]
      if (ref && Number(ref.abv||0) > 0){
        // 仅替换“base/liquor/bitters”等含酒精项
        return { name: '无酒精植物基底', amountMl: it.amountMl }
      }
      return it
    })
    out.method = 'build'
    out.glass = 'highball'
  }

  if (opts.lowSugar){
    out.ingredients = out.ingredients.map((it)=>{
      const ref = ING_BY_NAME[String(it.name).toLowerCase()]
      const isSyrup = String(ref?.category||'').toLowerCase() === 'syrup'
      if (isSyrup){ return { ...it, amountMl: Math.round(Number(it.amountMl||0) * 0.7) } }
      return it
    })
  }

  // 若用户偏好“气泡感”较高且未包含起泡 mixer，且 mood 允许，再补充少量苏打水
  const spicyPref = Number(opts.taste?.spicy ?? 50)/100
  const hasSparkling = out.ingredients.some(it => {
    const nm = String(it.name||'').toLowerCase()
    return /苏打水|汤力水|汽水|ginger|soda|tonic|cola/.test(nm)
  })
  const allowSparkling = moodAllowsSparklingFallback(opts.mood)
  if (spicyPref >= 0.6 && !hasSparkling && allowSparkling){
    out.ingredients = [...out.ingredients, { name: '苏打水', amountMl: 40 }]
    if (!opts.na){ out.method = 'build'; out.glass = 'highball' }
  }

  return out
}

// 生成语料改编配方（最小端到端）
export function generateRecipeCorpus(options: GenerateCorpusOptions): Recipe {
  const mood = moods.find(m => m.key === options.moodKey)
  if (!mood) throw new Error(`Unknown mood: ${options.moodKey}`)

  // 1) 目标风味向量
  const targetFlavor = mergeTarget(mood.targetFlavorBias || {}, options.taste)

  // 2) 语料候选打分与选择
  const corpusArr: CorpusRecipe[] = ((corpusRaw as any)?.recipes || []) as CorpusRecipe[]
  if (!Array.isArray(corpusArr) || corpusArr.length === 0) throw new Error('Empty corpus recipes')
  const sorted = [...corpusArr].sort((a,b)=> scoreCandidate(targetFlavor, a, { na: options.na }) - scoreCandidate(targetFlavor, b, { na: options.na }))
  const picked = sorted[0]

  // 3) 改编（NA/低糖/气泡偏好）
  const adapted = adaptRecipe(picked, { na: !!options.na, lowSugar: !!options.lowSugar, taste: options.taste, mood })

  // 4) 计算改编后风味向量
  const fv = computeFlavorFromIngredients(adapted.ingredients)

  // 5) 组装结果（ABV/总量后续交由 finalizeRecipe 统一计算）
  const totalMl = Math.round(adapted.ingredients.reduce((a,b)=> a + Math.max(0, Number(b.amountMl||0)), 0))
  const recipe: Recipe = {
    name: `${adapted.name} · 语料改编`,
    story: `根据“${mood.displayName}”与口味偏好，从经典配方检索并轻量改编。`,
    mood: mood.key,
    template: 'corpus_adapt',
    method: adapted.method || 'shake',
    glass: adapted.glass || 'coupe',
    garnish: adapted.garnish || [],
    ingredients: adapted.ingredients.map(it => ({ name: it.name, amountMl: it.amountMl } as RecipeIngredient)),
    totalMl,
    unit: 'ml',
    estimatedABV: 0, // 交由 finalizeRecipe 计算
    flavor: fv,
  }

  return recipe
}