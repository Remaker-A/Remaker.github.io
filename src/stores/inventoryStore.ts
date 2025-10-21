import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type InventoryState = {
  items: string[]
  setItems: (items: string[]) => void
  addItem: (name: string) => void
  removeItem: (name: string) => void
  clear: () => void
}

export const useInventoryStore = create(
  persist<InventoryState>(
    (set) => ({
      items: [],
      setItems: (items) => set({ items }),
      addItem: (name) => set((s) => ({ items: s.items.includes(name) ? s.items : [...s.items, name] })),
      removeItem: (name) => set((s) => ({ items: s.items.filter((x) => x !== name) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'tare.inventory' }
  )
)