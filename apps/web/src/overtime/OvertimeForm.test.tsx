import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { OvertimeForm } from './OvertimeForm'

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
