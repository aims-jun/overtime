import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

type DatePickerProps = {
  label: string
  value: string
  onChange: (value: string) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatValue(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function DatePicker({ label, value, onChange }: DatePickerProps) {
  const selected = parseDate(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(selected.year)
  const [viewMonth, setViewMonth] = useState(selected.month)
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
    setViewYear(selected.year)
    setViewMonth(selected.month)
    setOpen((current) => !current)
  }

  const moveMonth = (offset: number) => {
    const next = new Date(viewYear, viewMonth - 1 + offset, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth() + 1)
  }

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()

  return (
    <div className="date-picker" ref={rootRef}>
      <button
        className="date-picker-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span>{selected.year}년 {selected.month}월 {selected.day}일</span>
        <Icon name="calendar" size={18} />
      </button>

      {open ? (
        <div
          className="date-picker-popover"
          id={panelId}
          role="dialog"
          aria-label={`${label} 선택`}
        >
          <div className="date-picker-header">
            <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>
              <Icon name="chevron-left" size={18} />
            </button>
            <strong aria-live="polite">{viewYear}년 {viewMonth}월</strong>
            <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>
              <Icon name="chevron-right" size={18} />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className="date-picker-grid">
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span className="date-picker-empty" key={`empty-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1
              const isSelected = viewYear === selected.year
                && viewMonth === selected.month
                && day === selected.day
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={`${viewYear}년 ${viewMonth}월 ${day}일 선택`}
                  aria-pressed={isSelected}
                  className={isSelected ? 'is-selected' : undefined}
                  onClick={() => {
                    onChange(formatValue(viewYear, viewMonth, day))
                    setOpen(false)
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
