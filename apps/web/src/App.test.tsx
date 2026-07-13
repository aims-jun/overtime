import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the product name', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '야근 기록' })).toBeInTheDocument()
  })
})
