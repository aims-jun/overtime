import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const record = {
  id: 'record-1',
  workDate: '2026-07-13',
  startTime: '22:30',
  endTime: '01:00',
  durationMinutes: 150,
  reason: '배포 대응',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
}

function useRecords(records = [record]) {
  server.use(
    http.get('/api/overtime', () =>
      HttpResponse.json({
        month: '2026-07',
        totalMinutes: records.reduce(
          (total, current) => total + current.durationMinutes,
          0,
        ),
        records,
      }),
    ),
  )
}

describe('OvertimePage', () => {
  it('shows a fixed-height skeleton while records load', () => {
    server.use(
      http.get('/api/overtime', () => new Promise(() => undefined)),
    )

    renderPage()

    expect(screen.getByLabelText('불러오는 중')).toHaveClass('status-skeleton')
    expect(screen.queryByText('기록을 불러오는 중…')).not.toBeInTheDocument()
  })

  it('shows an empty state for a month without records', async () => {
    server.use(
      http.get('/api/overtime', () =>
        HttpResponse.json({ month: '2026-07', records: [], totalMinutes: 0 }),
      ),
    )

    renderPage()

    expect(
      await screen.findByText('등록된 업무 연장 내역이 없습니다'),
    ).toBeInTheDocument()
    expect(screen.getByText('0시간')).toBeInTheDocument()
  })

  it('shows records and the server total', async () => {
    useRecords()

    renderPage()

    expect(await screen.findByText('배포 대응')).toBeInTheDocument()
    expect(screen.getByText('WORK LOG · JULY')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('선택한 달 업무 연장 합계')).getByText(
        '2시간 30분',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('22:30 – 다음 날 01:00')).toBeInTheDocument()
  })

  it('opens registration in a dialog without inserting an inline form', async () => {
    server.use(
      http.get('/api/overtime', () =>
        HttpResponse.json({ month: '2026-07', records: [], totalMinutes: 0 }),
      ),
    )
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByLabelText('업무 내용')).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole('button', { name: '추가 근무 등록' }),
    )

    expect(
      screen.getByRole('dialog', { name: '추가 근무 등록' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('업무 내용')).toBeInTheDocument()
    expect(document.querySelector('.form-surface')).not.toBeInTheDocument()
  })

  it('opens registration from the empty state action', async () => {
    useRecords([])
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: '첫 내역 등록하기' }),
    )

    expect(
      screen.getByRole('dialog', { name: '추가 근무 등록' }),
    ).toBeInTheDocument()
  })

  it('opens editing in the same dialog with a named icon action', async () => {
    useRecords()
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: '배포 대응 내역 수정' }),
    )

    expect(
      screen.getByRole('dialog', { name: '추가 근무 수정' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('업무 내용')).toHaveValue('배포 대응')
  })

  it('asks in a service dialog before deleting', async () => {
    useRecords()
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: '배포 대응 내역 삭제' }),
    )

    expect(
      screen.getByRole('dialog', { name: '내역을 삭제할까요?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제하기' })).toBeInTheDocument()
  })

  it('cancels deletion without sending a delete request', async () => {
    let deleteRequests = 0
    useRecords()
    server.use(
      http.delete('/api/overtime/:id', () => {
        deleteRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: '배포 대응 내역 삭제' }),
    )
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(
      screen.queryByRole('dialog', { name: '내역을 삭제할까요?' }),
    ).not.toBeInTheDocument()
    expect(deleteRequests).toBe(0)
  })

  it('deletes the pending record after confirmation', async () => {
    let deleteRequests = 0
    useRecords()
    server.use(
      http.delete('/api/overtime/:id', () => {
        deleteRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: '배포 대응 내역 삭제' }),
    )
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    await waitFor(() => expect(deleteRequests).toBe(1))
  })
})
