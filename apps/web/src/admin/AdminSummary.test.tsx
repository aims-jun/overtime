import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminReport } from '../api/types'
import { AdminSummary } from './AdminSummary'

const report: AdminReport = {
  month: '2026-07',
  totalMinutes: 540,
  records: [],
  totalsByUser: [
    { user: { id: 'u1', name: '첫째', email: '1@aimskr.com' }, totalMinutes: 60 },
    { user: { id: 'u2', name: '둘째', email: '2@aimskr.com' }, totalMinutes: 180 },
    { user: { id: 'u3', name: '셋째', email: '3@aimskr.com' }, totalMinutes: 120 },
    { user: { id: 'u4', name: '넷째', email: '4@aimskr.com' }, totalMinutes: 90 },
    { user: { id: 'u5', name: '다섯째', email: '5@aimskr.com' }, totalMinutes: 90 },
  ],
}

describe('AdminSummary', () => {
  it('shows the stable top three and expands the full employee list', async () => {
    const user = userEvent.setup()
    render(<AdminSummary report={report} />)

    const list = screen.getByRole('list', { name: '직원별 업무 연장 합계' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getAllByText(/째$/).map((node) => node.textContent))
      .toEqual(['둘째', '셋째', '넷째'])
    expect(screen.queryByText('다섯째')).not.toBeInTheDocument()

    const expand = screen.getByRole('button', { name: '전체 5명 보기' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)

    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getAllByText(/째$/).map((node) => node.textContent))
      .toEqual(['둘째', '셋째', '넷째', '다섯째', '첫째'])
    expect(screen.getByRole('button', { name: '접기' }))
      .toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: '접기' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('omits the toggle for three or fewer employees', () => {
    render(
      <AdminSummary report={{ ...report, totalsByUser: report.totalsByUser.slice(0, 3) }} />,
    )

    expect(screen.queryByRole('button', { name: /전체 .*명 보기/ }))
      .not.toBeInTheDocument()
  })

  it('caps the expanded employee summary at ten people', async () => {
    const user = userEvent.setup()
    const cappedReport: AdminReport = {
      ...report,
      totalsByUser: Array.from({ length: 11 }, (_, index) => ({
        user: {
          id: `cap-${index + 1}`,
          name: `직원 ${index + 1}`,
          email: `cap-${index + 1}@aimskr.com`,
        },
        totalMinutes: 110 - index,
      })),
    }
    render(<AdminSummary report={cappedReport} />)

    const peopleSummary = screen.getByText('직원별 합계').parentElement
    expect(within(peopleSummary!).getByText('10명')).toBeInTheDocument()

    const expand = screen.getByRole('button', { name: '전체 10명 보기' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)

    const list = screen.getByRole('list', { name: '직원별 업무 연장 합계' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.queryByText('직원 11')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '접기' }))
      .toHaveAttribute('aria-expanded', 'true')
  })

  it('shows an explicit empty employee summary', () => {
    render(<AdminSummary report={{ ...report, totalsByUser: [] }} />)

    expect(screen.getByText('집계된 직원이 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '직원별 업무 연장 합계' }))
      .not.toBeInTheDocument()
  })
})
