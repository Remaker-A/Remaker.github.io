import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlavorRadar } from '../FlavorRadar'

const flavor = { sweet:0.6, sour:0.3, bitter:0.2, aroma:0.5, fruit:0.4, spicy:0.1, body:0.5 }

describe('FlavorRadar', () => {
  it('renders labels and an SVG element', () => {
    render(<FlavorRadar vector={flavor} size={200} />)
    // labels
    ;['甜','酸','苦','花香','果香','气泡感','酒感'].forEach(l => {
      expect(screen.getByText(l)).toBeInTheDocument()
    })
    // svg exists
    const svg = document.querySelector('svg')
    expect(svg).toBeTruthy()
  })
})