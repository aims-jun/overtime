import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'
import { IconButton } from './IconButton'

describe('shared UI primitives', () => {
  it('labels icon-only buttons', () => {
    render(<IconButton label="내역 삭제" icon="trash" />)

    expect(screen.getByRole('button', { name: '내역 삭제' })).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveClass('icon-button')
  })

  it('closes with Escape and restores the opener focus', async () => {
    const user = userEvent.setup()

    function Fixture() {
      const [open, setOpen] = useState(false)

      return (
        <>
          <button onClick={() => setOpen(true)}>열기</button>
          <Dialog
            open={open}
            title="업무 시간 입력"
            onClose={() => setOpen(false)}
          >
            <button>저장</button>
          </Dialog>
        </>
      )
    }

    render(<Fixture />)
    const opener = screen.getByRole('button', { name: '열기' })
    await user.click(opener)

    expect(screen.getByRole('dialog', { name: '업무 시간 입력' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('locks document scrolling while the dialog is open', () => {
    const { rerender } = render(
      <Dialog open title="업무 시간 입력" onClose={() => undefined}>
        <button>저장</button>
      </Dialog>,
    )

    expect(document.documentElement).toHaveClass('dialog-open')

    rerender(
      <Dialog open={false} title="업무 시간 입력" onClose={() => undefined}>
        <button>저장</button>
      </Dialog>,
    )

    expect(document.documentElement).not.toHaveClass('dialog-open')
  })
})
