import type { AdminReport } from '../api/types'
import { formatMinutes } from '../overtime/time-preview'

export function AdminSummary({ report }: { report: AdminReport }) {
  return (
    <section className="admin-summary" aria-label="업무 연장 집계">
      <div className="summary-total" aria-label="전체 업무 연장 합계">
        <span>전체 업무 연장</span>
        <strong>{formatMinutes(report.totalMinutes)}</strong>
        <small>TOTAL EXTENDED</small>
      </div>
      <div className="summary-people">
        <span>기록 인원</span>
        <strong>{report.totalsByUser.length}명</strong>
      </div>
      <ul className="person-totals">
        {report.totalsByUser.map(({ user, totalMinutes }) => (
          <li key={user.id}>
            <span>{user.name}</span>
            <strong>{formatMinutes(totalMinutes)}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}
