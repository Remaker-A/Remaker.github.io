import { describe, it, expect } from 'vitest'
import { normalizeIngredient, normalizeMood, loadIngredients, loadMoods } from '../data'

describe('data loader normalization', () => {
  it('normalizes ingredient ABV from fraction to percent', () => {
    const raw = { name: 'Test Spirit', category: 'spirit', abv: 0.4, flavors: { body: 0.5 } }
    const ing = normalizeIngredient(raw)
    expect(ing.abv).toBe(40)
  })

  it('keeps percent ABV unchanged', () => {
    const raw = { name: 'Vodka', category: 'spirit', abv: 40 }
    const ing = normalizeIngredient(raw)
    expect(ing.abv).toBe(40)
  })

  it('maps mood id/name/displayName correctly', () => {
    const m1 = normalizeMood({ id: 'happy', targetFlavorBias: { sweet: 0.6 } })
    expect(m1.key).toBe('happy')
    expect(m1.displayName).toBe('happy')

    const m2 = normalizeMood({ key: 'calm', name: '宁静', targetFlavorBias: { bitter: 0.3 } })
    expect(m2.key).toBe('calm')
    expect(m2.displayName).toBe('宁静')
  })

  it('loads ingredients and moods without throwing', () => {
    const ings = loadIngredients()
    const moods = loadMoods()
    expect(Array.isArray(ings)).toBe(true)
    expect(Array.isArray(moods)).toBe(true)
  })
})