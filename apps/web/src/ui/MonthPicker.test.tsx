import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonthPicker } from './MonthPicker'

describe('MonthPicker', () => {
  it('opens a month selection dialog from its input-shaped trigger', async () => {
    const user = userEvent.setup()
    render(
      <MonthPicker
        label="조회 월"
        value="2026-07"
        onChange={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: '조회 월' })
    expect(trigger).toHaveTextContent('2026년 7월')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('dialog', { name: '조회 월 선택' }),
    ).toBeInTheDocument()
  })

  it('moves between years and returns the selected YYYY-MM value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MonthPicker label="조회 월" value="2026-07" onChange={onChange} />,
    )

    await user.click(screen.getByRole('button', { name: '조회 월' }))
    await user.click(screen.getByRole('button', { name: '다음 연도' }))
    expect(screen.getByText('2027년')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2027년 2월 선택' }))

    expect(onChange).toHaveBeenCalledWith('2027-02')
    expect(
      screen.queryByRole('dialog', { name: '조회 월 선택' }),
    ).not.toBeInTheDocument()
  })

  it('closes the month selection dialog with Escape', async () => {
    const user = userEvent.setup()
    render(
      <MonthPicker label="조회 월" value="2026-07" onChange={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: '조회 월' }))
    await user.keyboard('{Escape}')

    expect(
      screen.queryByRole('dialog', { name: '조회 월 선택' }),
    ).not.toBeInTheDocument()
  })
})
