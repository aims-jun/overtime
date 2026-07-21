import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { AdminFilters } from './AdminFilters'

const globalStyles = readFileSync('src/styles/global.css', 'utf8')

describe('AdminFilters', () => {
  it('uses a centered service icon instead of the browser select arrow', () => {
    render(
      <AdminFilters
        month="2026-07"
        users={[{ id: 'user-1', name: '조영래', email: 'yrcho@aimskr.com' }]}
        onChange={vi.fn()}
      />,
    )

    const select = screen.getByLabelText('직원')
    const control = select.closest('.admin-select-control')

    expect(control).not.toBeNull()
    expect(control?.querySelector('svg')).toBeInTheDocument()
    expect(globalStyles).toMatch(
      /\.admin-select-control select \{[^}]*padding-right: 46px;[^}]*appearance: none;/,
    )
    expect(globalStyles).toMatch(
      /\.admin-select-control > svg \{[^}]*top: 50%;[^}]*right: 15px;[^}]*transform: translateY\(-50%\);[^}]*pointer-events: none;/,
    )
  })
})
