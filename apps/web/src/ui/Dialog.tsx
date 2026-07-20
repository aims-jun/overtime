import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'

type DialogProps = {
  open: boolean
  title: string
  onClose: () => void
  className?: string
  children: ReactNode
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Dialog({ open, title, onClose, className, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const handleCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal()
    } else if (typeof dialog.showModal !== 'function') {
      dialog.setAttribute('open', '')
      dialog.addEventListener('keydown', handleKeyDown)
    }
    dialog.querySelector<HTMLElement>(focusableSelector)?.focus()

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('keydown', handleKeyDown)
      opener?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  const classes = ['app-dialog', className].filter(Boolean).join(' ')

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className={classes}>
      <header>
        <h2 id={titleId}>{title}</h2>
        <IconButton label="닫기" icon="close" type="button" onClick={onClose} />
      </header>
      {children}
    </dialog>
  )
}
