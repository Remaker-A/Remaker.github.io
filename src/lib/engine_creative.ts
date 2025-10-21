import type { FlavorVector, Ingredient, MoodProfile, Recipe, RecipeIngredient } from './types'
import { loadMoods, loadIngredients, loadRules, searchIngredientsByFlavor, createIngredientIndexByName, createIngredientIndexByCategory, createIngredientIndexById } from './data'

// 维度与工具
const FLAVOR_KEYS: (keyof FlavorVector)[] = ['sweet','sour','bitter','aroma','fruit','spicy','body']
function clamp01(n: number){ return Math.max(0, Math.min(1, n)) }
function toId(s: string){ return String(s).toLowerCase().replace(/\s+/g,'_') }

const moods: MoodProfile[] = loadMoods()
const ingredients: Ingredient[] = loadIngredients()
const rules: any = loadRules()

const ING_BY_NAME = createIngredientIndexByName(ingredients)
const ING_BY_CAT = createIngredientIndexByCategory(ingredients)
const ING_BY_ID = createIngredientIndexById(ingredients)

// 新增：将滑杆口味 0–100 映射为 0–1
function fromTaste(taste?: Partial<FlavorVector>): FlavorVector {
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(Number(taste?.[k] ?? 50)/100); return acc }, {} as FlavorVector)
}
// 新增：将 mood 偏好归一化为 0–1
function toFlavorVector(bias: Partial<FlavorVector>): FlavorVector {
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(Number(bias[k] ?? 0)); return acc }, {} as FlavorVector)
}
// 新增：融合目标（权重来自配置）
function mergeTarget(moodBias: Partial<FlavorVector>, taste?: Partial<FlavorVector>): FlavorVector {
  const m = toFlavorVector(moodBias || {})
  const t = fromTaste(taste)
  const fw = (rules?.fusion_weights || { mood: 0.7, taste: 0.3 })
  const MOOD_W = Number(fw.mood ?? 0.7)
  const TASTE_W = Number(fw.taste ?? 0.3)
  return FLAVOR_KEYS.reduce((acc,k)=> { acc[k] = clamp01(MOOD_W * m[k] + TASTE_W * t[k]); return acc }, {} as FlavorVector)
}

// 味谱工具
function mergeFlavor(base: Partial<FlavorVector>, delta?: Partial<FlavorVector>): FlavorVector{
  const out: any = {}
  for (const k of FLAVOR_KEYS){ out[k] = clamp01(Number(base[k] ?? 0) + Number(delta?.[k] ?? 0)) }
  return out as FlavorVector
}

// 语义工具
function isSparkling(i: Ingredient){
  const name = (i.name || '').toLowerCase()
  const cat = (i.category || '').toLowerCase()
  const sparkTags: string[] = Array.isArray(rules?.semantic_tags?.patterns?.sparkling) ? rules.semantic_tags.patterns.sparkling : []
  if (cat === 'soft' || cat === 'mixer'){
    for (const p of sparkTags){ if (name.includes(String(p).toLowerCase())) return true }
  }
  // 兜底：根据语义标签判断
  return tagsOfIngredient(i).includes('sparkling')
}

function seedHash(str: string){
  let h = 2166136261
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h += (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24) }
  return Math.abs(h >>> 0)
}
function pickSeeded<T>(arr: T[], seed: string): T{ const h = seedHash(seed); return arr[(h % Math.max(arr.length,1)) || 0] }

// 意图推导（已在前文存在）
function deriveIntent(mood: MoodProfile){
  const key = String(mood.key || '').toLowerCase()
  const profiles: any = rules?.intent_profiles || {}
  const p = profiles[key]
  if (p) return p
  // 回退：基于风味偏好粗略映射
  const bias = mood.targetFlavorBias || {}
  const modernity = clamp01(Number(bias.fruit||0)*0.3 + Number(bias.aroma||0)*0.3 + Number(bias.spicy||0)*0.2)
  return { valence:0.6, arousal:0.5, warmth:0.6, complexity:0.5, modernity, adventurous:0.4, nostalgia:(1-modernity)*0.6 }
}

// 选择策略（原有）
function selectStrategy(mood: MoodProfile, taste?: Partial<FlavorVector>, opts?: { riskLevel?: number; contrastThreshold?: number }){
  const risk = clamp01(Number(opts?.riskLevel ?? 0.5))
  const contrast = clamp01(Number(opts?.contrastThreshold ?? 0.5))
  const wantContrast = Number(taste?.bitter ?? 0) + Number(taste?.spicy ?? 0) > 0.6
  if (risk > 0.7 || wantContrast && contrast > 0.5) return 'contrast'
  if (risk > 0.5) return 'blend'
  return 'follow'
}

