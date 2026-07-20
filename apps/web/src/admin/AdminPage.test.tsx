/// <reference types="node" />

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { AdminPage } from './AdminPage'

const globalStyles = readFileSync('src/styles/global.css', 'utf8')

function renderPage(url = '/admin?month=2026-07&userId=user-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminPage', () => {
  it('shows a fixed-height skeleton while the report loads', () => {
    server.use(
      http.get('/api/admin/users', () => HttpResponse.json([])),
      http.get('/api/admin/reports', () => new Promise(() => undefined)),
    )

    renderPage('/admin?month=2026-07')

    expect(screen.getByLabelText('불러오는 중')).toHaveClass('status-skeleton')
    expect(screen.queryByText('보고서를 불러오는 중…')).not.toBeInTheDocument()
    expect(globalStyles).toMatch(/\.status-skeleton \{[\s\S]*height: 170px;/)
  })

  it('switches to wrapping mobile records before the desktop table can overflow', () => {
    expect(globalStyles).toMatch(
      /@media \(max-width: 875px\) \{[\s\S]*\.admin-records-desktop \{ display: none; \}[\s\S]*\.admin-records-mobile \{ display: block; \}/,
    )
    expect(globalStyles).toContain('.admin-mobile-card > * { min-width: 0; }')
    expect(globalStyles).toContain(
      '.admin-mobile-person small, .admin-mobile-reason { overflow-wrap: anywhere; }',
    )
  })

  it('shows synchronized report totals, rows, and Excel filter URL', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json([
          { id: 'user-1', name: '김직원', email: 'worker@company.com' },
        ]),
      ),
      http.get('/api/admin/reports', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('month')).toBe('2026-07')
        expect(url.searchParams.get('userId')).toBe('user-1')
        return HttpResponse.json({
          month: '2026-07',
          userId: 'user-1',
          totalMinutes: 60,
          totalsByUser: [
            {
              user: { id: 'user-1', name: '김직원', email: 'worker@company.com' },
              totalMinutes: 60,
            },
          ],
          records: [
            {
              id: 'record-1',
              user: { id: 'user-1', name: '김직원', email: 'worker@company.com' },
              workDate: '2026-07-13',
              startTime: '22:30',
              endTime: '01:00',
              durationMinutes: 60,
              reason: '배포 대응',
            },
          ],
        })
      }),
    )

    renderPage()

    expect(
      await screen.findByRole('heading', { name: '업무 연장 현황' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('등록 건수')).toBeInTheDocument()
    expect(screen.getByText('1건')).toBeInTheDocument()

    const total = screen.getByLabelText('전체 업무 연장 합계')
    expect(within(total).getByText('1시간')).toBeInTheDocument()
    expect(within(total).queryByText('TOTAL EXTENDED')).not.toBeInTheDocument()
    expect(within(total).queryByText('60분')).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: '업무 연장 내역' })
    const recordRow = within(table).getByText('배포 대응').closest('tr')
    expect(recordRow).not.toBeNull()
    expect(within(recordRow!).getByText('1시간')).toBeInTheDocument()
    expect(within(recordRow!).queryByText('60분')).not.toBeInTheDocument()

    const mobileList = screen.getByLabelText('모바일 업무 연장 내역')
    expect(within(mobileList).getByText('배포 대응')).toBeInTheDocument()
    expect(within(mobileList).getByText('김직원')).toBeInTheDocument()
    expect(within(mobileList).getByText('worker@company.com')).toBeInTheDocument()
    expect(within(mobileList).getByText('22:30 – 다음 날 01:00')).toBeInTheDocument()
    expect(within(mobileList).getByText('1시간')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Excel 다운로드' })).toHaveAttribute(
      'href',
      '/api/admin/reports.xlsx?month=2026-07&userId=user-1',
    )
  })

  it('keeps the report visible and announces refresh progress while filters change', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json([
          { id: 'user-1', name: '김직원', email: 'worker@company.com' },
        ]),
      ),
      http.get('/api/admin/reports', ({ request }) => {
        const month = new URL(request.url).searchParams.get('month')
        if (month === '2026-06') return new Promise(() => undefined)
        return HttpResponse.json({
          month,
          totalMinutes: 60,
          totalsByUser: [],
          records: [{
            id: 'record-1',
            user: { id: 'user-1', name: '김직원', email: 'worker@company.com' },
            workDate: '2026-07-13', startTime: '22:30', endTime: '23:30',
            durationMinutes: 60, reason: '배포 대응',
          }],
        })
      }),
    )
    const user = userEvent.setup()
    renderPage('/admin?month=2026-07')

    expect((await screen.findAllByText('배포 대응')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '조회 월' }))
    await user.click(
      screen.getByRole('button', { name: '2026년 6월 선택' }),
    )

    expect(screen.getAllByText('배포 대응').length).toBeGreaterThan(0)
    expect(screen.getByRole('status', { name: '보고서를 새로 불러오는 중' }))
      .toBeInTheDocument()
  })

  it('shows a retry action when the employee filter cannot load', async () => {
    let attempts = 0
    server.use(
      http.get('/api/admin/users', () => {
        attempts += 1
        return attempts === 1
          ? HttpResponse.json({ message: 'failed' }, { status: 500 })
          : HttpResponse.json([])
      }),
      http.get('/api/admin/reports', () =>
        HttpResponse.json({
          month: '2026-07', totalMinutes: 0, totalsByUser: [], records: [],
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage('/admin?month=2026-07')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '직원 목록을 불러오지 못했습니다',
    )
    await user.click(screen.getByRole('button', { name: '직원 목록 다시 불러오기' }))

    expect(attempts).toBe(2)
  })

  it('uses the light lime treatment for the primary admin total', () => {
    expect(globalStyles).toMatch(
      /\.summary-total \{[^}]*color: var\(--ink\);[^}]*background: var\(--lime-soft\) !important;/,
    )
  })

  it('uses readable employee name hierarchy in every admin view', () => {
    expect(globalStyles).toMatch(
      /\.person-name \{[^}]*font-size: 15px;[^}]*font-weight: 800;/,
    )
    expect(globalStyles).toMatch(
      /\.admin-person-name \{[^}]*font-size: 15px;[^}]*font-weight: 800;/,
    )
  })

  it('shows an empty report state', async () => {
    server.use(
      http.get('/api/admin/users', () => HttpResponse.json([])),
      http.get('/api/admin/reports', () =>
        HttpResponse.json({
          month: '2026-07',
          totalMinutes: 0,
          totalsByUser: [],
          records: [],
        }),
      ),
    )

    renderPage('/admin?month=2026-07')

    expect(
      await screen.findByText('조건에 맞는 업무 연장 내역이 없습니다'),
    ).toBeInTheDocument()
  })
})
