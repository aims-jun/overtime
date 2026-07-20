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

let scrollLockCount = 0
let lockedScrollY = 0

function lockDocumentScroll() {
  if (scrollLockCount === 0) {
    lockedScrollY = window.scrollY
    document.documentElement.style.setProperty(
      '--dialog-scroll-offset',
      `-${lockedScrollY}px`,
    )
    document.documentElement.classList.add('dialog-open')
  }
  scrollLockCount += 1
}

function unlockDocumentScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount > 0) return

  document.documentElement.classList.remove('dialog-open')
  document.documentElement.style.removeProperty('--dialog-scroll-offset')
  if (lockedScrollY > 0) window.scrollTo(0, lockedScrollY)
  lockedScrollY = 0
}

export function Dialog({ open, title, onClose, className, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    lockDocumentScroll()
    const handleCancel = (event: Event) => {
      event.preventDefault()
      onCloseRef.current()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      onCloseRef.current()
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
      unlockDocumentScroll()
      opener?.focus()
    }
  }, [open])

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