// 新增：低糖用量调整（甜味角色）
function applyLowSugarReduction(templateRoles: any[], amounts: number[], lowSugar?: boolean): number[]{
  if (!lowSugar) return amounts
  const reduce = Number(rules?.allergy_and_constraints?.low_sugar_preference?.reduce_sweetener_ratio ?? 0.30)
  return templateRoles.map((r, idx) => {
    let ml = amounts[idx]
    const role = String(r?.role || '').toLowerCase()
    if (role.includes('sweet') || role.includes('syrup')){
      ml = Math.max(5, Math.round(ml * (1 - reduce)))
    }
    return ml
  })
}

// 新增：库存名称归一化与排序
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
function reorderByInventory(pool: Ingredient[], inventoryIds?: string[]): Ingredient[] {
  const set = new Set(normalizeInventoryIds(inventoryIds))
  if (set.size === 0) return pool
  return [...pool].sort((a,b)=> {
    const ai = a.id && set.has(String(a.id)) ? 1 : 0
    const bi = b.id && set.has(String(b.id)) ? 1 : 0
    return bi - ai
  })
}

// 风味弧线（更新：以融合后的 palate 为基准）
export type FlavorEnvelope = { nose: FlavorVector; palate: FlavorVector; finish: FlavorVector }
function buildEnvelope(mood: MoodProfile, strategy: string, targetPalate?: FlavorVector): FlavorEnvelope{
  const palate = targetPalate || toFlavorVector(mood.targetFlavorBias || {})
  const nose = mergeFlavor(palate, strategy==='contrast'? { aroma:0.15, fruit:-0.05 } : { aroma:0.10 })
  const finish = mergeFlavor(palate, strategy==='contrast'? { bitter:0.15, sweet:-0.10 } : { bitter:0.08 })
  return { nose, palate, finish }
}

// 语义标签识别
function tagsOfIngredient(i: Ingredient): string[]{
  const out: string[] = []
  const patterns = (rules?.semantic_tags?.patterns) || {}
  const byCat = (rules?.semantic_tags?.by_category) || {}
  const name = String(i.name || '').toLowerCase()
  const cat = String(i.category || '')
  for (const tag in patterns){
    const arr: string[] = Array.isArray((patterns as any)[tag]) ? (patterns as any)[tag] : []
    for (const p of arr){ if (name.includes(String(p).toLowerCase())){ out.push(tag); break } }
  }
  const extra: string[] = Array.isArray((byCat as any)[cat]) ? (byCat as any)[cat] : []
  out.push(...extra)
  return Array.from(new Set(out))
}
// 新增：风格/味谱→标签提示
function styleTagHints(styleName: string): string[]{
  const s = String(styleName || '')
  if (/气泡/.test(s)) return ['sparkling','citrus']
  if (/柑橘/.test(s)) return ['citrus']
  if (/果香/.test(s)) return ['tropical','berry']
  if (/辛香/.test(s)) return ['spice']
  if (/芳香|花香/.test(s)) return ['floral','herbal']
  if (/醇厚|稳重/.test(s)) return ['oak','vanilla']
  if (/甜/.test(s)) return ['sweetener','vanilla']
  if (/苦/.test(s)) return ['bitters']
  return []
}
function flavorTagHints(f: FlavorVector): string[]{
  const out: string[] = []
  if (Number(f.sour||0) >= 0.5) out.push('citrus')
  if (Number(f.fruit||0) >= 0.6) out.push('tropical')
  if (Number(f.spicy||0) >= 0.4) out.push('spice')
  if (Number(f.aroma||0) >= 0.5) out.push('floral')
  if (Number(f.body||0) >= 0.6) out.push('oak')
  if (Number(f.bitter||0) >= 0.4) out.push('bitters')
  return Array.from(new Set(out))
}
// 新增：候选打分（标签匹配）
function tagMatchScore(i: Ingredient, desired: string[]): number{
  if (!desired || desired.length===0) return 0
  const tags = tagsOfIngredient(i)
  const set = new Set(desired)
  let s = 0
  for (const t of tags){ if (set.has(t)) s += (t==='sparkling' || t==='citrus') ? 2 : 1 }
  return s
}
// 新增：依据标签提示挑选装饰
function pickGarnishForHints(hints: string[]): string[]{
  const garn: Ingredient[] = ING_BY_CAT.garnish || []
  const herbs: Ingredient[] = ING_BY_CAT.herb || []
  const out: string[] = []
  const has = (tag: string) => hints.includes(tag)
  if (has('citrus')){ const cand = garn.find(g=> /lemon|lime|orange/i.test(String(g.id||g.name))); if (cand) out.push(cand.name) }
  if (has('floral')||has('herbal')){ const h = herbs.find(x=> /mint|basil|rosemary/i.test(String(x.id||x.name))); if (h) out.push(h.name) }
  if (has('bitters')){ const peel = garn.find(g=> /orange_peel|lemon_peel/i.test(String(g.id||g.name))); if (peel) out.push(peel.name) }
  if (has('sparkling')){ const citrus = garn.find(g=> /lemon|lime/i.test(String(g.id||g.name))); if (citrus) out.push(citrus.name) }
  return Array.from(new Set(out)).slice(0,2)
}
// 语义配对分值（原有）
function computePairingBoost(a: Ingredient, b: Ingredient): number{
  const tagsA = tagsOfIngredient(a)
  const tagsB = tagsOfIngredient(b)
  const pos = rules?.pairing_scores?.positive || {}
  const neg = rules?.pairing_scores?.negative || {}
  let score = 0
  for (const ta of tagsA){ for (const tb of tagsB){ const key1 = `${ta}+${tb}`; const key2 = `${tb}+${ta}`; score += Number(pos[key1]||pos[key2]||0); score += Number(neg[key1]||neg[key2]||0) } }
  return score
}

