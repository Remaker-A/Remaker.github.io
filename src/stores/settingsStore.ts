import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Unit = 'ml' | 'oz'

type SettingsState = {
  unit: Unit
  naMode: boolean
  lowSugar: boolean
  allergies: string[]
  setUnit: (u: Unit) => void
  setNaMode: (v: boolean) => void
  setLowSugar: (v: boolean) => void
  setAllergies: (a: string[]) => void
}

export const useSettingsStore = create(
  persist<SettingsState>(
    (set) => ({
      unit: 'ml',
      naMode: false,
      lowSugar: false,
      allergies: [],
      setUnit: (u) => set({ unit: u }),
      setNaMode: (v) => set({ naMode: v }),
      setLowSugar: (v) => set({ lowSugar: v }),
      setAllergies: (a) => set({ allergies: a }),
    }),
    { name: 'tare.settings' }
  )
)