import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { OvertimeForm } from './OvertimeForm'

describe('OvertimeForm', () => {
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

    await user.clear(screen.getByLabelText('시작 시간'))
    await user.type(screen.getByLabelText('시작 시간'), '22:30')
    await user.clear(screen.getByLabelText('종료 시간'))
    await user.type(screen.getByLabelText('종료 시간'), '01:00')

    expect(screen.getByText('추가 근무 시간 2시간 30분')).toBeInTheDocument()
    expect(screen.getByText('종료 시간은 다음 날입니다')).toBeInTheDocument()
  })
})