// 选择风味风格标签（命名风格 v4）
function chooseTasteStyleV4(flavor: FlavorVector, hasSparkling: boolean): string{
  const nv2 = rules?.naming_v2 || {}
  const combos: Record<string,string[]> = (nv2.taste_styles?.combos) || {}
  const singles: Record<string,string[]> = (nv2.taste_styles?.singles) || {}
  const sparklingStyle: string = (nv2.taste_styles?.sparkling_style) || '清新气泡'
  const threshHigh = Number(nv2.thresholds?.high || 0.6)
  const dims: (keyof FlavorVector)[] = ['sour','fruit','sweet','aroma','body','spicy','bitter']
  const top = [...dims].sort((a,b)=> Number(flavor[b]||0) - Number(flavor[a]||0))
  // 双维优先（如 sour+fruit）
  const a = top[0], b = top[1]
  const comboKey = `${String(a)}+${String(b)}`
  if (hasSparkling && (flavor.sour||0) >= 0.4){ return sparklingStyle }
  if ((flavor[a]||0) >= threshHigh && (flavor[b]||0) >= (threshHigh-0.1) && combos[comboKey] && combos[comboKey].length){
    const seed = `${comboKey}|${flavor[a]}|${flavor[b]}`
    return pickSeeded(combos[comboKey], seed)
  }
  // 单维回退
  const k = top[0]
  const arr = singles[String(k)] || ['风味平衡']
  return pickSeeded(arr, `${String(k)}|${flavor[k]}`)
}

