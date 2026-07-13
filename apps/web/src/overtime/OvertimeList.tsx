import type { OvertimeRecord } from '../api/types'
import { formatMinutes } from './time-preview'

type Props = {
  records: OvertimeRecord[]
  deletingId?: string
  onEdit: (record: OvertimeRecord) => void
  onDelete: (record: OvertimeRecord) => void
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(`${value}T12:00:00+09:00`))
}

export function OvertimeList({ records, deletingId, onEdit, onDelete }: Props) {
  if (records.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">✓</span>
        <strong>이번 달 야근 기록이 없습니다</strong>
        <p>야근한 날이 생기면 위에서 바로 기록할 수 있어요.</p>
      </div>
    )
  }

  return (
    <ul className="record-list">
      {records.map((record) => {
        const nextDay = record.endTime <= record.startTime
        return (
          <li className="record-card" key={record.id}>
            <div className="record-date">
              <strong>{formatDate(record.workDate)}</strong>
              <span>{formatMinutes(record.durationMinutes)}</span>
            </div>
            <p className="record-time">
              {record.startTime} – {nextDay ? '다음 날 ' : ''}{record.endTime}
            </p>
            <p className="record-reason">{record.reason}</p>
            <div className="record-actions">
              <button type="button" onClick={() => onEdit(record)}>수정</button>
              <button
                className="danger-button"
                type="button"
                disabled={deletingId === record.id}
                onClick={() => onDelete(record)}
              >
                {deletingId === record.id ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
