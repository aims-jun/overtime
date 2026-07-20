import type { AdminOvertimeRecord } from '../api/types'
import { formatMinutes } from '../overtime/time-preview'

function formatTime(record: AdminOvertimeRecord) {
  const nextDay = record.endTime <= record.startTime
  return `${record.startTime} – ${nextDay ? '다음 날 ' : ''}${record.endTime}`
}

export function AdminRecords({ records }: { records: AdminOvertimeRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="empty-state admin-empty">
        <span aria-hidden="true">–</span>
        <strong>조건에 맞는 업무 연장 내역이 없습니다</strong>
        <p>조회 월이나 직원을 바꿔보세요.</p>
      </div>
    )
  }

  return (
    <>
      <div className="admin-records-desktop">
        <table className="admin-table">
          <caption className="sr-only">업무 연장 내역</caption>
          <thead>
            <tr>
              <th>근무일</th><th>직원</th><th>시간</th><th>추가 근무</th><th>업무 내용</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.workDate}</td>
                <td><strong className="admin-person-name">{record.user.name}</strong><small>{record.user.email}</small></td>
                <td>{formatTime(record)}</td>
                <td>{formatMinutes(record.durationMinutes)}</td>
                <td>{record.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-records-mobile">
        <ul aria-label="모바일 업무 연장 내역">
          {records.map((record) => (
            <li className="admin-mobile-card" key={record.id}>
              <div className="admin-mobile-person">
                <strong className="admin-person-name">{record.user.name}</strong>
                <small>{record.user.email}</small>
              </div>
              <time dateTime={record.workDate}>{record.workDate}</time>
              <p className="admin-mobile-reason">{record.reason}</p>
              <strong className="admin-mobile-duration">{formatMinutes(record.durationMinutes)}</strong>
              <span className="admin-mobile-time">{formatTime(record)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