// 生成命名与叙事（v4，双语桥接）
function generateNameAndNarrativeV4(mood: MoodProfile, flavor: FlavorVector, envelope: FlavorEnvelope, flags: { hasSparkling: boolean; na?: boolean; method?: string; baseSpirit?: string; variability?: number; seedSalt?: string; modernity?: number; riskLevel?: number }): { nameZh: string; nameEn: string; narrativeZh: string; narrativeEn: string }{
  const nv2 = rules?.naming_v2 || {}
  const connectors: string[] = Array.isArray(nv2.connectors) ? nv2.connectors : ['·']
  const prefixPool: string[] = Array.isArray(nv2.prefix_pool) ? nv2.prefix_pool : (mood.namingHints||[mood.displayName])
  const twists: string[] = Array.isArray(nv2.twists) ? nv2.twists : []
  const templates: string[] = Array.isArray(nv2.templates) ? nv2.templates : ['{prefix}{connector}{style}']
  const maxLen: number = Number(nv2.max_len || 12)
  const bannedPairs: string[][] = Array.isArray(nv2.banned_pairs) ? nv2.banned_pairs : []
  const naBannedTerms: string[] = Array.isArray(nv2.na_banned_terms) ? nv2.na_banned_terms : []
  const spiritHints: Record<string,string[]> = nv2.spirit_hints || {}
  const techHints: Record<string,string[]> = nv2.technique_hints || {}

  const style = chooseTasteStyleV4(envelope.palate, flags.hasSparkling)
  // 现代/复古权重：现代偏好“·/霓虹/星河/流光/夜行”，复古偏好“之/与/的/松影/雾枝/晨曦/花潮/果岭/露香”
  const modernity = clamp01(Number(flags.modernity ?? 0.5))
  const modernPrefixes = prefixPool.filter(p=> /霓虹|星河|流光|夜行/.test(p))
  const retroPrefixes = prefixPool.filter(p=> /松影|雾枝|晨曦|花潮|果岭|露香/.test(p))
  const neutralPrefixes = prefixPool.filter(p=> modernPrefixes.indexOf(p)<0 && retroPrefixes.indexOf(p)<0)
  const prefixCandidates = modernity>=0.6 ? (modernPrefixes.length? modernPrefixes : (neutralPrefixes.length? neutralPrefixes : prefixPool)) : (retroPrefixes.length? retroPrefixes : (neutralPrefixes.length? neutralPrefixes : prefixPool))

  const seedBase = `${mood.key}|${String(flags.baseSpirit||'unknown')}|${String(flags.method||'unknown')}|${flags.hasSparkling?'s':'ns'}|${flags.na?'na':'alc'}|${String(flags.seedSalt||'seed')}`
  const prefix = pickSeeded(prefixCandidates, `${seedBase}|prefix`)
  const conn = modernity>=0.55 ? '·' : pickSeeded(connectors, `${seedBase}|conn`)
  const baseSpiritKey = String(flags.baseSpirit||'')
  const spiritHint = (spiritHints[baseSpiritKey]||[])[0] || ''
  const techHint = (techHints[String(flags.method||'')]||[])[0] || ''
  const variability = clamp01(Number(flags.variability ?? 0.3))
  const wantTwist = (flags.riskLevel||0) > 0.5 || variability > 0.35
  const twist = wantTwist ? pickSeeded(twists, `${seedBase}|tw`) : ''
  const tpl = pickSeeded(templates, `${seedBase}|tpl`)

  // 组装中文名（强制前缀在左、风格在右）
  const tokens: Record<string,string> = { prefix, connector: conn, style, twist, spiritHint, techHint }
  let nameZh = tpl.replace('{prefix}', tokens.prefix).replace('{connector}', tokens.connector).replace('{style}', tokens.style)
  nameZh = nameZh.replace('{twist}', tokens.twist).replace('{spiritHint}', tokens.spiritHint).replace('{techHint}', tokens.techHint)
  // 如果模板未以 prefix 开头或未包含 style，则回退为“prefix·style”
  if (!nameZh.startsWith(tokens.prefix) || !nameZh.includes(tokens.style)) {
    nameZh = `${tokens.prefix}${tokens.connector}${tokens.style}`
  }
  nameZh = nameZh.replace(/(^[·之与的]|[·之与的]$)/g, '')
  // 禁配处理
  for (const [a,b] of bannedPairs){
    if (nameZh.includes(a) && nameZh.includes(b)){
      if (nameZh.includes(tokens.spiritHint)){
        nameZh = nameZh.replace(tokens.spiritHint, '').replace(/([·之与的])\1+/g,'$1').replace(/([·之与的])$/,'')
      } else {
        nameZh = `${prefix}${conn}${style}`
      }
    }
  }
  // NA 模式过滤词
  if (flags.na){ for (const t of naBannedTerms){ nameZh = nameZh.replace(new RegExp(t,'g'), '') } nameZh = nameZh.replace(/([·之与的])$/,'') }
  // 长度控制
  if (nameZh.length > maxLen){ if (twist) nameZh = nameZh.replace(tokens.twist, '').replace(/([·之与的])$/,'') }
  if (nameZh.length > maxLen){ if (spiritHint) nameZh = nameZh.replace(tokens.spiritHint, '').replace(/([·之与的])$/,'') }
  if (nameZh.length > maxLen){ nameZh = `${prefix}${conn}${style}` }

  // 英文桥接
  const EN_STYLE_MAP: Record<string,string> = {
    '清新气泡':'Sparkling Fresh','柑橘清新':'Citrus Bright','柑橘明快':'Citrus Lively','香甜柔和':'Sweet and Smooth','芳香层次':'Aromatic Layers','醇厚稳重':'Rich and Rounded','甜润顺口':'Sweet and Easy','酸爽提神':'Zesty Lift','果香明亮':'Bright Fruity','辛香跃动':'Spiced Lift','微苦平衡':'Gentle Bitter Balance'
  }
  const EN_PREFIX_MAP: Record<string,string> = {
    '霓虹':'Neon','海风':'Sea Breeze','雾枝':'Mist Twig','松影':'Pine Shade','晨曦':'Dawnlight','流光':'Lumina','星河':'Star River','花潮':'Floral Tide','果岭':'Green','露香':'Dew Aroma'
  }
  const enPrefix = EN_PREFIX_MAP[prefix] || 'Aura'
  const enStyle = EN_STYLE_MAP[style] || 'Balanced Blend'
  const EN_TECH_MAP: Record<string,string> = { shake:'shaken', stir:'stirred', build:'built' }
  const EN_SPIRIT_MAP: Record<string,string> = { gin:'juniper', whiskey:'malty', rum:'tropical', vodka:'crystal', tequila:'agave', brandy:'fruity', scotch:'peaty' }
  const enConn = modernity>=0.55 ? ' · ' : ' of '
  const enSpirit = EN_SPIRIT_MAP[baseSpiritKey] || ''
  let nameEn = `${enPrefix}${enConn}${enStyle}`
  if (twist){ nameEn = `${nameEn}${modernity>=0.55 ? ' · ' : ' — '}${'Twist'}` }
  if (enSpirit && nameEn.length < maxLen+8){ nameEn = `${nameEn} with ${enSpirit}` }
  if (flags.na){ nameEn = nameEn.replace(/cocktail/i,'').trim() }

  // 叙事（中英各一句）
  const nose = envelope.nose, pal = envelope.palate, fin = envelope.finish
  const zhArc = `入口${Math.round(nose.aroma*100)}香/${Math.round(nose.fruit*100)}果，中段${Math.round(pal.sour*100)}酸/${Math.round(pal.sweet*100)}甜，尾段${Math.round(fin.bitter*100)}微苦。`
  const techZh = techHint || (flags.method==='shake'? '轻摇' : flags.method==='stir'? '慢搅' : '直调')
  const narrativeZh = `${prefix}${conn}${style}，${techZh}呈现；${zhArc}`
  const narrativeEn = `A ${enStyle} ${EN_TECH_MAP[String(flags.method||'shake')]} serve; nose ${Math.round(nose.aroma*100)} aroma/${Math.round(nose.fruit*100)} fruit, palate ${Math.round(pal.sour*100)} sour/${Math.round(pal.sweet*100)} sweet, finish ${Math.round(fin.bitter*100)} bitter.`

  return { nameZh, nameEn, narrativeZh, narrativeEn }
}

