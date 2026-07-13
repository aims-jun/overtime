import type { AdminOvertimeRecord } from '../api/types'

export function AdminTable({ records }: { records: AdminOvertimeRecord[] }) {
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
    <div className="table-scroll" tabIndex={0} aria-label="업무 연장 내역 표, 가로로 스크롤 가능">
      <table className="admin-table">
        <thead>
          <tr>
            <th>근무일</th><th>직원</th><th>시간</th><th>추가 근무</th><th>업무 내용</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{record.workDate}</td>
              <td><strong>{record.user.name}</strong><small>{record.user.email}</small></td>
              <td>{record.startTime} – {record.endTime <= record.startTime ? '다음 날 ' : ''}{record.endTime}</td>
              <td>{record.durationMinutes}분</td>
              <td>{record.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
