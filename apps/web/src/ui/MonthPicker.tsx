import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

type MonthPickerProps = {
  label: string
  value: string
  onChange: (value: string) => void
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

function parseMonth(value: string): { year: number; month: number } {
  const [year, month] = value.split('-').map(Number)
  return { year, month }
}

export function MonthPicker({ label, value, onChange }: MonthPickerProps) {
  const { year, month } = parseMonth(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const toggle = () => {
    setViewYear(year)
    setOpen((current) => !current)
  }

  const selectMonth = (nextMonth: number) => {
    onChange(`${viewYear}-${String(nextMonth).padStart(2, '0')}`)
    setOpen(false)
  }

  return (
    <div className="month-picker" ref={rootRef}>
      <button
        className="month-picker-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span>{year}년 {month}월</span>
        <Icon name="calendar" size={18} />
      </button>

      {open ? (
        <div
          className="month-picker-popover"
          id={panelId}
          role="dialog"
          aria-label={`${label} 선택`}
        >
          <div className="month-picker-year">
            <button
              type="button"
              aria-label="이전 연도"
              onClick={() => setViewYear((current) => current - 1)}
            >
              <Icon name="chevron-left" size={18} />
            </button>
            <strong aria-live="polite">{viewYear}년</strong>
            <button
              type="button"
              aria-label="다음 연도"
              onClick={() => setViewYear((current) => current + 1)}
            >
              <Icon name="chevron-right" size={18} />
            </button>
          </div>
          <div className="month-picker-grid">
            {MONTHS.map((item) => {
              const selected = viewYear === year && item === month
              return (
                <button
                  key={item}
                  type="button"
                  aria-label={`${viewYear}년 ${item}월 선택`}
                  aria-pressed={selected}
                  className={selected ? 'is-selected' : undefined}
                  onClick={() => selectMonth(item)}
                >
                  {item}월
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