// 输入扩展（保持兼容）
export type GenerateCreativeOptions = {
  moodKey: string;
  taste?: Partial<FlavorVector>;
  na?: boolean;
  lowSugar?: boolean;
  allergies?: string[];
  inventoryItems?: string[];
  preferInventory?: boolean;
  diversityTemperature?: number;
  riskLevel?: number; // 0-1
  modernity?: number; // 0-1（如果外部指定，优先）
  contrastThreshold?: number;
  seedSession?: string;
  microTune?: { enabled?: boolean; iterations?: number; stepMl?: number; intensity?: 'low'|'medium'|'high'|number };
}

// 意图画像类型（与 deriveIntent 输出保持一致）
export type Intent = {
  valence: number; arousal: number; warmth: number; complexity: number; modernity: number; adventurous: number; nostalgia: number
}

// 风格语法（模板→方法→杯型→角色布局）
export type StyleSpec = { template: string; method: string; glass: string; roles: { role: string; ml?: number; weight?: number }[] }

function pickStyle(intent: Intent, strategy: 'follow'|'contrast'|'blend', na: boolean): StyleSpec{
  const catalog: any[] = Array.isArray(rules?.template_catalog) ? rules.template_catalog : []
  const grammar = rules?.style_grammar || {}
  const prefers = grammar?.prefer_templates_by_strategy || {}
  const link = grammar?.linkage || {}
  function has(id: string){ return catalog.some(t => toId(String(t.id)) === toId(id)) }
  const prefList: string[] = na ? [ 'highball','collins' ] : (Array.isArray(prefers?.[strategy]) ? prefers[strategy] : [])
  const tpl = (prefList.find(id => has(id)) || (strategy==='contrast' ? (has('martini')? 'martini' : has('old_fashioned')? 'old_fashioned' : 'sour') : strategy==='follow' ? (has('sour')? 'sour' : has('collins')? 'collins' : 'highball') : (has('old_fashioned')? 'old_fashioned':'sour')))
  const t = catalog.find((c: any) => toId(c.id) === toId(tpl)) || { method: 'shake', default_glass: 'coupe', roles: [{ role:'base', ml:50 },{ role:'citrus', ml:25 },{ role:'sweetener', ml:20 }] }
  const method = String((link[tpl]?.method) || t.method || (tpl==='old_fashioned'?'stir':tpl==='highball'?'build':'shake'))
  const glass = String((link[tpl]?.glass) || t.default_glass || (tpl==='old_fashioned'?'rocks':tpl==='highball'?'highball':'coupe'))
  const roles = Array.isArray(t.roles) ? t.roles : [{ role:'base', ml:50 },{ role:'citrus', ml:25 },{ role:'sweetener', ml:20 }]
  return { template: t.id || tpl, method, glass, roles }
}

