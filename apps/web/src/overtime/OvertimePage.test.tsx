import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { OvertimePage } from './OvertimePage'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <OvertimePage />
    </QueryClientProvider>,
  )
}

describe('OvertimePage', () => {
  it('shows an empty state for a month without records', async () => {
    server.use(
      http.get('/api/overtime', () =>
        HttpResponse.json({ month: '2026-07', records: [], totalMinutes: 0 }),
      ),
    )

    renderPage()

    expect(
      await screen.findByText('이번 달 야근 기록이 없습니다'),
    ).toBeInTheDocument()
    expect(screen.getByText('총 0시간')).toBeInTheDocument()
  })

  it('shows records and the server total', async () => {
    server.use(
      http.get('/api/overtime', () =>
        HttpResponse.json({
          month: '2026-07',
          totalMinutes: 150,
          records: [
            {
              id: 'record-1',
              workDate: '2026-07-13',
              startTime: '22:30',
              endTime: '01:00',
              durationMinutes: 150,
              reason: '배포 대응',
              createdAt: '2026-07-13T00:00:00.000Z',
              updatedAt: '2026-07-13T00:00:00.000Z',
            },
          ],
        }),
      ),
    )

    renderPage()

    expect(await screen.findByText('배포 대응')).toBeInTheDocument()
    expect(screen.getByText('총 2시간 30분')).toBeInTheDocument()
    expect(screen.getByText('22:30 – 다음 날 01:00')).toBeInTheDocument()
  })
})
