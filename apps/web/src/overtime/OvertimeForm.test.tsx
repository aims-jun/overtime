import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { OvertimeForm } from './OvertimeForm'

const globalStyles = readFileSync('src/styles/global.css', 'utf8')

const EXPECTED_TIME_OPTIONS = [
  '00:00',
  '00:30',
  '01:00',
  '01:30',
  '02:00',
  '02:30',
  '03:00',
  '03:30',
  '04:00',
  '04:30',
  '05:00',
  '05:30',
  '06:00',
  '06:30',
  '07:00',
  '07:30',
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
  '22:30',
  '23:00',
  '23:30',
]

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

describe('OvertimeForm', () => {
  it('uses the custom work date picker and submits its date', async () => {
    let submittedBody: unknown
    server.use(
      http.patch('/api/overtime/record-1', async ({ request }) => {
        submittedBody = await request.json()
        return HttpResponse.json({ ...record, workDate: '2026-07-21' })
      }),
    )
    const user = userEvent.setup()
    render(
      <OvertimeForm record={record} onSaved={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '근무 날짜' }))
    await user.click(
      screen.getByRole('button', { name: '2026년 7월 21일 선택' }),
    )
    await user.click(screen.getByRole('button', { name: '수정하기' }))

    expect(submittedBody).toMatchObject({ workDate: '2026-07-21' })
  })

  it('uses a centered svg icon between the time fields', () => {
    const { container } = render(<OvertimeForm onSaved={vi.fn()} />)
    const arrow = container.querySelector('.time-arrow')

    expect(arrow?.querySelector('svg')).toBeInTheDocument()
    expect(arrow).not.toHaveTextContent('→')
    expect(globalStyles).toMatch(
      /\.time-arrow \{[^}]*display: grid;[^}]*place-items: center;[^}]*line-height: 0;/,
    )
  })

  it('keeps both time inputs and the arrow in identical 48px slots', () => {
    expect(globalStyles).toMatch(
      /\.time-fields select,\s*\.time-arrow \{ height: 48px; \}/,
    )
    expect(globalStyles).toMatch(
      /\.time-arrow \{[^}]*display: grid;[^}]*place-items: center;[^}]*align-self: end;/,
    )
  })

  it('rotates only the arrow icon when time fields stack', () => {
    expect(globalStyles).toMatch(
      /@media \(max-width: 359px\) \{[\s\S]*\.time-arrow \{[^}]*width: 100%;[^}]*height: 48px;[^}]*\}[\s\S]*\.time-arrow svg \{ transform: rotate\(90deg\); \}/,
    )
    expect(globalStyles).not.toMatch(
      /@media \(max-width: 359px\) \{[\s\S]*\.time-arrow \{[^}]*transform:/,
    )
  })

  it('allows native form controls and the mobile dialog to shrink to the viewport', () => {
    expect(globalStyles).toContain(
      '.record-form > *, .time-fields > * { min-width: 0; max-width: 100%; }',
    )
    expect(globalStyles).toMatch(
      /\.field input, \.field textarea, \.field select,[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/,
    )
    expect(globalStyles).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*\.app-dialog \{[\s\S]*width: min\(100%, 100dvw\);[\s\S]*max-width: 100dvw;/,
    )
  })

  it('offers start and end times in 30-minute increments', () => {
    render(<OvertimeForm onSaved={vi.fn()} />)

    expect(screen.queryByText('NEW WORK LOG')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장하기' })).toBeInTheDocument()

    for (const label of ['시작 시간', '종료 시간']) {
      const select = screen.getByLabelText(label)
      const options = within(select).getAllByRole('option')

      expect(options.map((option) => option.getAttribute('value'))).toEqual(
        EXPECTED_TIME_OPTIONS,
      )
    }

    expect(screen.getByLabelText('시작 시간')).toHaveValue('18:00')
    expect(screen.getByLabelText('종료 시간')).toHaveValue('19:00')
  })

  it('keeps entered values and explains a failed save', async () => {
    server.use(
      http.post('/api/overtime', () =>
        HttpResponse.json({ code: 'SERVER_ERROR' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    render(<OvertimeForm onSaved={vi.fn()} />)

    await user.type(screen.getByLabelText('업무 내용'), '배포 대응')
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    expect(screen.getByLabelText('업무 내용')).toHaveValue('배포 대응')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '잠시 후 다시 시도해주세요',
    )
  })

  it('previews time across midnight', async () => {
    const user = userEvent.setup()
    render(<OvertimeForm onSaved={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('시작 시간'), '22:30')
    await user.selectOptions(screen.getByLabelText('종료 시간'), '01:00')

    expect(screen.getByText('추가 근무 시간 2시간 30분')).toBeInTheDocument()
    expect(screen.getByText('종료 시간은 다음 날입니다')).toBeInTheDocument()
  })

  it('uses edit and cancel copy without a duplicated eyebrow', () => {
    render(
      <OvertimeForm record={record} onSaved={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.queryByText('EDIT WORK LOG')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수정하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })
})