// 母题选择：基于 mood + strategy
type Motif = { id: string; name?: string; tags: string[]; prefer_templates?: string[] }
function chooseMotif(moodKey: string, strategy: 'follow'|'contrast'|'blend'): Motif | undefined {
  const arr: any[] = Array.isArray(rules?.motifs) ? rules.motifs : []
  for (const m of arr){
    const ms = Array.isArray(m?.apply?.moods) ? m.apply.moods : []
    const ss = Array.isArray(m?.apply?.strategies) ? m.apply.strategies : []
    const okMood = ms.length===0 || ms.includes(moodKey)
    const okStrat = ss.length===0 || ss.includes(strategy)
    if (okMood && okStrat) return { id: String(m.id), name: String(m.name||''), tags: Array.isArray(m.tags)? m.tags : [], prefer_templates: Array.isArray(m.prefer_templates)? m.prefer_templates : [] }
  }
  return undefined
}

// 角色→材料检索（风味相似度 + 语义簇 + 配对加权 + 约束 + 库存偏好）
function pickIngredientForRole(role: string, target: Partial<FlavorVector>, opts: { na?: boolean; allergies?: string[]; desiredTags?: string[]; preferInventory?: boolean; inventoryItems?: string[] }): Ingredient | undefined {
  const isNA = !!opts.na
  const set = new Set((opts.allergies||[]).map(a=> String(a).toLowerCase()))
  function filter(i: Ingredient){
    if (isNA && Number(i.abv||0) > 0) return false
    const allergens = (i.allergens||[]).map(a=> String(a).toLowerCase())
    for (const a of allergens){ if (set.has(a)) return false }
    return true
  }
  // 初始候选池：按 role_selectors 限定或按分类
  let pool: Ingredient[] = []
  const rs: any = (rules?.role_selectors || {})[role]
  if (rs && Array.isArray(rs.ids)){
    for (const id of rs.ids){ const it = ING_BY_ID[id]; if (it) pool.push(it) }
  }
  if (pool.length === 0){
    const cat = role.toLowerCase()
    if (cat==='base' || cat==='modifier') pool = isNA ? (ING_BY_CAT.na_base || ING_BY_CAT.soft || ING_BY_CAT.mixer || ingredients.filter(i=> (i.abv ?? 0)===0)) : (ING_BY_CAT.base || ING_BY_CAT.spirit || ingredients)
    else if (cat==='citrus' || cat==='sour') pool = ING_BY_CAT.sour || ING_BY_CAT.citrus || ingredients
    else if (cat==='sweet' || cat==='sweetener') pool = ING_BY_CAT.syrup || ING_BY_CAT.sweetener || ingredients
    else if (cat==='aroma' || cat==='liqueur') pool = ING_BY_CAT.aroma || ING_BY_CAT.liqueur || ING_BY_CAT.bitters || ingredients
    else if (cat==='bitter' || cat==='bitters') pool = ING_BY_CAT.bitters || ingredients
    else if (cat==='mixer') pool = ING_BY_CAT.mixer || ING_BY_CAT.soft || ingredients
    else pool = ingredients
  }
  // 风味相似度排序
  let top = searchIngredientsByFlavor(target, pool, 12).filter(filter)
  // 语义配对增益（改为基于 desiredTags 的匹配分）
  const desired = Array.isArray(opts.desiredTags) ? opts.desiredTags : []
  if (desired.length > 0){
    top = [...top].sort((a,b)=> tagMatchScore(b, desired) - tagMatchScore(a, desired))
  }
  // 库存优先
  if (opts.preferInventory){
    top = reorderByInventory(top, opts.inventoryItems)
  }
  return top[0]
}

// 合成风味（按克/毫升占比权重）
function computeFlavorFromIngredients(list: Ingredient[], amts: number[]): FlavorVector{
  const out: FlavorVector = { sweet:0,sour:0,bitter:0,aroma:0,fruit:0,spicy:0,body:0 }
  const sum = Math.max(1, amts.reduce((a,b)=> a+b, 0))
  for (let i=0; i<list.length; i++){
    const it = list[i]
    const w = amts[i] / sum
    const fv = it.flavors || {}
    for (const k of FLAVOR_KEYS){ out[k] = clamp01(out[k] + w * Number((fv as any)[k] ?? 0)) }
  }
  return out
}

