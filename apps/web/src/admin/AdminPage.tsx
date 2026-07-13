import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, friendlyError } from '../api/http'
import type { AdminReport, AdminUser } from '../api/types'
import { AdminFilters } from './AdminFilters'
import { AdminSummary } from './AdminSummary'
import { AdminTable } from './AdminTable'
import { buildCsvUrl } from './csv-download'

function thisMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
  }).format(new Date())
}

export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '')
    ? params.get('month')!
    : thisMonth()
  const userId = params.get('userId') || undefined
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<AdminUser[]>('/api/admin/users'),
    retry: false,
  })
  const report = useQuery({
    queryKey: ['admin-report', month, userId],
    queryFn: () => {
      const query = new URLSearchParams({ month })
      if (userId) query.set('userId', userId)
      return api<AdminReport>(`/api/admin/reports?${query.toString()}`)
    },
    retry: false,
  })

  return (
    <main className="admin-page">
      <div className="admin-title">
        <div><span className="eyebrow">AIMS ADMIN</span><h1>업무 연장 현황</h1></div>
        <a className="csv-button" href={buildCsvUrl({ month, userId })}>내역 다운로드</a>
      </div>
      <AdminFilters
        month={month}
        userId={userId}
        users={users.data ?? []}
        onChange={(next) => {
          const query = new URLSearchParams({ month: next.month })
          if (next.userId) query.set('userId', next.userId)
          setParams(query)
        }}
      />
      {report.isPending ? <div className="status-card">보고서를 불러오는 중…</div> : null}
      {report.isError ? (
        <div className="status-card error-card" role="alert">
          <p>{friendlyError(report.error)}</p>
          <button type="button" onClick={() => report.refetch()}>다시 불러오기</button>
        </div>
      ) : null}
      {report.data ? (
        <><AdminSummary report={report.data} /><AdminTable records={report.data.records} /></>
      ) : null}
    </main>
  )
}
