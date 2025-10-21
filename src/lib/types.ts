export type FlavorKey = 'sweet' | 'sour' | 'bitter' | 'aroma' | 'fruit' | 'spicy' | 'body'

export type FlavorVector = Record<FlavorKey, number>

export type Ingredient = {
  id?: string
  name: string
  category: string
  abv?: number
  allergens?: string[]
  flavors?: Partial<FlavorVector>
}

export type MoodProfile = {
  key: string
  displayName: string
  targetFlavorBias: Partial<FlavorVector>
  methodBias?: string[]
  glassCandidates?: string[]
  baseCandidates?: string[]
  templateCandidates?: string[]
  abvPreference?: { target: number; range: [number, number] }
  namingHints?: string[]
}

export type RecipeIngredient = {
  name: string
  amountMl: number
  abv?: number
}

export type Recipe = {
  name: string
  story?: string
  mood: string
  template: string
  method: string
  glass: string
  ice?: string
  garnish?: string[]
  ingredients: RecipeIngredient[]
  totalMl: number
  unit: 'ml' | 'oz'
  estimatedABV: number
  estimatedCalories?: number
  flavor: FlavorVector
}