// 轻量配比微调：基于目标风味（通常为 palate），对部分角色进行小步调整
export function microTuneAmounts(list: Ingredient[], roleDefs: any[], amounts: number[], target: FlavorVector, opts?: { iterations?: number; stepMl?: number; keepTotal?: boolean }): number[]{
  const iterations = Math.max(1, Math.min(5, Number(opts?.iterations ?? 2)))
  const step = Math.max(1, Math.min(10, Number(opts?.stepMl ?? 5)))
  const keepTotal = !!opts?.keepTotal
  const out = [...amounts]
  function rolePrimaryDim(role: string): keyof FlavorVector | null{
    const r = String(role||'').toLowerCase()
    if (r.includes('citrus') || r.includes('sour')) return 'sour'
    if (r.includes('sweet') || r.includes('syrup')) return 'sweet'
    if (r.includes('bitter') || r.includes('bitters')) return 'bitter'
    if (r.includes('aroma') || r.includes('liqueur')) return 'aroma'
    return null
  }
  function compute(list2: Ingredient[], amts: number[]): FlavorVector{
    const sum = Math.max(1, amts.reduce((a,b)=> a+b, 0))
    const fv: FlavorVector = { sweet:0,sour:0,bitter:0,aroma:0,fruit:0,spicy:0,body:0 }
    for (let i=0;i<list2.length;i++){
      const w = amts[i]/sum
      const f = list2[i].flavors || {}
      for (const k of FLAVOR_KEYS){ fv[k] = clamp01(fv[k] + w * Number((f as any)[k] ?? 0)) }
    }
    return fv
  }
  function bestCompIndex(prefer: ('mixer'|'base')[]): number{
    const names = roleDefs.map((r:any)=> String(r.role||'').toLowerCase())
    for (const p of prefer){ const idx = names.findIndex(n=> n.includes(p)); if (idx>=0) return idx }
    return names.findIndex(n=> n.includes('base'))
  }
  const compIdx = bestCompIndex(['mixer','base'])
  for (let it=0; it<iterations; it++){
    const cur = compute(list, out)
    // 选择最大误差维度（排除 body）
    let maxDim: keyof FlavorVector = 'sweet'
    let maxErr = -1
    for (const k of FLAVOR_KEYS){ if (k==='body') continue; const e = Number(target[k]||0) - Number(cur[k]||0); if (Math.abs(e) > maxErr){ maxErr = Math.abs(e); maxDim = k } }
    if (maxErr <= 0.02) break
    // 找到与该维度相关的角色
    const idxs: number[] = []
    for (let i=0;i<roleDefs.length;i++){ const dim = rolePrimaryDim(String(roleDefs[i]?.role)); if (dim===maxDim) idxs.push(i) }
    if (idxs.length===0) break
    const sign = (Number(target[maxDim]||0) - Number(cur[maxDim]||0)) >= 0 ? +1 : -1
    const j = idxs[0]
    out[j] = Math.max(0, out[j] + sign * step)
    if (keepTotal && compIdx>=0 && compIdx!==j){ out[compIdx] = Math.max(0, out[compIdx] - sign * step) }
  }
  return out
}

