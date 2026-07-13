import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { AdminPage } from './AdminPage'

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
  it('shows synchronized report totals, rows, and CSV filter URL', async () => {
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
          totalMinutes: 150,
          totalsByUser: [
            {
              user: { id: 'user-1', name: '김직원', email: 'worker@company.com' },
              totalMinutes: 150,
            },
          ],
          records: [
            {
              id: 'record-1',
              user: { id: 'user-1', name: '김직원', email: 'worker@company.com' },
              workDate: '2026-07-13',
              startTime: '22:30',
              endTime: '01:00',
              durationMinutes: 150,
              reason: '배포 대응',
            },
          ],
        })
      }),
    )

    renderPage()

    expect(await screen.findByText('배포 대응')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '업무 연장 현황' }),
    ).toBeInTheDocument()
    const total = screen.getByLabelText('전체 업무 연장 합계')
    expect(within(total).getByText('2시간 30분')).toBeInTheDocument()
    expect(within(total).getByText('150분')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내역 다운로드' })).toHaveAttribute(
      'href',
      '/api/admin/reports.csv?month=2026-07&userId=user-1',
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
