import type { AdminReport } from '../api/types'
import { formatMinutes } from '../overtime/time-preview'

export function AdminSummary({ report }: { report: AdminReport }) {
  return (
    <section className="admin-summary" aria-label="업무 연장 집계">
      <div className="summary-total" aria-label="전체 업무 연장 합계">
        <span>전체 업무 연장</span>
        <strong>{formatMinutes(report.totalMinutes)}</strong>
      </div>
      <div className="summary-count">
        <span>등록 건수</span>
        <strong>{report.records.length}건</strong>
      </div>
      <div className="summary-people">
        <span>직원별 합계</span>
        <ul className="person-totals">
          {report.totalsByUser.map(({ user, totalMinutes }) => (
            <li key={user.id}>
              <span className="person-name">{user.name}</span>
              <strong>{formatMinutes(totalMinutes)}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