// 生成创意模式配方（并行引擎）
export function generateRecipeCreative(options: GenerateCreativeOptions): Recipe {
  const mood = moods.find(m => m.key === options.moodKey)
  if (!mood) throw new Error(`Unknown mood: ${options.moodKey}`)

  const intent = deriveIntent(mood)
  const strategy = selectStrategy(mood, options.taste, { riskLevel: options.riskLevel, contrastThreshold: options.contrastThreshold })

  // 规范化与融合目标风味
  let targetPalate = mergeTarget(mood.targetFlavorBias || {}, options.taste)
  // 低糖：降低目标甜度并设置上限
  if (options.lowSugar){
    const reduce = Number(rules?.allergy_and_constraints?.low_sugar_preference?.reduce_sweetener_ratio ?? 0.30)
    const maxSweet = Number(rules?.allergy_and_constraints?.low_sugar_preference?.sweet_target_max ?? 0.35)
    targetPalate = { ...targetPalate, sweet: clamp01(Math.min(maxSweet, Number(targetPalate.sweet||0) * (1 - reduce))) }
  }

  const envelope = buildEnvelope(mood, strategy, targetPalate)

  // 新增：基于味谱先行推断风格标签提示
  const prelimStyle = chooseTasteStyleV4(envelope.palate, false)
  const styleHints = styleTagHints(prelimStyle)
  const flavorHints = flavorTagHints(envelope.palate as FlavorVector)

  let style = pickStyle(intent, strategy, !!options.na)
  const motif = chooseMotif(mood.key, strategy)
  // 如果母题偏好模板存在，覆盖模板选择
  if (motif && Array.isArray(motif.prefer_templates) && motif.prefer_templates.length>0){
    const catalog: any[] = Array.isArray(rules?.template_catalog) ? rules.template_catalog : []
    const link = (rules?.style_grammar?.linkage) || {}
    function has(id: string){ return catalog.some(t => toId(String(t.id)) === toId(id)) }
    const preferTpl = motif.prefer_templates.find(id => has(id))
    if (preferTpl){
      const t = catalog.find(c => toId(c.id) === toId(preferTpl)) || {}
      style = {
        template: preferTpl,
        method: String((link[preferTpl]?.method) || t.method || style.method),
        glass: String((link[preferTpl]?.glass) || t.default_glass || style.glass),
        roles: style.roles
      }
    }
  }
  const desiredTags = Array.isArray(motif?.tags) ? motif!.tags : []

  // 角色选材（增强：库存偏好）
  const roleDefs: any[] = Array.isArray(style.roles) ? style.roles : []
  const selected: Ingredient[] = []
  let amounts: number[] = []
  for (const r of roleDefs){
    const ing = pickIngredientForRole(String(r.role), envelope.palate, { na: !!options.na, allergies: options.allergies, desiredTags, preferInventory: !!options.preferInventory, inventoryItems: options.inventoryItems })
    if (ing){ selected.push(ing); amounts.push(Number(r.ml||0)) }
  }
  // 低糖：在微调前减少甜味用量
  amounts = applyLowSugarReduction(roleDefs, amounts, options.lowSugar)

  // 微调配比以贴近目标 palate（可配置）
  const mt = options.microTune ?? {}
  const enabled = mt.enabled !== false
  let iters = mt.iterations ?? 2
  let step = mt.stepMl ?? 5
  if (mt.intensity !== undefined){
    const map: Record<string,[number,number]> = { low:[1,3], medium:[2,5], high:[3,8] }
    if (typeof mt.intensity === 'string'){
      const pair = map[mt.intensity] || [iters, step]
      iters = pair[0]; step = pair[1]
    } else if (typeof mt.intensity === 'number'){
      const n = Math.max(1, Math.round(mt.intensity))
      iters = Math.max(1, Math.min(5, n))
      step = Math.max(2, Math.min(10, Math.round(2 + mt.intensity*3)))
    }
  }
  const tuned = enabled ? microTuneAmounts(selected, roleDefs, amounts, envelope.palate, { iterations: iters, stepMl: step, keepTotal: true }) : amounts

  // 风味合成
  const useSelected = selected
  const useAmounts = tuned
  const flavor = computeFlavorFromIngredients(useSelected, useAmounts)

  // 命名与叙事（v4）
  const hasSpark = useSelected.some(i=> isSparkling(i))
  const baseSpirit = (()=>{
    const base = useSelected.find(i=> String(i.category||'').toLowerCase()==='base' || String(i.category||'').toLowerCase()==='spirit')
    const id = String(base?.id || base?.name || '').toLowerCase()
    // 规范化为命名词库键
    const keys = Object.keys((rules?.naming_v2?.spirit_hints) || {})
    const hit = keys.find(k=> id.includes(k))
    return hit || ''
  })()
  const naming = generateNameAndNarrativeV4(mood, flavor, envelope, { hasSparkling: hasSpark, na: !!options.na, method: style.method, baseSpirit, variability: options.diversityTemperature, seedSalt: options.seedSession, modernity: Number(intent?.modernity ?? 0.5), riskLevel: options.riskLevel })
  const name = `${naming.nameZh} (${naming.nameEn})`
  const story = `${naming.narrativeZh}  EN: ${naming.narrativeEn}`

  // 新增：依据标签提示生成装饰
  const garnish = pickGarnishForHints(Array.from(new Set([...desiredTags, hasSpark?'sparkling':''])))

  const totalMl = Math.round(useAmounts.reduce((a,b)=> a+b, 0))
  const recipe: Recipe = {
    name,
    story,
    mood: mood.key,
    template: String(style.template || 'creative'),
    method: style.method,
    glass: style.glass,
    garnish,
    ingredients: useSelected.map((ing, idx) => ({ name: ing.name, amountMl: useAmounts[idx], abv: ing.abv } as RecipeIngredient)),
    totalMl,
    unit: 'ml',
    estimatedABV: 0, // 交由 finalizeRecipe 统一计算
    flavor,
  }

  return recipe
}