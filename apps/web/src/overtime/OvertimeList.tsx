import type { OvertimeRecord } from '../api/types'
import { IconButton } from '../ui/IconButton'
import { formatMinutes } from './time-preview'

type Props = {
  records: OvertimeRecord[]
  deletingId?: string
  onAdd: () => void
  onEdit: (record: OvertimeRecord) => void
  onDelete: (record: OvertimeRecord) => void
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00+09:00`)
  return {
    month: new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      timeZone: 'Asia/Seoul',
    }).format(date),
    day: new Intl.DateTimeFormat('ko-KR', {
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    }).format(date).replace('일', ''),
    weekday: new Intl.DateTimeFormat('ko-KR', {
      weekday: 'short',
      timeZone: 'Asia/Seoul',
    }).format(date),
  }
}

export function OvertimeList({
  records,
  deletingId,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  if (records.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">✓</span>
        <strong>등록된 업무 연장 내역이 없습니다</strong>
        <p>첫 내역을 등록하고 추가 근무 시간을 기록해보세요.</p>
        <button className="empty-add-button" type="button" onClick={onAdd}>
          첫 내역 등록하기
        </button>
      </div>
    )
  }

  return (
    <ul className="record-list">
      {records.map((record) => {
        const nextDay = record.endTime <= record.startTime
        const date = formatDate(record.workDate)
        return (
          <li className="record-card" key={record.id}>
            <div className="record-date">
              <span>{date.month}</span>
              <strong>{date.day}</strong>
              <small>{date.weekday}</small>
            </div>
            <div className="record-content">
              <p className="record-reason">{record.reason}</p>
              <div className="record-meta">
                <span className="record-time">
                  {record.startTime} – {nextDay ? '다음 날 ' : ''}{record.endTime}
                </span>
                <span>{formatMinutes(record.durationMinutes)}</span>
              </div>
            </div>
            <div className="record-actions">
              <IconButton
                label={`${record.reason} 내역 수정`}
                icon="edit"
                type="button"
                onClick={() => onEdit(record)}
              />
              <IconButton
                label={`${record.reason} 내역 삭제`}
                icon="trash"
                tone="danger"
                type="button"
                disabled={deletingId === record.id}
                onClick={() => onDelete(record)}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
