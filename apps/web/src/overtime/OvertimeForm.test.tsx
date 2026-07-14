import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { OvertimeForm } from './OvertimeForm'

describe('OvertimeForm', () => {
  it('offers start and end times in 30-minute increments', () => {
    render(<OvertimeForm onSaved={vi.fn()} />)

    for (const label of ['시작 시간', '종료 시간']) {
      const select = screen.getByLabelText(label)
      const options = within(select).getAllByRole('option')

      expect(options).toHaveLength(48)
      expect(options[0]).toHaveTextContent('00:00')
      expect(options[1]).toHaveTextContent('00:30')
      expect(options[47]).toHaveTextContent('23:30')
      expect(
        within(select).queryByRole('option', { name: '18:10' }),
      ).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: '저장' }))

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
})
