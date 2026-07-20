import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DatePicker } from './DatePicker'

describe('DatePicker', () => {
  it('opens on the selected month and emits a YYYY-MM-DD date', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <DatePicker
        label="근무 날짜"
        value="2026-07-13"
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('button', { name: '근무 날짜' }))
      .toHaveTextContent('2026년 7월 13일')

    await user.click(screen.getByRole('button', { name: '근무 날짜' }))

    expect(screen.getByRole('dialog', { name: '근무 날짜 선택' }))
      .toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: '2026년 7월 21일 선택' }),
    )

    expect(onChange).toHaveBeenCalledWith('2026-07-21')
    expect(screen.queryByRole('dialog', { name: '근무 날짜 선택' }))
      .not.toBeInTheDocument()
  })

  it('moves between months and closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <DatePicker
        label="근무 날짜"
        value="2026-07-13"
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '근무 날짜' }))
    await user.click(screen.getByRole('button', { name: '다음 달' }))

    expect(screen.getByText('2026년 8월')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '근무 날짜 선택' }))
      .not.toBeInTheDocument()
  })
})
