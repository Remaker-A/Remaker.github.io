import { describe, it, expect } from 'vitest'
import { generateRecipe } from '../generator'

const dims = ['sweet','sour','bitter','aroma','fruit','spicy','body'] as const

describe('generateRecipe', () => {
  it('throws when moodKey not found', () => {
    expect(() => generateRecipe({ moodKey: 'unknown' })).toThrow()
  })

  it('returns a recipe with basic shape', () => {
    const r = generateRecipe({ moodKey: 'happy' })
    expect(r).toBeTruthy()
    expect(r.name).toBeTypeOf('string')
    expect(r.method).toBeTypeOf('string')
    expect(r.glass).toBeTypeOf('string')
    expect(r.ingredients).toBeInstanceOf(Array)
    expect(r.flavor).toBeTypeOf('object')

    // flavor vector in [0,1]
    for (const k of dims){
      expect(r.flavor[k]).toBeGreaterThanOrEqual(0)
      expect(r.flavor[k]).toBeLessThanOrEqual(1)
    }
  })

  it('respects NA mode by setting ABV to 0', () => {
    const r = generateRecipe({ moodKey: 'happy', na: true })
    expect(r.estimatedABV).toBe(0)
    for (const ing of r.ingredients){
      expect(ing.abv || 0).toBe(0)
    }
  })

  it('reduces sweetness when lowSugar is true', () => {
    const rNormal = generateRecipe({ moodKey: 'happy' })
    const rLowSugar = generateRecipe({ moodKey: 'happy', lowSugar: true })
    expect(rLowSugar.flavor.sweet).toBeLessThanOrEqual(rNormal.flavor.sweet)
  })
})