import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Recipe } from '../lib/types'

type RecipesState = {
  favorites: Recipe[]
  recent: Recipe[]
  addFavorite: (r: Recipe) => void
  removeFavorite: (name: string) => void
  pushRecent: (r: Recipe) => void
}

export const useRecipesStore = create(
  persist<RecipesState>(
    (set) => ({
      favorites: [],
      recent: [],
      addFavorite: (r) => set((s) => ({ favorites: s.favorites.find(f=>f.name===r.name)? s.favorites : [...s.favorites, r] })),
      removeFavorite: (name) => set((s) => ({ favorites: s.favorites.filter((f) => f.name !== name) })),
      pushRecent: (r) => set((s) => ({ recent: [r, ...s.recent].slice(0, 20) })),
    }),
    { name: 'tare.recipes' }
  )
)