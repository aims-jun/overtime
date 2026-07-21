import { useId, useMemo, useState } from 'react'
import type { AdminReport } from '../api/types'
import { formatMinutes } from '../overtime/time-preview'

export function AdminSummary({ report }: { report: AdminReport }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const rankedTotals = useMemo(
    () => report.totalsByUser
      .map((total, index) => ({ total, index }))
      .sort((left, right) =>
        right.total.totalMinutes - left.total.totalMinutes ||
        left.index - right.index,
      )
      .map(({ total }) => total)
      .slice(0, 10),
    [report.totalsByUser],
  )
  const visibleTotals = expanded ? rankedTotals : rankedTotals.slice(0, 3)

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
        <div className="summary-people-header">
          <span>직원별 합계</span>
          <strong>{rankedTotals.length}명</strong>
        </div>
        {rankedTotals.length === 0 ? (
          <p className="person-totals-empty">집계된 직원이 없습니다</p>
        ) : (
          <>
            <ol id={listId} className="person-totals" aria-label="직원별 업무 연장 합계">
              {visibleTotals.map(({ user, totalMinutes }, index) => (
                <li key={user.id}>
                  <span className="person-rank" aria-hidden="true">{index + 1}</span>
                  <span className="person-name">{user.name}</span>
                  <strong>{formatMinutes(totalMinutes)}</strong>
                </li>
              ))}
            </ol>
            {rankedTotals.length > 3 ? (
              <button
                className="person-totals-toggle"
                type="button"
                aria-controls={listId}
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? '접기' : `전체 ${rankedTotals.length}명 보기`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
